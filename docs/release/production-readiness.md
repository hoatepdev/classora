# Production readiness audit

- **Audit date:** 2026-09-20
- **Audited revision:** `a688959593d9d701c9bfcfff7a0b39abb09f569b`
- **Audited branch:** `feat/production-readiness-audit`
- **Release verdict:** **Not ready for production release**
- **Implementation status:** Repository hardening slice applied on 2026-09-20; external operator prerequisites remain open.

The application builds and the automated tests pass after implementing strict configuration, login throttling, database-aware readiness, explicit migration ordering, gateway hardening, and pinned Compose images. An isolated disposable Compose smoke run passed the migration service, gateway readiness, login, membership-authorized tenant query, tenant student write/read, API restart, and read-after-restart checks. The release gate remains blocked by fresh-versus-upgraded schema comparison, off-host backup/restore operations, and Cloudflare/VPS verification.

## Current architecture

The implemented deployment path matches the intended topology:

```text
Browser at <tenant>.classora.io.vn
  -> Cloudflare
  -> Cloudflare Tunnel
  -> VPS
  -> Nginx web gateway
       -> React static application
       -> /api -> NestJS API
  -> PostgreSQL
       -> control database
       -> one database per tenant
```

Evidence:

- Compose exposes only Nginx on the VPS loopback interface, keeps the API internal, and does not publish PostgreSQL: [`infrastructure/docker-compose.yml:1-59`](../../infrastructure/docker-compose.yml#L1-L59).
- Cloudflared connects after the web gateway is healthy: [`infrastructure/docker-compose.yml:61-72`](../../infrastructure/docker-compose.yml#L61-L72).
- Nginx serves the SPA and proxies `/api` to NestJS: [`apps/web/nginx.conf:8-23`](../../apps/web/nginx.conf#L8-L23).
- Nginx preserves the original tenant hostname with `Host $http_host` and `X-Forwarded-Host $http_host`: [`apps/web/nginx.conf:12-18`](../../apps/web/nginx.conf#L12-L18).
- The frontend uses same-origin `/api`: [`apps/web/src/lib/api.ts:3-26`](../../apps/web/src/lib/api.ts#L3-L26).
- NestJS resolves the tenant from the hostname, loads trusted control-database metadata, checks membership, and only then opens the tenant database: [`apps/api/src/tenant/tenant-resolver.service.ts:27-50`](../../apps/api/src/tenant/tenant-resolver.service.ts#L27-L50), [`apps/api/src/tenant/tenant-membership.guard.ts:27-50`](../../apps/api/src/tenant/tenant-membership.guard.ts#L27-L50), [`apps/api/src/tenant/tenant-connection.interceptor.ts:23-59`](../../apps/api/src/tenant/tenant-connection.interceptor.ts#L23-L59).

The repository does **not** contain executable Cloudflare Tunnel ingress or DNS configuration. `infrastructure/cloudflared/` contains only a placeholder; ingress and hostname behavior are manual dashboard steps described in [`docs/cloudflare-setup.md:87-122`](../cloudflare-setup.md#L87-L122). The live Cloudflare, VPS firewall, TLS, DNS, secret-manager, disk-monitoring, and off-host storage state therefore cannot be verified from this repository.

## Verified capabilities

### Build and test results

Executed successfully against the audited revision:

| Check | Result |
|---|---|
| `pnpm --filter web build` | Passed: TypeScript and Vite production build. Main JS chunk is 691.21 kB minified, triggering Vite's 500 kB warning. |
| `pnpm --filter api build` | Passed: Prisma client generation and NestJS production build. |
| `pnpm --filter api test` | Passed: 15 files, 101 tests. The logged `control database unavailable` error is an intentional exception-path test. |
| `pnpm --filter web exec tsc --noEmit` | Passed. |
| `pnpm --filter api exec tsc --noEmit` | Passed. |

The API tests are not real PostgreSQL integration tests. Domain specs emulate pools in memory and match SQL strings manually; for example, the students suite implements its fake at [`apps/api/test/students.e2e-spec.ts:42-103`](../../apps/api/test/students.e2e-spec.ts#L42-L103). The Compose smoke job now executes the built API/web gateway and migrations against disposable PostgreSQL, but it is intentionally separate from the in-memory API suite: [`.github/workflows/ci.yml:24-63`](../../.github/workflows/ci.yml#L24-L63).

### Authentication and tenant isolation

Verified controls:

- Argon2id password hashing for bootstrap and tenant provisioning: [`apps/api/src/database/create-owner.ts:18-27`](../../apps/api/src/database/create-owner.ts#L18-L27), [`apps/api/src/database/create-tenant.ts:102-114`](../../apps/api/src/database/create-tenant.ts#L102-L114).
- Dummy-hash verification and generic invalid-credential errors reduce account enumeration: [`apps/api/src/auth/auth.service.ts:7-26`](../../apps/api/src/auth/auth.service.ts#L7-L26).
- `JWT_SECRET` is required and must be at least 32 bytes: [`apps/api/src/auth/auth.module.ts:7-16`](../../apps/api/src/auth/auth.module.ts#L7-L16).
- JWTs contain only the user ID and active status is rechecked from the control database: [`apps/api/src/auth/auth.service.ts:17-26`](../../apps/api/src/auth/auth.service.ts#L17-L26), [`apps/api/src/auth/auth.guard.ts:32-68`](../../apps/api/src/auth/auth.guard.ts#L32-L68).
- Authentication and tenant guards are global: [`apps/api/src/app.module.ts:18-36`](../../apps/api/src/app.module.ts#L18-L36).
- Membership is verified using authenticated user and resolved tenant IDs before tenant pool acquisition: [`apps/api/src/tenant/tenant-membership.guard.ts:35-50`](../../apps/api/src/tenant/tenant-membership.guard.ts#L35-L50).
- Tenant pools have bounded caching, active-request accounting, idle eviction, and shutdown cleanup: [`apps/api/src/tenant/tenant-connection-manager.service.ts:3-110`](../../apps/api/src/tenant/tenant-connection-manager.service.ts#L3-L110).
- `OWNER`, `ADMIN`, and `STAFF` intentionally have equal access in this phase; this is not an accidental authorization omission: [`docs/adr/0001-authentication-and-tenant-authorization.md:13-18`](../adr/0001-authentication-and-tenant-authorization.md#L13-L18).

### Application domains and frontend

The requested operational domains are present and registered:

- Students and Teachers: list, detail, create, and update/disable.
- Courses and Classes: list, detail, create, update, and course/class relationship.
- Enrollments: enroll/reactivate, withdraw, class roster, and student classes.
- Schedules: create, update, detail, class/teacher lists, conflict detection, and tenant advisory locking.
- Attendance: session creation, enrollment roster snapshot, record updates, completion, and class/student history.

Registration and routes: [`apps/api/src/app.module.ts:18-30`](../../apps/api/src/app.module.ts#L18-L30), [`apps/web/src/App.tsx:19-44`](../../apps/web/src/App.tsx#L19-L44).

All reviewed domain SQL is tenant-filtered. The main list pages implement loading, error, empty, and retry states; forms generally expose mutation failures and invalidate TanStack Query data. Enrollments, schedules, and attendance are intentionally embedded in class/student workflows rather than exposed as independent navigation areas.

Domain invariants verified in code include canonical enrollment uniqueness, schedule conflict protection, attendance roster snapshots, and protection against editing completed attendance: [`apps/api/prisma/tenant/schema.prisma:86-100`](../../apps/api/prisma/tenant/schema.prisma#L86-L100), [`apps/api/src/schedules/schedules.service.ts:130-170`](../../apps/api/src/schedules/schedules.service.ts#L130-L170), [`apps/api/src/schedules/schedules.service.ts:289-367`](../../apps/api/src/schedules/schedules.service.ts#L289-L367), [`apps/api/src/attendance/attendance.service.ts:168-227`](../../apps/api/src/attendance/attendance.service.ts#L168-L227), [`apps/api/src/attendance/attendance.service.ts:263-303`](../../apps/api/src/attendance/attendance.service.ts#L263-L303).

## Release blockers

### B1. Production database configuration does not fail closed — addressed in repository code; operator verification remains

Prisma, runtime control access, tenant migration, provisioning, and tenant pools now use the shared strict configuration module, which rejects blank required values, invalid ports, and the `change-me` password placeholder: [`apps/api/src/config.ts:1-47`](../../apps/api/src/config.ts#L1-L47), [`apps/api/prisma.config.ts:1-12`](../../apps/api/prisma.config.ts#L1-L12), [`apps/api/src/database/control-database.service.ts:1-20`](../../apps/api/src/database/control-database.service.ts#L1-L20). Compose requires the API/database variables it interpolates and uses the same API port from the environment: [`infrastructure/docker-compose.yml:21-69`](../../infrastructure/docker-compose.yml#L21-L69), [`apps/api/src/main.ts:7-17`](../../apps/api/src/main.ts#L7-L17). Focused tests cover placeholder, invalid-port, URL-encoding, and API config behavior: [`apps/api/test/config.e2e-spec.ts:1-30`](../../apps/api/test/config.e2e-spec.ts#L1-L30).

The remaining production check is verifying the deployed secret source provides these values and does not retain bootstrap-only credentials.

### B2. Public authentication has no abuse control — addressed in repository code; edge policy remains

`POST /auth/login` is public and performs CPU-expensive Argon2 verification. It now has a 10 requests/minute application limit layered over a 120 requests/minute default in-memory limit, with a test asserting `429`. Because the current gateway path does not yet restore the original client IP from a trusted Cloudflare CIDR, the application limiter currently sees the gateway hop rather than each external client: [`apps/api/src/auth/auth.controller.ts:14-23`](../../apps/api/src/auth/auth.controller.ts#L14-L23), [`apps/api/src/app.module.ts:18-39`](../../apps/api/src/app.module.ts#L18-L39), [`apps/api/test/auth.e2e-spec.ts:141-153`](../../apps/api/test/auth.e2e-spec.ts#L141-L153). This limiter is single-instance only; edge enforcement and behavior behind Cloudflare remain operator verification.

**Exit condition:** configure trusted Cloudflare CIDR/real-IP handling and edge limits before relying on per-client behavior; replace in-memory storage before horizontal scaling.

### B3. Health checks can report healthy while required databases are unavailable — addressed in repository code

The public `/health` route remains process liveness only. Public `/health/ready` now runs `SELECT 1` against the control database and returns `503` on failure; API and web container checks use readiness, and PostgreSQL checks `CONTROL_DB_NAME`: [`apps/api/src/health.controller.ts:17-36`](../../apps/api/src/health.controller.ts#L17-L36), [`infrastructure/docker-compose.yml:11-18`](../../infrastructure/docker-compose.yml#L11-L18), [`infrastructure/docker-compose.yml:31-69`](../../infrastructure/docker-compose.yml#L31-L69). Tests cover both readiness outcomes: [`apps/api/test/health.e2e-spec.ts:35-45`](../../apps/api/test/health.e2e-spec.ts#L35-L45).

Tenant query health remains authenticated and executes `SELECT 1`; readiness does not scan every tenant database on each request.

### B4. API availability is coupled to sequential migration of every tenant — addressed in repository deployment boundary; recovery remains operational

The API `start:prod` now starts only NestJS, while Compose runs control and tenant migrations in a one-shot `api-migrate` service before API startup: [`apps/api/package.json:15-18`](../../apps/api/package.json#L15-L18), [`infrastructure/docker-compose.yml:21-52`](../../infrastructure/docker-compose.yml#L21-L52). The tenant runner remains sequential and stops at the first failure; earlier tenants remain upgraded and later tenants remain untouched: [`apps/api/src/database/tenant-migrations.ts:112-147`](../../apps/api/src/database/tenant-migrations.ts#L112-L147). There is no in-process retry/backoff, durable run status, deployment lock, or multi-replica coordination.

The retry test only reruns mocked orchestration; it does not prove recovery from a failed Prisma ledger row or partially applied migration: [`apps/api/test/tenant-migrations.e2e-spec.ts:39-67`](../../apps/api/test/tenant-migrations.e2e-spec.ts#L39-L67).

**Exit condition:** establish one serialized release migration path, a retry/recovery runbook, partial-failure visibility, and explicit policy for whether one failed tenant blocks the whole API.

### B5. New-versus-upgraded tenant schema equivalence is conditional, not proven

Fresh empty databases receive the full tenant migration history. A legacy database is baselined only when it has the retired ledger, one `(version=1, name=students)` row, and an exact PostgreSQL catalog match for the supported students-plus-ledger baseline. The comparison checks columns, types, `CHAR(26)` lengths, nullability, defaults, table/constraint definitions, indexes, and extra public tables: [`apps/api/src/database/tenant-migrations.ts:23-218`](../../apps/api/src/database/tenant-migrations.ts#L23-L218).

The checked-in retired students schema and first Prisma migration are intended to match, and the runner now rejects missing or drifted legacy catalog objects instead of marking the Prisma baseline applied. No disposable-PostgreSQL test yet creates fresh and legacy databases, deploys both, and compares their complete catalogs. Existing migration tests cover the fail-closed decision with injected state fakes: [`apps/api/test/tenant-migrations.e2e-spec.ts:81-182`](../../apps/api/test/tenant-migrations.e2e-spec.ts#L81-L182).

**Exit condition:** run and retain an actual PostgreSQL catalog comparison for a fresh database and every supported legacy baseline; reject or explicitly reconcile drift before marking the baseline applied.

### B6. Production backup and restore are not operationally complete

The backup script safely validates registry rows, uses restrictive permissions, writes `.partial` files, includes the control database, and exits nonzero on partial failure: [`scripts/backup-tenants.sh:1-109`](../../scripts/backup-tenants.sh#L1-L109). However, backups remain only on the VPS under `infrastructure/backup`, with no scheduling, retention, pruning, encryption-at-rest policy, upload verification, alerts, or off-host copy. There is no restore script or full control-plus-all-tenants restore drill: [`docs/cloudflare-setup.md:206-271`](../cloudflare-setup.md#L206-L271).

This creates both disaster-recovery and disk-exhaustion risk. R2 is documented as infrastructure direction but no R2 integration exists: [`CONTEXT.md:238-255`](../../CONTEXT.md#L238-L255).

**Exit condition:** establish off-host backups, retention/pruning, failure alerting, documented RPO/RTO, and a successful restore drill that includes the control database and tenant registry/database mapping.

### B7. Deployment and rollback are not reproducible or verified — partially addressed; smoke and rollback evidence remain

Deployment is manual `docker compose --profile production up -d --build`; CI includes a disposable Compose smoke job that runs the migration service, gateway, login, tenant write/read, restart, and log collection. The local disposable smoke run passed, but image publication/promotion, release pin, and rollback evidence remain open: [`.github/workflows/ci.yml:8-64`](../../.github/workflows/ci.yml#L8-L64), [`scripts/smoke-prod.sh:1-93`](../../scripts/smoke-prod.sh#L1-L93), [`docs/cloudflare-setup.md:122-169`](../cloudflare-setup.md#L122-L169).

Cloudflare Tunnel ingress/DNS remains manual and absent from executable repository configuration. Compose now pins the PostgreSQL and Cloudflared image tags and keeps Cloudflared behind an explicit production profile: [`infrastructure/docker-compose.yml:54-83`](../../infrastructure/docker-compose.yml#L54-L83). This is not an immutable digest or a substitute for release artifact publication.

**Exit condition:** pin deployable artifacts, record/version the effective Tunnel ingress, document and test rollback boundaries (including forward-only schema compatibility), and execute a production-like Compose/topology smoke test.

### B8. Critical production paths lack complete live integration evidence — repository smoke verified

API tests broadly cover application behavior but use an in-memory SQL fake; no test executes real PostgreSQL constraints or migrations. The web package has no test script or browser tests: [`apps/web/package.json:5-37`](../../apps/web/package.json#L5-L37), [`apps/api/vitest.config.ts:3-8`](../../apps/api/vitest.config.ts#L3-L8), [`.github/workflows/ci.yml:16-22`](../../.github/workflows/ci.yml#L16-L22).

The disposable Compose smoke run verified the combined path: tenant hostname -> Nginx Host forwarding -> login -> membership -> real tenant pool -> representative domain write/read -> API restart -> read-after-restart. `scripts/smoke-prod.sh` exercises this path against built images and cleans up its isolated project and volume on exit. This closes the repository-level end-to-end evidence gap without proving live Cloudflare/VPS behavior.

**Repository exit condition:** satisfied by the disposable Compose smoke. **Live deployment exit condition:** verify the same path through the actual Cloudflare Tunnel, VPS, and production secret/runtime configuration.

## High priority hardening

These items should be resolved before or immediately after the blockers, but repository evidence does not independently make each one a release stop:

1. **Security headers and request limits.** No repository-defined HSTS, CSP, frame protection, `X-Content-Type-Options`, Referrer-Policy, Permissions-Policy, or explicit body-size limit exists: [`apps/api/src/main.ts:7-15`](../../apps/api/src/main.ts#L7-L15), [`apps/web/nginx.conf:1-24`](../../apps/web/nginx.conf#L1-L24). Confirm which headers Cloudflare supplies before adding duplicates.
2. **Swagger exposure.** Swagger UI and raw JSON are unauthenticated when `ENABLE_SWAGGER=true`: [`apps/api/src/openapi.ts:394-423`](../../apps/api/src/openapi.ts#L394-L423). It defaults off; production must keep it off or restrict it to trusted access.
3. **Bearer token storage.** The access token is stored in `localStorage`, so successful same-origin XSS can exfiltrate it: [`apps/web/src/auth/LoginPage.tsx:20-24`](../../apps/web/src/auth/LoginPage.tsx#L20-L24), [`apps/web/src/lib/api.ts:3-25`](../../apps/web/src/lib/api.ts#L3-L25). This is an accepted access-token-only phase, but it raises the importance of CSP and XSS prevention.
4. **Operational error handling.** Provisioning and migration tools propagate raw third-party errors after limited URL redaction: [`apps/api/src/database/create-tenant.ts:48-65`](../../apps/api/src/database/create-tenant.ts#L48-L65), [`apps/api/src/database/create-tenant.ts:142-152`](../../apps/api/src/database/create-tenant.ts#L142-L152), [`apps/api/src/database/tenant-migrations.ts:78-86`](../../apps/api/src/database/tenant-migrations.ts#L78-L86), [`apps/api/src/database/tenant-migrations.ts:123-147`](../../apps/api/src/database/tenant-migrations.ts#L123-L147). Establish structured redaction and log retention.
5. **Tenant pool behavior.** Runtime tenant pools have no connection timeout/TLS option, use shared PostgreSQL credentials, and fail when all ten cached pools are active: [`apps/api/src/tenant/tenant-connection-manager.service.ts:3-5`](../../apps/api/src/tenant/tenant-connection-manager.service.ts#L3-L5), [`apps/api/src/tenant/tenant-connection-manager.service.ts:29-55`](../../apps/api/src/tenant/tenant-connection-manager.service.ts#L29-L55), [`apps/api/src/tenant/tenant-connection-manager.service.ts:91-100`](../../apps/api/src/tenant/tenant-connection-manager.service.ts#L91-L100). Confirm expected tenant concurrency and network trust before changing the architecture.
6. **Database-name defense in depth.** Runtime tenant routing trusts control metadata and rejects only an exact control DB name in the migration URL builder: [`apps/api/src/database/tenant-migrations.ts:15-23`](../../apps/api/src/database/tenant-migrations.ts#L15-L23), [`apps/api/src/tenant/tenant-connection-manager.service.ts:29-51`](../../apps/api/src/tenant/tenant-connection-manager.service.ts#L29-L51). Validate the registry's naming/ownership invariant during provisioning and migration.
7. **Tenant-aware relational integrity.** Tenant database foreign keys reference IDs only rather than `(tenant_id, id)`: [`apps/api/prisma/tenant/migrations/20260915000000_enrollments/migration.sql:10-12`](../../apps/api/prisma/tenant/migrations/20260915000000_enrollments/migration.sql#L10-L12), [`apps/api/prisma/tenant/migrations/20260915110000_schedules/migration.sql:13-15`](../../apps/api/prisma/tenant/migrations/20260915110000_schedules/migration.sql#L13-L15), [`apps/api/prisma/tenant/migrations/20260915120000_attendance/migration.sql:13-17`](../../apps/api/prisma/tenant/migrations/20260915120000_attendance/migration.sql#L13-L17), [`apps/api/prisma/tenant/migrations/20260915120000_attendance/migration.sql:36-38`](../../apps/api/prisma/tenant/migrations/20260915120000_attendance/migration.sql#L36-L38). Database-per-tenant and tenant-filtered application queries are the current isolation boundary; composite keys would add protection against malformed direct writes.
8. **Disabled-resource invariants.** Enrollment, scheduling, and attendance services verify related-row existence but do not consistently require related students/classes/teachers/schedules to be active: [`apps/api/src/enrollments/enrollments.service.ts:66-101`](../../apps/api/src/enrollments/enrollments.service.ts#L66-L101), [`apps/api/src/schedules/schedules.service.ts:289-308`](../../apps/api/src/schedules/schedules.service.ts#L289-L308), [`apps/api/src/attendance/attendance.service.ts:397-443`](../../apps/api/src/attendance/attendance.service.ts#L397-L443). Product rules should explicitly decide these transitions before changing behavior.
9. **Frontend shell failure states.** Auth/tenant queries in the app shell lack explicit pending/error/retry presentation, and several detail/relationship errors lack retry controls: [`apps/web/src/components/layout/AppShell.tsx:10-42`](../../apps/web/src/components/layout/AppShell.tsx#L10-L42), [`apps/web/src/features/classes/ClassDetail.tsx:68-76`](../../apps/web/src/features/classes/ClassDetail.tsx#L68-L76), [`apps/web/src/features/classes/ClassDetail.tsx:126-137`](../../apps/web/src/features/classes/ClassDetail.tsx#L126-L137).
10. **Schema/API contract mismatch.** `Class.courseId` is nullable for legacy rows in Prisma/OpenAPI, while create/update API DTOs require a course and reject `null`: [`apps/api/prisma/tenant/schema.prisma:46-64`](../../apps/api/prisma/tenant/schema.prisma#L46-L64), [`apps/api/src/openapi.ts:133-154`](../../apps/api/src/openapi.ts#L133-L154), [`apps/api/src/classes/dto/create-class.dto.ts:15-18`](../../apps/api/src/classes/dto/create-class.dto.ts#L15-L18), [`apps/api/src/classes/dto/update-class.dto.ts:20-25`](../../apps/api/src/classes/dto/update-class.dto.ts#L20-L25). Runtime behavior matches the documented rule that new classes require a course; the published contract should make that distinction clear.
11. **Container hardening.** Runtime images do not declare an explicit non-root user, read-only filesystem, dropped capabilities, or resource limits: [`apps/api/Dockerfile:19-33`](../../apps/api/Dockerfile#L19-L33), [`apps/web/Dockerfile:13-18`](../../apps/web/Dockerfile#L13-L18), [`infrastructure/docker-compose.yml:1-75`](../../infrastructure/docker-compose.yml#L1-L75).
12. **Provisioning cleanup.** Failed tenant provisioning attempts best-effort database deletion; failed cleanup can leave an orphan database requiring operator reconciliation: [`apps/api/src/database/create-tenant.ts:52-67`](../../apps/api/src/database/create-tenant.ts#L52-L67), [`apps/api/src/database/create-tenant.ts:117-153`](../../apps/api/src/database/create-tenant.ts#L117-L153).

## Non-blocking improvements

- Add pagination/filtering before tenant lists become large; current domain lists are unbounded.
- Split the 691.21 kB frontend main chunk when measured load performance requires it.
- Add web unit/component coverage after the production smoke path; do not create a broad suite merely to increase counts.
- Add JWT issuer/audience constraints and refresh-token rotation only when persistent sessions or multiple token consumers require them, consistent with [`docs/adr/0001-authentication-and-tenant-authorization.md:13-18`](../adr/0001-authentication-and-tenant-authorization.md#L13-L18).
- Add migration status reporting and per-tenant observability without pretending cross-database migration can be globally atomic.
- Add metrics, tracing, centralized logs, uptime checks, and disk alerts based on the chosen operator stack. Current operations rely on Docker stdout logs: [`docs/cloudflare-setup.md:150-156`](../cloudflare-setup.md#L150-L156).
- Reconcile remaining documentation drift in `docs/tech-stack.md`; repository Compose and Cloudflare setup now use `WEB_PORT=4100`, while automated deployment/R2 language still exceeds the implementation.
- Billing/tuition, dashboard, QR attendance, custom permissions, and tenant administration are product-scope gaps, not blockers introduced by this production-readiness audit. Implement them only against a concrete release requirement.

## Environment inventory

No deprecated environment variables were confirmed.

| Variable | Classification | Production assessment |
|---|---|---|
| `POSTGRES_PASSWORD` | Required production secret | Shared config rejects blank and `change-me`; Compose also requires a value. Example is blank and must be set outside Git. |
| `JWT_SECRET` | Required production secret | Correctly fails closed and enforces at least 32 bytes. |
| `CLOUDFLARE_TUNNEL_TOKEN` | Required production secret | Required when Compose manages Cloudflared. Missing/blank value is not explicitly validated. |
| `TUNNEL_TOKEN` | Internal container secret alias | Compose maps `CLOUDFLARE_TUNNEL_TOKEN` to this Cloudflared variable; operators should not configure a second value. |
| `INITIAL_USER_PASSWORD` | Required bootstrap secret | Required only for `auth:create-owner`; minimum 12 characters. Remove from steady-state API environment after bootstrap. |
| `TENANT_OWNER_PASSWORD` | Required provisioning secret | Required only when creating a tenant with a new owner. Undocumented in `.env.example` and deployment setup. |
| `PORT` | Required production config | Shared config validates it; Compose requires it and the application uses the same value. |
| `POSTGRES_HOST` | Required production config | Shared config requires a nonblank value; the example uses the Compose service name. |
| `POSTGRES_PORT` | Required production config | Shared config requires a valid TCP port; the example uses `5432`. |
| `POSTGRES_USER` | Required production config | Shared config requires a nonblank value; Compose requires it too. |
| `POSTGRES_DB` | Required production config | PostgreSQL bootstrap/default DB. Distinct from the application control DB. |
| `CONTROL_DB_NAME` | Required production config | Shared config and Compose require it; PostgreSQL health checks and application access use the same value. |
| `NODE_ENV` | Required production config | Must be exactly `production` to disable the development tenant fallback. Docker currently sets it. |
| `WEB_PORT` | Required deployment config | Host loopback binding for Nginx; repository default is canonically `4100`. |
| `JWT_ACCESS_TTL` | Optional | Defaults to `1h`; validate accepted duration syntax. |
| `ENABLE_SWAGGER` | Optional | Defaults false. Keep false in public production or protect the routes. |
| `INITIAL_USER_EMAIL` | Optional/bootstrap-only | Required by `auth:create-owner`, not by steady-state runtime. |
| `INITIAL_USER_NAME` | Optional/bootstrap-only | Required by `auth:create-owner`, not by steady-state runtime. |
| `INITIAL_TENANT_SLUG` | Optional/bootstrap-only | Required by `auth:create-owner`. Bootstrap SQL is coupled to the `demo` tenant. |
| `DEV_TENANT_SLUG` | Development only | Fallback applies whenever `NODE_ENV` is not exactly `production`; never set in staging/production. |
| `DATABASE_URL` | Internal generated config | Generated per tenant for Prisma child processes; not an operator-facing runtime variable and must not be logged. |

Documentation coverage:

- `TENANT_OWNER_PASSWORD`, `DEV_TENANT_SLUG`, and `NODE_ENV` are documented in [`infrastructure/.env.example`](../../infrastructure/.env.example).
- The API receives the entire `.env` via Compose, including bootstrap values if operators leave them present: [`infrastructure/docker-compose.yml:21-27`](../../infrastructure/docker-compose.yml#L21-L27).
- `.env` files are excluded from Git and Docker build context; no committed production secret was found: [`.gitignore:3-10`](../../.gitignore#L3-L10), [`.dockerignore:5`](../../.dockerignore#L5).
- No `VITE_*`/`import.meta.env` secret path exists; the frontend has no build-time server secret inventory.

## Database/migration assessment

### Control schema

The control schema contains tenants, users, and memberships with unique tenant slug/domain/database name, unique user email, unique membership `(tenant_id, user_id)`, membership lookup index, and restrictive foreign keys: [`apps/api/prisma/schema.prisma:14-62`](../../apps/api/prisma/schema.prisma#L14-L62).

Control migration inventory:

| Migration | Assessment |
|---|---|
| `0_existing_control_schema` | Creates tenants and unique indexes, then inserts a fixed `demo` tenant using `classora_tenant_demo`: [`migration.sql:1-19`](../../apps/api/prisma/migrations/0_existing_control_schema/migration.sql#L1-L19). This is coupled to PostgreSQL init and bootstrap assumptions. |
| `20260911000000_add_authentication` | Adds user/role enums, users, memberships, uniqueness/indexes, and restrictive tenant/user FKs: [`migration.sql:1-36`](../../apps/api/prisma/migrations/20260911000000_add_authentication/migration.sql#L1-L36). |
| `20260914000000_remove_tenant_schema_version` | Drops the obsolete control-side schema counter in favor of tenant Prisma ledgers: [`migration.sql:1-4`](../../apps/api/prisma/migrations/20260914000000_remove_tenant_schema_version/migration.sql#L1-L4). |

The control baseline command is intentionally manual for an existing pre-Prisma control database: [`apps/api/package.json:7-10`](../../apps/api/package.json#L7-L10), [`docs/adr/0001-authentication-and-tenant-authorization.md:32-45`](../adr/0001-authentication-and-tenant-authorization.md#L32-L45). Applying it to the wrong database would falsely mark schema as present; this must remain a controlled one-time operation.

### Tenant schema

Tenant migration inventory:

| Migration | Assessment |
|---|---|
| `20260912000000_students` | Baseline students table, tenant/code unique constraint, status check, and tenant/name index. |
| `20260914000000_drop_legacy_tenant_migrations` | Drops the retired migration ledger after Prisma adoption. |
| `20260914010000_classes` | Adds classes, tenant/code unique constraint, status check, and tenant/name index. |
| `20260915000000_enrollments` | Adds canonical student/class enrollment uniqueness, status check, FKs, and class roster index. |
| `20260915100000_teachers` | Adds teachers, tenant/code unique constraint, status check, and tenant/name index. |
| `20260915110000_schedules` | Adds class/teacher FKs, day/status/time checks, active partial uniqueness, and class/teacher schedule indexes. |
| `20260915120000_attendance` | Adds attendance sessions/records, time/status checks, occurrence and schedule-date uniqueness, record uniqueness, FKs, and history indexes. |
| `20260916000000_courses` | Adds courses, constraints/index, nullable legacy `classes.course_id`, course FK, and class-by-course index. |

The Prisma tenant schema matches the reviewed migration end state, including comments for partial unique indexes Prisma cannot model: [`apps/api/prisma/tenant/schema.prisma:11-163`](../../apps/api/prisma/tenant/schema.prisma#L11-L163).

### Provisioning and equivalence verdict

New tenant provisioning creates an empty database, deploys the tenant schema, and only then transactionally creates the control tenant, owner, and membership: [`apps/api/src/database/create-tenant.ts:117-155`](../../apps/api/src/database/create-tenant.ts#L117-L155). This ordering prevents publishing a tenant whose initial migration failed.

**Verdict:** a fresh tenant and a truly exact retired-runner tenant are expected to converge from the checked-in artifacts. Equivalence is **not verified for an arbitrary upgraded tenant** because baseline detection does not validate the actual students catalog or detect drift, and CI never compares real PostgreSQL catalogs. This is blocker B5.

### Retry and partial failure

- Prisma tracks each database independently in `_prisma_migrations`.
- The application runner has no retry/backoff and stops at the first failed tenant.
- Databases migrated earlier in the run stay migrated; no global rollback is possible or claimed.
- Recovery from an actual failed/partially applied Prisma migration is not tested.
- Failed provisioning attempts database cleanup, but cleanup itself is best-effort and can leave an orphan.

### Tenant isolation assumptions

The primary isolation boundary is one database per tenant. Every reviewed tenant row also carries `tenant_id`, and application queries filter by it. Tenant pools currently share PostgreSQL host/user/password, and FKs are not tenant-composite. These are explicit defense-in-depth limits, not evidence that the request path currently chooses databases from untrusted client input.

## Backup/restore assessment

### Verified

- Control and all registry tenant databases are included.
- Registry slugs/database names are validated before use.
- The control database cannot be accepted as a tenant backup target.
- Dumps use custom format without ownership/privilege restoration.
- Restrictive `umask`, `.partial` files, atomic rename, summary, and nonzero partial-failure exit are implemented: [`scripts/backup-tenants.sh:1-109`](../../scripts/backup-tenants.sh#L1-L109).

### Missing for release

- Scheduler and owner.
- Off-host/R2 transfer and upload verification.
- Encryption and key-management decision.
- Retention and local pruning.
- Failure alerting.
- Capacity/disk monitoring.
- Automated full restore procedure.
- Periodic restore drill with documented RPO/RTO.
- A consistency policy across control and separately dumped tenant databases.

Current state is not sufficient for production disaster recovery; see blocker B6.

## Deployment assessment

### Verified repository behavior

- Web and API multi-stage images build.
- Nginx serves static assets and preserves tenant Host for `/api`.
- Compose keeps API/PostgreSQL internal and binds Nginx to loopback.
- PostgreSQL has a named persistent volume: [`infrastructure/docker-compose.yml:43-52`](../../infrastructure/docker-compose.yml#L43-L52), [`infrastructure/docker-compose.yml:74-75`](../../infrastructure/docker-compose.yml#L74-L75).
- Restart policies and basic dependency ordering exist.

### Unverified or absent

- Effective Cloudflare Tunnel ingress, DNS, TLS, and Host-header settings.
- VPS firewall and direct-origin reachability.
- Production secret distribution/rotation.
- Reproducible image publication and immutable release identifiers.
- Serialized migration release step.
- Post-deployment readiness/smoke gate through the live Cloudflare/VPS topology (repository smoke is verified).
- Rollback procedure and schema compatibility policy.
- Monitoring, alerting, log shipping, and retention.
- Disk thresholds for PostgreSQL, Docker, and local backups.
- R2 bucket/configuration and restore credentials.
- Resource limits and container runtime hardening.

The PostgreSQL init script creates `CONTROL_DB_NAME` and always creates `classora_tenant_demo`: [`infrastructure/postgres-init/01-control-db.sql:1-5`](../../infrastructure/postgres-init/01-control-db.sql#L1-L5). That matches the fixed control baseline row but is not a general tenant-provisioning path.

## Release checklist

### Repository gate

- [x] Web production build passes.
- [x] API production build passes.
- [x] TypeScript checks pass.
- [x] Compose configuration resolves successfully with the local environment file.
- [x] Disposable Compose smoke execution passes migration, gateway, login, tenant write/read, API restart, and read-after-restart.
- [x] Current API test suite passes: 15 files, 101 tests (2026-09-20 implementation run).
- [x] Intended production topology is understood.
- [x] Nginx original tenant Host preservation is verified in configuration.
- [x] Every checked-in control and tenant migration was inspected.
- [x] Every discovered environment variable is classified.
- [x] Release blockers are explicitly listed with file/code evidence.
- [ ] No major unknown production path remains.

### Blocker exit checklist

- [x] B1: repository configuration fails closed and Compose/application settings agree; verify deployed secret injection.
- [x] B2: application login/API abuse control is implemented; verify edge behavior and single-instance limitation.
- [x] B3: database-aware readiness and operator health semantics are implemented.
- [x] B4: API startup is separated from the explicit migration service; retry, partial-failure, and concurrency operations remain documented prerequisites.
- [ ] B5: fresh and supported legacy tenant schemas are compared on real PostgreSQL and drift is handled.
- [ ] B6: off-host backups, retention, alerts, and a successful full restore drill exist.
- [ ] B7: effective Tunnel config, release artifact immutability, rollback, and successful production-like Compose smoke are established.
- [x] B8: disposable built artifacts and PostgreSQL smoke verifies gateway readiness, login, tenant query, tenant student write/read, API restart, and read-after-restart; live Cloudflare/VPS behavior remains open.

### Pre-release operator verification

- [ ] Confirm Cloudflare sends the original tenant hostname and does not rewrite `Host`.
- [ ] Confirm the API and PostgreSQL are unreachable except through the intended internal network/gateway.
- [ ] Confirm production TLS and HTTP security headers at Cloudflare/Nginx.
- [ ] Confirm Swagger is disabled or access-restricted.
- [ ] Confirm no bootstrap secrets remain in the steady-state API environment.
- [ ] Confirm PostgreSQL volume location, capacity, backup inclusion, and host recovery procedure.
- [ ] Confirm logs redact secrets and have retention/alerting.
- [ ] Confirm deploy and rollback responsibilities, commands, and decision points.

**Prompt 2 gate:** blocked. The repository builds, tests run, topology is understood, and blockers are explicit, but major production paths remain unverified until B1-B8 are closed or receive explicit, documented risk acceptance backed by operator evidence.
