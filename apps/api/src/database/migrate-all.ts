import 'dotenv/config';
import { Client } from 'pg';
import { ControlDatabaseService } from './control-database.service.js';
import { migrateTenantDatabases, type TenantDatabase } from './tenant-migrations.js';
import { postgresConfig } from '../config.js';

const MIGRATION_LOCK = 'classora-production-migrations';

function lockClient(): Client {
  const config = postgresConfig();
  return new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.controlDatabase,
    connectionTimeoutMillis: 5_000,
  });
}

export async function migrateAll(): Promise<void> {
  const client = lockClient();
  const control = new ControlDatabaseService();
  let locked = false;

  try {
    await client.connect();
    const result = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
      [MIGRATION_LOCK],
    );
    locked = result.rows[0]?.locked === true;
    if (!locked) {
      throw new Error('Another production migration is already running');
    }

    const { execFile } = await import('node:child_process');
    const { fileURLToPath } = await import('node:url');
    const { promisify } = await import('node:util');
    await promisify(execFile)(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'prisma.config.ts'], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      env: process.env,
    });

    const tenants: TenantDatabase[] = await control.tenant.findMany({
      select: { slug: true, dbName: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    console.log(`Migrating ${tenants.length} tenant database(s)`);
    await migrateTenantDatabases(tenants);
  } finally {
    if (locked) {
      await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [MIGRATION_LOCK]).catch(() => undefined);
    }
    await control.$disconnect().catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  void migrateAll().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
