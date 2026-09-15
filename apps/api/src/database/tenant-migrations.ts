import 'dotenv/config';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { ControlDatabaseService } from './control-database.service.js';

export type TenantDatabase = { slug: string; dbName: string };

// First Prisma tenant migration. Databases migrated by the retired hand-rolled
// runner have tables but no _prisma_migrations ledger; prisma migrate deploy
// refuses those (P3005), so the runner baselines them with
// `prisma migrate resolve --applied` first, like db:baseline does for control.
export const BASELINE_MIGRATION = '20260912000000_students';

export function tenantDatabaseUrl(dbName: string): string {
  if (dbName === (process.env.CONTROL_DB_NAME ?? 'control_db')) {
    throw new Error('Tenant database name must not be the control database');
  }
  const user = encodeURIComponent(process.env.POSTGRES_USER ?? 'classora');
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? 'change-me');
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  const port = process.env.POSTGRES_PORT ?? '5432';
  return `postgresql://${user}:${password}@${host}:${port}/${encodeURIComponent(dbName)}`;
}

async function tenantDatabaseState(
  dbName: string,
): Promise<{ prismaLedger: boolean; legacyLedger: boolean; students: boolean; tables: boolean }> {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: dbName,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  try {
    const result = await pool.query<{
      prismaLedger: boolean;
      legacyLedger: boolean;
      students: boolean;
      tables: boolean;
    }>(
      `SELECT
         to_regclass('public._prisma_migrations') IS NOT NULL AS "prismaLedger",
         to_regclass('public._classora_tenant_migrations') IS NOT NULL AS "legacyLedger",
         to_regclass('public.students') IS NOT NULL AS students,
         EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public') AS tables`,
    );
    return result.rows[0];
  } finally {
    await pool.end();
  }
}

function runPrisma(args: string[], dbName: string): Promise<void> {
  const appRoot = fileURLToPath(new URL('../..', import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['node_modules/prisma/build/index.js', ...args, '--config', 'prisma/tenant/prisma.config.ts'],
      {
        cwd: appRoot,
        env: { ...process.env, DATABASE_URL: tenantDatabaseUrl(dbName) },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout?.on('data', (chunk) => (output += chunk));
    child.stderr?.on('data', (chunk) => (output += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      // Prisma errors can echo the connection URL; never report it verbatim.
      const detail = output.trim().replace(/postgresql:\/\/\S+/g, 'postgresql://***');
      reject(new Error(detail || `prisma ${args.join(' ')} exited with code ${code}`));
    });
  });
}

export async function deployTenantSchema(
  dbName: string,
  state: (dbName: string) => Promise<{
    prismaLedger: boolean;
    legacyLedger: boolean;
    students: boolean;
    tables: boolean;
  }> = tenantDatabaseState,
  prisma: (args: string[], dbName: string) => Promise<void> = runPrisma,
): Promise<void> {
  const { prismaLedger, legacyLedger, students, tables } = await state(dbName);
  if (!prismaLedger && legacyLedger && students) {
    await prisma(['migrate', 'resolve', '--applied', BASELINE_MIGRATION], dbName);
  } else if (!prismaLedger && tables) {
    throw new Error('Tenant database has an unknown schema and cannot be baselined');
  }
  await prisma(['migrate', 'deploy'], dbName);
}

export async function migrateTenantDatabases(
  tenants: TenantDatabase[],
  deploy: (dbName: string) => Promise<void> = deployTenantSchema,
) {
  for (const tenant of tenants) {
    const startedAt = Date.now();
    const duration = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
    console.log(`[tenant ${tenant.slug}] migrating database "${tenant.dbName}"`);
    try {
      await deploy(tenant.dbName);
      console.log(`[tenant ${tenant.slug}] done in ${duration()}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`[tenant ${tenant.slug}] migration failed after ${duration()}: ${detail}`);
    }
  }
}

async function migrateAllTenantDatabases() {
  const control = new ControlDatabaseService();
  try {
    const tenants = await control.tenant.findMany({
      select: { slug: true, dbName: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    console.log(`Migrating ${tenants.length} tenant database(s)`);
    await migrateTenantDatabases(tenants);
  } finally {
    await control.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  void migrateAllTenantDatabases().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
