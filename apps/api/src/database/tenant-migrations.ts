import { readFile } from 'node:fs/promises';
import { Pool, type PoolClient } from 'pg';
import { ControlDatabaseService } from './control-database.service.js';

const migrations = [{ version: 1, name: 'students', file: '001_students.sql' }] as const;
const migrationLockId = 1_914_195_701;

export async function applyTenantMigrations(
  client: Pick<PoolClient, 'query'>,
  loadSql: (file: string) => Promise<string> = (file) =>
    readFile(new URL(`./tenant-migrations/${file}`, import.meta.url), 'utf8'),
) {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock($1)', [migrationLockId]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS _classora_tenant_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const applied = await client.query<{ version: number; name: string }>(
      'SELECT version, name FROM _classora_tenant_migrations ORDER BY version',
    );
    const knownMigrations = new Map<number, string>(
      migrations.map(({ version, name }) => [version, name]),
    );
    for (const row of applied.rows) {
      if (knownMigrations.get(row.version) !== row.name) {
        throw new Error(`Unknown tenant migration ${row.version}:${row.name}`);
      }
    }
    const appliedVersions = new Set(applied.rows.map(({ version }) => version));

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) continue;
      await client.query(await loadSql(migration.file));
      await client.query(
        'INSERT INTO _classora_tenant_migrations (version, name) VALUES ($1, $2)',
        [migration.version, migration.name],
      );
    }

    await client.query('COMMIT');
    return migrations.at(-1)?.version ?? 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

function tenantPool(database: string) {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
}

async function migrateTenants() {
  const control = new ControlDatabaseService();
  try {
    const tenants = await control.tenant.findMany({
      select: { id: true, dbName: true, schemaVersion: true },
      orderBy: { id: 'asc' },
    });

    for (const tenant of tenants) {
      const pool = tenantPool(tenant.dbName);
      try {
        const client = await pool.connect();
        try {
          const schemaVersion = await applyTenantMigrations(client);
          if (tenant.schemaVersion !== schemaVersion) {
            await control.tenant.update({
              where: { id: tenant.id },
              data: { schemaVersion },
            });
          }
        } finally {
          client.release();
        }
      } finally {
        await pool.end();
      }
    }
  } finally {
    await control.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  void migrateTenants().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
