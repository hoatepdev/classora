import { applyTenantMigrations } from '../src/database/tenant-migrations.js';

type QueryCall = [string, unknown[]?];
type AppliedMigration = { version: number; name: string };

function client(applied: AppliedMigration[] = [], failSql = false) {
  const calls: QueryCall[] = [];
  return {
    calls,
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push([sql, values]);
      if (sql.startsWith('SELECT version')) return { rows: applied };
      if (failSql && sql === 'CREATE STUDENTS') throw new Error('migration failed');
      return { rows: [] };
    }),
  };
}

describe('tenant migrations', () => {
  it('applies an unapplied migration and records it in one transaction', async () => {
    const database = client();

    await expect(
      applyTenantMigrations(database as never, async () => 'CREATE STUDENTS'),
    ).resolves.toBe(1);

    expect(database.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      'SELECT pg_advisory_xact_lock($1)',
      expect.stringContaining('CREATE TABLE IF NOT EXISTS _classora_tenant_migrations'),
      'SELECT version, name FROM _classora_tenant_migrations ORDER BY version',
      'CREATE STUDENTS',
      'INSERT INTO _classora_tenant_migrations (version, name) VALUES ($1, $2)',
      'COMMIT',
    ]);
  });

  it('skips tenant DDL after it committed so metadata can be reconciled separately', async () => {
    const database = client([{ version: 1, name: 'students' }]);
    const loadSql = vi.fn(async () => 'CREATE STUDENTS');

    await expect(applyTenantMigrations(database as never, loadSql)).resolves.toBe(1);

    expect(loadSql).not.toHaveBeenCalled();
    expect(database.calls.some(([sql]) => sql === 'CREATE STUDENTS')).toBe(false);
    expect(database.calls.at(-1)?.[0]).toBe('COMMIT');
  });

  it('rejects migration history created by a newer binary', async () => {
    const database = client([
      { version: 1, name: 'students' },
      { version: 2, name: 'future' },
    ]);

    await expect(applyTenantMigrations(database as never)).rejects.toThrow(
      'Unknown tenant migration 2:future',
    );

    expect(database.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });

  it('rejects renamed migration history', async () => {
    const database = client([{ version: 1, name: 'renamed' }]);

    await expect(applyTenantMigrations(database as never)).rejects.toThrow(
      'Unknown tenant migration 1:renamed',
    );
  });

  it('rolls back failed DDL without recording the migration', async () => {
    const database = client([], true);

    await expect(
      applyTenantMigrations(database as never, async () => 'CREATE STUDENTS'),
    ).rejects.toThrow('migration failed');

    expect(
      database.calls.some(([sql]) =>
        sql.startsWith('INSERT INTO _classora_tenant_migrations'),
      ),
    ).toBe(false);
    expect(database.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
});
