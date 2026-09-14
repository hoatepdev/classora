-- Drop the retired hand-rolled runner's tracking table. Prisma's
-- _prisma_migrations in each tenant database is the only migration ledger now.

DROP TABLE IF EXISTS _classora_tenant_migrations;
