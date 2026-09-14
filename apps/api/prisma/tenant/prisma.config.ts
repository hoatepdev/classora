import { defineConfig, env } from 'prisma/config';

// Tenant-database migrations. Kept separate from the control-database config
// (prisma.config.ts) so a tenant deploy can never read control migrations.
// Applied per tenant database by src/database/tenant-migrations.ts:
//   DATABASE_URL=<tenant-url> prisma migrate deploy --config prisma/tenant/prisma.config.ts
export default defineConfig({
  schema: 'schema.prisma',
  migrations: { path: 'migrations' },
  datasource: { url: env('DATABASE_URL') },
});
