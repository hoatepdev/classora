# Tenant database migrations

## Status

Accepted

## Context

Classora isolates tenants with one database per tenant. Tenant schemas first migrated through a hand-rolled runner: SQL files applied over `pg` connections, recorded in a per-tenant `_classora_tenant_migrations` table plus a `tenants.schema_version` counter. That is a second migration system beside Prisma's, duplicating tracking, ordering, and failure handling.

## Decision

- Manage tenant schemas with Prisma migrations: `prisma/tenant/schema.prisma` with its own `prisma/tenant/prisma.config.ts` and `prisma/tenant/migrations/`, separate from the control-database config in `prisma.config.ts`. A tenant deploy can never read control migrations.
- Apply them with `pnpm tenant:migrate` (`apps/api/src/database/tenant-migrations.ts`): load tenants from the control database, then run `prisma migrate deploy` sequentially against each tenant `DATABASE_URL` passed only through the child process environment.
- Adopt databases migrated by the retired runner by detecting tables without a `_prisma_migrations` ledger and running `prisma migrate resolve --applied 20260912000000_students` before deploy (same approach as the control `db:baseline` script).
- Rely on Prisma's `_prisma_migrations` ledger as the only migration state. The `_classora_tenant_migrations` tables and the `tenants.schema_version` counter are dropped.
- A failed tenant migration stops the run with a non-zero exit; no tenant is skipped silently.

## Consequences

`docker compose exec api npm run tenant:migrate` migrates all tenants; `start:prod` also runs it on every deploy. Adding a tenant migration means adding a file under `prisma/tenant/migrations/` — no runner code changes. New tenant databases must be created empty; the runner baselines only databases that carry the retired runner's tables.
