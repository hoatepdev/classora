# Authentication and tenant authorization

## Status

Accepted

## Context

Classora stores platform identities and tenant memberships separately from each tenant database. The previous tenant middleware opened a tenant database from the request hostname before authentication or membership authorization.

## Decision

- Store users, tenants, and memberships in `control_db` through Prisma.
- Issue signed JWT access tokens containing only the user ID in `sub`.
- Use access tokens only until the frontend requires persistent sessions; add refresh-token rotation and hashed persistence when that requirement exists.
- Resolve tenant identity from the validated Classora subdomain to trusted control-database metadata.
- Verify `(tenantId, userId)` membership before acquiring any tenant database pool.
- Treat `OWNER`, `ADMIN`, and `STAFF` equally for tenant access in this phase.

Tenant-scoped request order is:

```text
authenticate user
→ resolve hostname to canonical tenant
→ verify membership in control_db
→ acquire server-resolved tenant database
→ execute operation
```

A tenant identifier, database name, or role supplied by a client is never sufficient authorization.

## Existing database rollout

Before the first deployment to an existing `control_db`, verify and back it up, then record the pre-Prisma schema baseline once:

```bash
pnpm --filter api run db:baseline
pnpm --filter api run db:migrate:deploy
```

Only the baseline is marked applied; the authentication migration must still run. Fresh databases skip this baseline command and receive the full migration history through `db:migrate:deploy`.

## Consequences

Login and `/auth/me` use only `control_db`. Tenant routes must use the tenant route guard/interceptor, and domain code accesses the already-authorized tenant pool through request context. Existing control databases must baseline the initial Prisma migration before applying later migrations.
