import {
  BASELINE_MIGRATION,
  deployTenantSchema,
  migrateTenantDatabases,
  tenantDatabaseUrl,
} from '../src/database/tenant-migrations.js';

const tenants = {
  alpha: { slug: 'alpha', dbName: 'classora_tenant_alpha' },
  beta: { slug: 'beta', dbName: 'classora_tenant_beta' },
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tenant migrations', () => {
  it('deploys to every tenant sequentially and reports start, duration and result', async () => {
    const deployed: string[] = [];

    await expect(
      migrateTenantDatabases([tenants.alpha, tenants.beta], async (dbName) => {
        deployed.push(dbName);
      }),
    ).resolves.toBeUndefined();

    expect(deployed).toEqual(['classora_tenant_alpha', 'classora_tenant_beta']);
    const logged = vi.mocked(console.log).mock.calls.map(([message]) => String(message));
    expect(logged).toContain('[tenant alpha] migrating database "classora_tenant_alpha"');
    expect(logged).toContain('[tenant beta] migrating database "classora_tenant_beta"');
    expect(logged.some((line) => line.startsWith('[tenant alpha] done in '))).toBe(true);
    expect(logged.some((line) => line.startsWith('[tenant beta] done in '))).toBe(true);
  });

  it('stops at the failing tenant, identifies it and does not continue', async () => {
    const deployed: string[] = [];

    await expect(
      migrateTenantDatabases([tenants.alpha, tenants.beta], async (dbName) => {
        deployed.push(dbName);
        if (dbName === tenants.alpha.dbName) throw new Error('P1001: database unreachable');
      }),
    ).rejects.toThrow(
      /\[tenant alpha\] migration failed after [\d.]+s: P1001: database unreachable/,
    );

    expect(deployed).toEqual(['classora_tenant_alpha']);
  });

  it('builds a URL from trusted metadata and encodes PostgreSQL database names', () => {
    expect(tenantDatabaseUrl('classora_tenant_demo')).toMatch(
      /^postgresql:\/\/[^@]+@[^/]+\/classora_tenant_demo$/,
    );
    expect(tenantDatabaseUrl('classora-tenant/demo')).toMatch(
      /\/classora-tenant%2Fdemo$/,
    );
    expect(() => tenantDatabaseUrl('control_db')).toThrow(
      'Tenant database name must not be the control database',
    );
  });

  it('baselines only databases migrated by the retired runner', async () => {
    type PrismaCall = { dbName: string; args: string[] };
    type State = {
      prismaLedger: boolean;
      legacyLedger: boolean;
      students: boolean;
      tables: boolean;
    };

    const run = async (state: State) => {
      const invocations: PrismaCall[] = [];
      await deployTenantSchema(
        'classora_tenant_alpha',
        async () => state,
        async (args, dbName) => {
          invocations.push({ dbName, args });
        },
      );
      return invocations;
    };

    await expect(
      run({ prismaLedger: false, legacyLedger: true, students: true, tables: true }),
    ).resolves.toEqual([
      { dbName: 'classora_tenant_alpha', args: ['migrate', 'resolve', '--applied', BASELINE_MIGRATION] },
      { dbName: 'classora_tenant_alpha', args: ['migrate', 'deploy'] },
    ]);
    await expect(
      run({ prismaLedger: false, legacyLedger: false, students: false, tables: false }),
    ).resolves.toEqual([
      { dbName: 'classora_tenant_alpha', args: ['migrate', 'deploy'] },
    ]);
    await expect(
      run({ prismaLedger: true, legacyLedger: false, students: true, tables: true }),
    ).resolves.toEqual([
      { dbName: 'classora_tenant_alpha', args: ['migrate', 'deploy'] },
    ]);
    await expect(
      run({ prismaLedger: false, legacyLedger: false, students: true, tables: true }),
    ).rejects.toThrow('Tenant database has an unknown schema and cannot be baselined');
  });
});
