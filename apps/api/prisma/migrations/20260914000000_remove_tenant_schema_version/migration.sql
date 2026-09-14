-- Tenant schema versions are tracked per tenant database by Prisma's
-- _prisma_migrations table (see prisma/tenant), not by this counter.

ALTER TABLE "tenants" DROP COLUMN "schema_version";
