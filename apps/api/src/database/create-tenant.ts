import 'dotenv/config';
import { parseArgs } from 'node:util';
import * as argon2 from 'argon2';
import { isEmail } from 'class-validator';
import { escapeIdentifier, Pool } from 'pg';
import { ulid } from 'ulid';
import { TenantRole, UserStatus } from '../generated/prisma/enums.js';
import { isValidTenantSlug, TENANT_HOST_SUFFIX } from '../tenant/tenant-resolver.service.js';
import { ControlDatabaseService } from './control-database.service.js';
import { deployTenantSchema } from './tenant-migrations.js';
import { postgresConfig } from '../config.js';

const TENANT_DATABASE_PREFIX = 'classora_tenant_';

type ProvisionTenantInput = {
  code: string;
  name: string;
  ownerEmail: string;
  ownerName?: string;
  ownerPassword?: string;
};

type ProvisionTenantResult = {
  code: string;
  domain: string;
  dbName: string;
  ownerEmail: string;
};

type DatabaseError = Error & { code?: string };

async function runDatabaseCommand(command: 'CREATE' | 'DROP', dbName: string) {
  const config = postgresConfig();
  const pool = new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.controlDatabase,
    max: 1,
    connectionTimeoutMillis: 5_000,
  });
  try {
    await pool.query(`${command} DATABASE ${escapeIdentifier(dbName)}`);
  } finally {
    await pool.end();
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function cleanupDatabase(
  database: ControlDatabaseService,
  dbName: string,
  dropDatabase: (dbName: string) => Promise<void>,
) {
  try {
    const registeredTenant = await database.tenant.findUnique({
      where: { dbName },
      select: { id: true },
    });
    if (registeredTenant) return `cleanup skipped: database is registered to tenant ${registeredTenant.id}`;
    await dropDatabase(dbName);
  } catch (error) {
    return `cleanup failed: ${errorMessage(error)}`;
  }
}

export async function provisionTenant(
  input: ProvisionTenantInput,
  database: ControlDatabaseService,
  createDatabase: (dbName: string) => Promise<void> = (dbName) =>
    runDatabaseCommand('CREATE', dbName),
  migrateDatabase: (dbName: string) => Promise<void> = deployTenantSchema,
  dropDatabase: (dbName: string) => Promise<void> = (dbName) => runDatabaseCommand('DROP', dbName),
  hashPassword: (password: string) => Promise<string> = (password) =>
    argon2.hash(password, { type: argon2.argon2id }),
): Promise<ProvisionTenantResult> {
  const code = input.code.trim().toLowerCase();
  const name = input.name.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const ownerName = input.ownerName?.trim();
  const domain = `${code}${TENANT_HOST_SUFFIX}`;
  const dbName = `${TENANT_DATABASE_PREFIX}${code}`;

  if (!isValidTenantSlug(code)) {
    throw new Error('Tenant code must be a non-reserved DNS label of at most 47 characters');
  }
  if (!name) throw new Error('Tenant name is required');
  if (ownerEmail.length > 254 || !isEmail(ownerEmail)) throw new Error('Owner email is invalid');

  const conflict = await database.tenant.findFirst({
    where: { OR: [{ slug: code }, { domain }, { dbName }] },
    select: { slug: true, domain: true, dbName: true },
  });
  if (conflict) {
    throw new Error(
      `Tenant already exists: code=${conflict.slug}, domain=${conflict.domain ?? 'none'}, database=${conflict.dbName}`,
    );
  }

  const existingOwner = await database.user.findUnique({
    where: { email: ownerEmail },
    select: { id: true, status: true },
  });
  if (existingOwner?.status === UserStatus.DISABLED) {
    throw new Error(`Owner ${ownerEmail} is disabled`);
  }
  if (!existingOwner && !ownerName) throw new Error('Owner name is required for a new user');
  if (!existingOwner && (!input.ownerPassword || input.ownerPassword.length < 12)) {
    throw new Error('TENANT_OWNER_PASSWORD must be at least 12 characters for a new user');
  }

  const passwordHash = existingOwner ? undefined : await hashPassword(input.ownerPassword!);
  let createdDatabase = false;

  try {
    await createDatabase(dbName);
    createdDatabase = true;
    await migrateDatabase(dbName);

    await database.$transaction(async (transaction) => {
      const owner =
        existingOwner ??
        (await transaction.user.create({
          data: {
            email: ownerEmail,
            passwordHash: passwordHash!,
            name: ownerName!,
            status: UserStatus.ACTIVE,
          },
          select: { id: true },
        }));
      const tenant = await transaction.tenant.create({
        data: { id: ulid(), name, slug: code, domain, dbName },
        select: { id: true },
      });
      await transaction.tenantMembership.create({
        data: { tenantId: tenant.id, userId: owner.id, role: TenantRole.OWNER, status: 'ACTIVE' },
      });
    });
  } catch (error) {
    if ((error as DatabaseError).code === '42P04') {
      throw new Error(
        `Database ${dbName} already exists without a tenant record; inspect it before retrying`,
      );
    }
    const cleanupError = createdDatabase
      ? await cleanupDatabase(database, dbName, dropDatabase)
      : undefined;
    if (cleanupError) throw new Error(`${errorMessage(error)}; ${cleanupError}`);
    throw error;
  }

  return { code, domain, dbName, ownerEmail };
}

async function main() {
  const { values } = parseArgs({
    options: {
      code: { type: 'string' },
      name: { type: 'string' },
      owner: { type: 'string' },
      'owner-name': { type: 'string' },
    },
  });
  if (!values.code || !values.name || !values.owner) {
    throw new Error('--code, --name and --owner are required');
  }

  const database = new ControlDatabaseService();
  try {
    const tenant = await provisionTenant(
      {
        code: values.code,
        name: values.name,
        ownerEmail: values.owner,
        ownerName: values['owner-name'],
        ownerPassword: process.env.TENANT_OWNER_PASSWORD,
      },
      database,
    );
    console.log(
      `Tenant ${tenant.code} is ready at ${tenant.domain} using ${tenant.dbName}; owner ${tenant.ownerEmail}`,
    );
  } finally {
    await database.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  void main().catch((error: unknown) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
