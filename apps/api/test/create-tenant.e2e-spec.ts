import type { ExecutionContext } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Reflector } from '@nestjs/core';
import { AuthService } from '../src/auth/auth.service.js';
import { provisionTenant } from '../src/database/create-tenant.js';
import type { ControlDatabaseService } from '../src/database/control-database.service.js';
import { TenantMembershipGuard } from '../src/tenant/tenant-membership.guard.js';
import { TenantResolverService } from '../src/tenant/tenant-resolver.service.js';

type Tenant = { id: string; name: string; slug: string; domain: string; dbName: string };
type User = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  status: 'ACTIVE' | 'DISABLED';
};
type Membership = { id: string; tenantId: string; userId: string; role: 'OWNER' };

function controlDatabase(options: { user?: User; tenant?: Tenant; transactionError?: Error } = {}) {
  const tenants = options.tenant ? [options.tenant] : [];
  const users = options.user ? [options.user] : [];
  const memberships: Membership[] = [];
  const database = {
    tenant: {
      findFirst: vi.fn(
        async ({ where }: { where: { OR: Record<string, string>[] } }) =>
          tenants.find((tenant) =>
            where.OR.some((condition) =>
              Object.entries(condition).every(
                ([field, value]) => tenant[field as keyof Tenant] === value,
              ),
            ),
          ) ?? null,
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { dbName?: string; slug?: string } }) =>
          tenants.find(
            (tenant) => tenant.dbName === where.dbName || tenant.slug === where.slug,
          ) ?? null,
      ),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) =>
        users.find((user) => user.email === where.email || user.id === where.id) ?? null,
      ),
    },
    tenantMembership: {
      findUnique: vi.fn(
        async ({ where }: { where: { tenantId_userId: { tenantId: string; userId: string } } }) =>
          memberships.find(
            (membership) =>
              membership.tenantId === where.tenantId_userId.tenantId &&
              membership.userId === where.tenantId_userId.userId,
          ) ?? null,
      ),
    },
    $transaction: vi.fn(async (operation: (transaction: unknown) => Promise<void>) => {
      if (options.transactionError) throw options.transactionError;
      const stagedTenants: Tenant[] = [];
      const stagedUsers: User[] = [];
      const stagedMemberships: Membership[] = [];
      await operation({
        user: {
          create: vi.fn(async ({ data }: { data: Omit<User, 'id'> }) => {
            const user = { id: '01JHZX3V8Q9K5M2N7R4T6W1Y0B', ...data };
            stagedUsers.push(user);
            return { id: user.id };
          }),
        },
        tenant: {
          create: vi.fn(async ({ data }: { data: Tenant }) => {
            stagedTenants.push(data);
            return { id: data.id };
          }),
        },
        tenantMembership: {
          create: vi.fn(async ({ data }: { data: Omit<Membership, 'id'> }) => {
            const membership = { id: '01JHZX3V8Q9K5M2N7R4T6W1Y0D', ...data };
            stagedMemberships.push(membership);
            return membership;
          }),
        },
      });
      tenants.push(...stagedTenants);
      users.push(...stagedUsers);
      memberships.push(...stagedMemberships);
    }),
  };

  return {
    database: database as unknown as ControlDatabaseService,
    tenants,
    users,
    memberships,
  };
}

const input = {
  code: ' Demo ',
  name: ' Demo Center ',
  ownerEmail: ' ADMIN@example.com ',
  ownerName: ' Demo Owner ',
  ownerPassword: 'correct horse battery staple',
};

describe('tenant provisioning', () => {
  it('creates, migrates and atomically registers a usable tenant', async () => {
    const state = controlDatabase();
    const operations: string[] = [];

    const result = await provisionTenant(
      input,
      state.database,
      async () => void operations.push('create database'),
      async () => void operations.push('migrate database'),
      async () => void operations.push('drop database'),
    );

    expect(operations).toEqual(['create database', 'migrate database']);
    expect(result).toEqual({
      code: 'demo',
      domain: 'demo.classora.io.vn',
      dbName: 'classora_tenant_demo',
      ownerEmail: 'admin@example.com',
    });
    expect(state.tenants[0]).toMatchObject({
      name: 'Demo Center',
      slug: 'demo',
      domain: 'demo.classora.io.vn',
      dbName: 'classora_tenant_demo',
    });
    expect(state.tenants[0].id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(state.memberships[0]).toMatchObject({
      tenantId: state.tenants[0].id,
      userId: state.users[0].id,
      role: 'OWNER',
    });

    const auth = new AuthService(
      state.database,
      { signAsync: vi.fn(async () => 'access-token') } as unknown as JwtService,
    );
    await expect(auth.login('admin@example.com', input.ownerPassword)).resolves.toEqual({
      accessToken: 'access-token',
    });

    const resolver = new TenantResolverService(state.database);
    await expect(resolver.resolve('demo.classora.io.vn')).resolves.toEqual({
      tenantId: state.tenants[0].id,
      tenantSlug: 'demo',
      dbName: 'classora_tenant_demo',
    });

    const guard = new TenantMembershipGuard(
      { getAllAndOverride: () => true } as unknown as Reflector,
      resolver,
      state.database,
    );
    const request = {
      hostname: 'demo.classora.io.vn',
      user: { id: state.users[0].id, email: state.users[0].email, name: state.users[0].name },
    };
    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request).toMatchObject({
      tenant: { tenantId: state.tenants[0].id, tenantSlug: 'demo' },
      membership: { role: 'OWNER' },
    });
  });

  it('reuses an existing active owner without changing credentials', async () => {
    const existingOwner: User = {
      id: '01JHZX3V8Q9K5M2N7R4T6W1Y0E',
      email: 'admin@example.com',
      name: 'Existing Name',
      passwordHash: 'existing-hash',
      status: 'ACTIVE',
    };
    const state = controlDatabase({ user: existingOwner });
    const hashPassword = vi.fn();

    await provisionTenant(
      { code: 'demo', name: 'Demo Center', ownerEmail: existingOwner.email },
      state.database,
      async () => {},
      async () => {},
      async () => {},
      hashPassword,
    );

    expect(hashPassword).not.toHaveBeenCalled();
    expect(state.users).toEqual([existingOwner]);
    expect(state.memberships[0].userId).toBe(existingOwner.id);
  });

  it('rejects tenant conflicts before database work', async () => {
    const state = controlDatabase({
      tenant: {
        id: '01JHZX3V8Q9K5M2N7R4T6W1Y0A',
        name: 'Demo',
        slug: 'demo',
        domain: 'demo.classora.io.vn',
        dbName: 'classora_tenant_demo',
      },
    });
    const createDatabase = vi.fn();

    await expect(
      provisionTenant(input, state.database, createDatabase),
    ).rejects.toThrow('Tenant already exists');
    expect(createDatabase).not.toHaveBeenCalled();
  });

  it('does not migrate or clean up when database creation fails', async () => {
    const state = controlDatabase();
    const migrateDatabase = vi.fn();
    const dropDatabase = vi.fn();

    await expect(
      provisionTenant(
        input,
        state.database,
        async () => {
          throw new Error('permission denied');
        },
        migrateDatabase,
        dropDatabase,
      ),
    ).rejects.toThrow('permission denied');
    expect(migrateDatabase).not.toHaveBeenCalled();
    expect(dropDatabase).not.toHaveBeenCalled();
  });

  it('removes only the database created by a failed migration', async () => {
    const state = controlDatabase();
    const dropDatabase = vi.fn(async () => {});

    await expect(
      provisionTenant(
        input,
        state.database,
        async () => {},
        async () => {
          throw new Error('migration failed');
        },
        dropDatabase,
      ),
    ).rejects.toThrow('migration failed');
    expect(dropDatabase).toHaveBeenCalledOnce();
    expect(dropDatabase).toHaveBeenCalledWith('classora_tenant_demo');
    expect(state.tenants).toEqual([]);
    expect(state.users).toEqual([]);
    expect(state.memberships).toEqual([]);
  });

  it('cleans up after a failed control transaction without publishing a tenant', async () => {
    const state = controlDatabase({ transactionError: new Error('control commit failed') });
    const dropDatabase = vi.fn(async () => {});

    await expect(
      provisionTenant(input, state.database, async () => {}, async () => {}, dropDatabase),
    ).rejects.toThrow('control commit failed');
    expect(dropDatabase).toHaveBeenCalledWith('classora_tenant_demo');
    expect(state.tenants).toEqual([]);
  });

  it('never migrates or deletes an existing unregistered database', async () => {
    const state = controlDatabase();
    const migrateDatabase = vi.fn();
    const dropDatabase = vi.fn();

    await expect(
      provisionTenant(
        input,
        state.database,
        async () => {
          throw Object.assign(new Error('duplicate database'), { code: '42P04' });
        },
        migrateDatabase,
        dropDatabase,
      ),
    ).rejects.toThrow('already exists without a tenant record');
    expect(migrateDatabase).not.toHaveBeenCalled();
    expect(dropDatabase).not.toHaveBeenCalled();
  });

  it('does not drop a database that became registered before cleanup', async () => {
    const state = controlDatabase();
    const dropDatabase = vi.fn();
    state.database.tenant.findUnique = vi.fn(async () => ({ id: 'other-tenant' })) as never;

    await expect(
      provisionTenant(
        input,
        state.database,
        async () => {},
        async () => {
          throw new Error('migration failed');
        },
        dropDatabase,
      ),
    ).rejects.toThrow('cleanup skipped: database is registered to tenant other-tenant');
    expect(dropDatabase).not.toHaveBeenCalled();
  });

  it('rejects a disabled owner before database creation', async () => {
    const state = controlDatabase({
      user: {
        id: '01JHZX3V8Q9K5M2N7R4T6W1Y0E',
        email: 'admin@example.com',
        name: 'Disabled Owner',
        passwordHash: 'existing-hash',
        status: 'DISABLED',
      },
    });
    const createDatabase = vi.fn();

    await expect(
      provisionTenant(input, state.database, createDatabase),
    ).rejects.toThrow('Owner admin@example.com is disabled');
    expect(createDatabase).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...input, code: 'api' }, 'Tenant code'],
    [{ ...input, code: 'bad.code' }, 'Tenant code'],
    [{ ...input, code: '-demo' }, 'Tenant code'],
    [{ ...input, name: ' ' }, 'Tenant name'],
    [{ ...input, ownerEmail: 'not-an-email' }, 'Owner email'],
    [{ ...input, ownerName: ' ' }, 'Owner name'],
    [{ ...input, ownerPassword: 'short' }, 'TENANT_OWNER_PASSWORD'],
  ])('rejects invalid input before database creation', async (invalidInput, message) => {
    const state = controlDatabase();
    const createDatabase = vi.fn();

    await expect(
      provisionTenant(invalidInput, state.database, createDatabase),
    ).rejects.toThrow(message);
    expect(createDatabase).not.toHaveBeenCalled();
  });
});
