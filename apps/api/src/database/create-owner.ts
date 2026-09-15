import 'dotenv/config';
import * as argon2 from 'argon2';
import { ControlDatabaseService } from './control-database.service.js';
import { TenantRole, UserStatus } from '../generated/prisma/enums.js';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function createOwner() {
  const email = required('INITIAL_USER_EMAIL').toLowerCase();
  const password = required('INITIAL_USER_PASSWORD');
  const name = required('INITIAL_USER_NAME');
  const tenantSlug = required('INITIAL_TENANT_SLUG').toLowerCase();

  if (!email.includes('@') || email.length > 254) throw new Error('INITIAL_USER_EMAIL is invalid');
  if (password.length < 12) throw new Error('INITIAL_USER_PASSWORD must be at least 12 characters');

  const database = new ControlDatabaseService();
  try {
    const tenant = await database.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new Error(`Tenant ${tenantSlug} does not exist`);

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await database.$transaction(async (transaction) => {
      const user = await transaction.user.upsert({
        where: { email },
        create: { email, passwordHash, name, status: UserStatus.ACTIVE },
        update: { passwordHash, name, status: UserStatus.ACTIVE },
      });
      await transaction.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        create: { tenantId: tenant.id, userId: user.id, role: TenantRole.OWNER },
        update: { role: TenantRole.OWNER },
      });
    });

    console.log(`Owner ${email} is ready for tenant ${tenantSlug}`);
  } finally {
    await database.$disconnect();
  }
}

void createOwner().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
