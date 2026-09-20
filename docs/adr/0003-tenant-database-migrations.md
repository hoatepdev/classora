# Tenant database migrations

## Status

Accepted

## Context

Classora isolates tenants with one database per tenant. Tenant schemas first migrated through a hand-rolled runner: SQL files applied over `pg` connections, recorded in a per-tenant `_classora_tenant_migrations` table plus a `tenants.schema_version` counter. That is a second migration system beside Prisma's, duplicating tracking, ordering, and failure handling.

## Decision

- Manage tenant schemas with Prisma migrations: `prisma/tenant/schema.prisma` with its own `prisma/tenant/prisma.config.ts` and `prisma/tenant/migrations/`, separate from the control-database config in `prisma.config.ts`. A tenant deploy can never read control migrations.
- Apply them with the explicit `pnpm db:migrate:all` deployment step: control migrations run first, then `apps/api/src/database/tenant-migrations.ts` loads tenants from the control database and runs `prisma migrate deploy` sequentially against each tenant `DATABASE_URL` passed only through the child process environment.
- Adopt databases migrated by the retired runner by detecting tables without a `_prisma_migrations` ledger and running `prisma migrate resolve --applied 20260912000000_students` before deploy (same approach as the control `db:baseline` script).
- Rely on Prisma's `_prisma_migrations` ledger as the only migration state. The `_classora_tenant_migrations` tables and the `tenants.schema_version` counter are dropped.
- A failed tenant migration stops the run with a non-zero exit; no tenant is skipped silently.

## Consequences

The Compose `api-migrate` service runs `npm run db:migrate:all` and must complete successfully before the API starts. A failed run leaves earlier tenants migrated and later tenants untouched; operators fix the failing tenant and rerun the service. This is forward-only migration management: rollback requires a compatible application version or database restore because there are no down migrations. Adding a tenant migration means adding a file under `prisma/tenant/migrations/` — no runner code changes. New tenant databases must be created empty; the runner baselines only databases that carry the retired runner's tables.

The only supported retired tenant baseline is migration version `1`, named `students`, with the exact `students` and `_classora_tenant_migrations` PostgreSQL catalog. Baseline detection is fail-closed: it compares catalog columns, types and lengths, defaults, nullability, constraints, indexes, predicates, relations, and security objects before running `migrate resolve`; it never repairs arbitrary drift. The disposable verification command `B5_TEST_DATABASE=1 pnpm --filter api run test:tenant-schema` creates only run-prefixed databases, compares a fresh deploy with the supported legacy upgrade, exercises drift rejection and current-database reruns, and removes its databases on exit. It is also run by the disposable Compose smoke path; no production database is eligible for this check.
