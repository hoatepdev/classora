# Database Rules

Classora uses PostgreSQL with database-per-tenant isolation.

## Tenant Safety

Every tenant operation must run against the correct tenant database.

Never:

- reuse a tenant connection for another tenant
- derive tenant database names directly from untrusted input
- fall back silently to another tenant database
- query tenant data before tenant resolution

## Migrations

Database schema changes must be migration-driven.

Never rely on manual production schema changes.

Migrations must consider:

- existing tenant databases
- newly created tenants
- rollback/failure behavior

## Queries

Avoid N+1 queries.

Select only required columns when practical.

Indexes should be introduced based on real query patterns.
