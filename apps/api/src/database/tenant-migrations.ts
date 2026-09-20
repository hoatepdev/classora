import 'dotenv/config';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { ControlDatabaseService } from './control-database.service.js';
import { postgresConfig, tenantDatabaseUrl as buildTenantDatabaseUrl } from '../config.js';
import { isValidTenantSlug } from '../tenant/tenant-resolver.service.js';

export type TenantDatabase = { slug: string; dbName: string };

export function validateTenantDatabase(tenant: TenantDatabase): void {
  const config = postgresConfig();
  const expectedDatabase = `classora_tenant_${tenant.slug}`;
  if (!isValidTenantSlug(tenant.slug)) {
    throw new Error(`Invalid tenant slug in registry: ${tenant.slug}`);
  }
  if (tenant.dbName !== expectedDatabase) {
    throw new Error(
      `Tenant database mapping does not match the trusted tenant slug: ${tenant.slug} -> ${tenant.dbName}`,
    );
  }
  if (tenant.dbName === config.controlDatabase) {
    throw new Error(`Tenant database must not be the control database: ${tenant.dbName}`);
  }
  if (tenant.dbName === config.postgresDatabase) {
    throw new Error(`Tenant database must not be the PostgreSQL default database: ${tenant.dbName}`);
  }
}

// First Prisma tenant migration. Databases migrated by the retired hand-rolled
// runner have tables but no _prisma_migrations ledger; prisma migrate deploy
// refuses those (P3005), so the runner baselines them with
// `prisma migrate resolve --applied` first, like db:baseline does for control.
export const BASELINE_MIGRATION = '20260912000000_students';

export function tenantDatabaseUrl(dbName: string): string {
  const config = postgresConfig();
  if (dbName === config.controlDatabase) {
    throw new Error('Tenant database name must not be the control database');
  }
  if (dbName === config.postgresDatabase) {
    throw new Error('Tenant database name must not be the PostgreSQL default database');
  }
  return buildTenantDatabaseUrl(dbName);
}

type TenantDatabaseState = {
  prismaLedger: boolean;
  legacyLedger: boolean;
  legacyMigrations: Array<{ version: number; name: string }>;
  legacyCatalogMatches: boolean;
  students: boolean;
  tables: boolean;
};

async function tenantDatabaseState(dbName: string): Promise<TenantDatabaseState> {
  const config = postgresConfig();
  const pool = new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: dbName,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  try {
    const result = await pool.query<Omit<TenantDatabaseState, 'legacyMigrations'>>(
      `SELECT
         to_regclass('public._prisma_migrations') IS NOT NULL AS "prismaLedger",
         to_regclass('public._classora_tenant_migrations') IS NOT NULL AS "legacyLedger",
         to_regclass('public.students') IS NOT NULL AS students,
         EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public') AS tables`,
    );
    const state = result.rows[0];
    const legacyCatalogMatches = await matchesLegacyStudentsCatalog(pool);

    const legacyMigrations = state.legacyLedger
      ? (
          await pool.query<{ version: number; name: string }>(
            'SELECT version, name FROM _classora_tenant_migrations ORDER BY version',
          )
        ).rows
      : [];
    return { ...state, legacyMigrations, legacyCatalogMatches };
  } finally {
    await pool.end();
  }
}

async function matchesLegacyStudentsCatalog(pool: Pick<Pool, 'query'>): Promise<boolean> {
  const result = await pool.query<{ matches: boolean }>(`
    WITH expected_columns (column_name, ordinal_position, data_type, character_maximum_length, is_nullable, column_default) AS (
      VALUES
        ('id', '1', 'character', '26', 'NO', NULL),
        ('tenant_id', '2', 'character', '26', 'NO', NULL),
        ('code', '3', 'text', NULL, 'NO', NULL),
        ('full_name', '4', 'text', NULL, 'NO', NULL),
        ('phone', '5', 'text', NULL, 'YES', NULL),
        ('email', '6', 'text', NULL, 'YES', NULL),
        ('date_of_birth', '7', 'date', NULL, 'YES', NULL),
        ('status', '8', 'text', NULL, 'NO', '''ACTIVE''::text'),
        ('created_at', '9', 'timestamp with time zone', NULL, 'NO', 'CURRENT_TIMESTAMP'),
        ('updated_at', '10', 'timestamp with time zone', NULL, 'NO', 'CURRENT_TIMESTAMP')
    ),
    actual_columns AS (
      SELECT
        column_name::text,
        ordinal_position::text,
        data_type::text,
        character_maximum_length::text,
        is_nullable::text,
        column_default::text
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'students'
    ),
    expected_constraints (table_name, constraint_name, constraint_type, definition) AS (
      VALUES
        ('students', 'students_pkey', 'PRIMARY KEY', 'PRIMARY KEY (id)'),
        ('students', 'students_tenant_id_code_key', 'UNIQUE', 'UNIQUE (tenant_id, code)'),
        ('students', 'students_status_check', 'CHECK', $$CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'DISABLED'::text])))$$),
        ('_classora_tenant_migrations', '_classora_tenant_migrations_pkey', 'PRIMARY KEY', 'PRIMARY KEY (version)')
    ),
    actual_constraints AS (
      SELECT
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        pg_get_constraintdef(pc.oid) AS definition
      FROM information_schema.table_constraints tc
      JOIN pg_constraint pc ON pc.conname = tc.constraint_name
      JOIN pg_namespace pn ON pn.oid = pc.connamespace AND pn.nspname = tc.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name IN ('students', '_classora_tenant_migrations')
        AND pc.contype IN ('p', 'u', 'f', 'c', 'x')
    ),
    expected_ledger_columns (column_name, ordinal_position, data_type, character_maximum_length, is_nullable, column_default) AS (
      VALUES
        ('version', '1', 'integer', NULL, 'NO', NULL),
        ('name', '2', 'text', NULL, 'NO', NULL),
        ('applied_at', '3', 'timestamp with time zone', NULL, 'NO', 'CURRENT_TIMESTAMP')
    ),
    actual_ledger_columns AS (
      SELECT
        column_name::text,
        ordinal_position::text,
        data_type::text,
        character_maximum_length::text,
        is_nullable::text,
        column_default::text
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '_classora_tenant_migrations'
    ),
    expected_tables (table_name) AS (
      VALUES ('students'), ('_classora_tenant_migrations')
    ),
    actual_tables AS (
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ),
    expected_indexes (indexname) AS (
      VALUES
        ('students_pkey'),
        ('students_tenant_id_code_key'),
        ('students_tenant_id_full_name_id_idx')
    ),
    actual_indexes AS (
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'students'
    ),
    actual_triggers AS (
      SELECT t.tgname
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('students', '_classora_tenant_migrations')
        AND NOT t.tgisinternal
    ),
    actual_rules AS (
      SELECT DISTINCT schemaname, tablename, rulename
      FROM pg_rules
      WHERE schemaname = 'public'
        AND tablename IN ('students', '_classora_tenant_migrations')
    ),
    actual_policies AS (
      SELECT schemaname, tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('students', '_classora_tenant_migrations')
    ),
    actual_rls AS (
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('students', '_classora_tenant_migrations')
    )
    SELECT
      (SELECT count(*) FROM actual_columns) = (SELECT count(*) FROM expected_columns)
      AND NOT EXISTS (
        SELECT 1 FROM expected_columns expected
        FULL OUTER JOIN actual_columns actual USING (column_name)
        WHERE expected.column_name IS NULL
           OR actual.column_name IS NULL
           OR expected.ordinal_position <> actual.ordinal_position
           OR expected.data_type <> actual.data_type
           OR expected.character_maximum_length IS DISTINCT FROM actual.character_maximum_length
           OR expected.is_nullable <> actual.is_nullable
           OR COALESCE(expected.column_default, '') <> COALESCE(actual.column_default, '')
      )
      AND (SELECT count(*) FROM actual_constraints) = (SELECT count(*) FROM expected_constraints)
      AND NOT EXISTS (
        SELECT 1 FROM expected_constraints expected
        FULL OUTER JOIN actual_constraints actual
          ON expected.table_name = actual.table_name
         AND expected.constraint_name = actual.constraint_name
        WHERE expected.constraint_name IS NULL
           OR actual.constraint_name IS NULL
           OR expected.constraint_type <> actual.constraint_type
           OR expected.definition <> actual.definition
      )
      AND (SELECT count(*) FROM actual_ledger_columns) = (SELECT count(*) FROM expected_ledger_columns)
      AND NOT EXISTS (
        SELECT 1 FROM expected_ledger_columns expected
        FULL OUTER JOIN actual_ledger_columns actual USING (column_name)
        WHERE expected.column_name IS NULL
           OR actual.column_name IS NULL
           OR expected.ordinal_position <> actual.ordinal_position
           OR expected.data_type <> actual.data_type
           OR expected.character_maximum_length IS DISTINCT FROM actual.character_maximum_length
           OR expected.is_nullable <> actual.is_nullable
           OR COALESCE(expected.column_default, '') <> COALESCE(actual.column_default, '')
      )
      AND (SELECT count(*) FROM actual_tables) = (SELECT count(*) FROM expected_tables)
      AND NOT EXISTS (
        SELECT 1 FROM expected_tables expected
        FULL OUTER JOIN actual_tables actual USING (table_name)
        WHERE expected.table_name IS NULL OR actual.table_name IS NULL
      )
      AND (SELECT count(*) FROM actual_indexes) = (SELECT count(*) FROM expected_indexes)
      AND NOT EXISTS (
        SELECT 1 FROM expected_indexes expected
        FULL OUTER JOIN actual_indexes actual USING (indexname)
        WHERE expected.indexname IS NULL OR actual.indexname IS NULL
      )
      AND NOT EXISTS (SELECT 1 FROM actual_triggers)
      AND NOT EXISTS (SELECT 1 FROM actual_rules)
      AND NOT EXISTS (SELECT 1 FROM actual_policies)
      AND NOT EXISTS (
        SELECT 1 FROM actual_rls
        WHERE relrowsecurity OR relforcerowsecurity
      ) AS matches
  `);
  return result.rows[0]?.matches === true;
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
  state: (dbName: string) => Promise<TenantDatabaseState> = tenantDatabaseState,
  prisma: (args: string[], dbName: string) => Promise<void> = runPrisma,
): Promise<void> {
  const databaseState = await state(dbName);
  if (!databaseState.prismaLedger && databaseState.tables) {
    const knownLegacySchema =
      databaseState.legacyLedger &&
      databaseState.students &&
      databaseState.legacyCatalogMatches &&
      databaseState.legacyMigrations.length === 1 &&
      databaseState.legacyMigrations[0].version === 1 &&
      databaseState.legacyMigrations[0].name === 'students';
    if (!knownLegacySchema) {
      throw new Error('Tenant database has an unknown schema and cannot be baselined');
    }
    await prisma(['migrate', 'resolve', '--applied', BASELINE_MIGRATION], dbName);
  }
  await prisma(['migrate', 'deploy'], dbName);
}

export async function migrateTenantDatabases(
  tenants: TenantDatabase[],
  deploy: (dbName: string) => Promise<void> = deployTenantSchema,
) {
  for (const tenant of tenants) {
    validateTenantDatabase(tenant);
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
