# Production readiness audit

- **Audit date:** 2026-09-20
- **Audited revision:** current working revision after the B5/B6/B7 and final-gate changes
- **Audited branch:** `fix/b5-tenant-schema-equivalence`
- **Release verdict:** **Repository gate pending GitHub Actions green; live operator gate open**
- **Implementation status:** Repository configuration, HTTP security baseline, request diagnostics, health semantics, backup/release tooling, and runbooks are implemented. The current CI regression is being corrected; real VPS and Cloudflare verification remains required.

The repository gate covers strict production configuration, login throttling with trusted proxy handling, database-aware readiness, explicit migration ordering, schema equivalence, backup/restore verification, immutable image deployment, bounded logs, request IDs, security headers, and operator diagnostics. An isolated disposable Compose smoke run remains the end-to-end source of truth for migration, gateway readiness, login, membership-authorized tenant query, tenant write/read, restart persistence, and backup/restore. The repository gate cannot be marked ready until the `verify` and `compose-smoke` jobs pass in GitHub Actions on `main`; the remaining release gate is external evidence from the actual VPS and Cloudflare account.

### CI regression follow-up

The production hardening correctly made Prisma generation use strict database configuration, but both workflow `verify` jobs lacked explicit build-time configuration. The smoke jobs also wrote the copied `.env.example` with a literal `\\n`, producing one comment line; cleanup then failed Compose interpolation because the disabled Cloudflare token was empty. The fix supplies safe test-only API values, writes real newline-delimited smoke env files from `infrastructure/.env.example`, sets `CLOUDFLARE_TUNNEL_TOKEN=smoke-disabled`, and makes workflow diagnostics/teardown best-effort without changing `scripts/smoke-prod.sh` or removing B5/B6 checks.

Local verification on 2026-09-21 passed:

- `pnpm install --frozen-lockfile`
- `pnpm --filter web build`
- `pnpm --filter api build` with explicit test-only database/JWT configuration
- `pnpm --filter api test` — 15 files, 106 tests
- Generated smoke env validation and `docker compose ... config --quiet`
- `SMOKE_BACKUP_RESTORE=1 ./scripts/smoke-prod.sh` — B5 schema equivalence, migrations, gateway/readiness, login, tenant resolution, tenant write/read, restart persistence, and B6 backup/restore passed; the EXIT cleanup removed the disposable containers.

The latest available GitHub Actions run on `main` is `35525697742` for `a97e915`, and remains failed: `verify` stopped at API Prisma generation and `compose-smoke` stopped before startup; the workflow changes above have not been pushed, so no corrected GitHub result exists yet. Until a successful `main` run is available, repository-ready status remains pending.

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

### B2. Public authentication has no abuse control — repository control implemented; edge policy remains

`POST /auth/login` is public and performs CPU-expensive Argon2 verification. It has a 10 requests/minute application limit layered over a 120 requests/minute default in-memory limit. Nginx now maps `CF-Connecting-IP` only across the current Tunnel-to-gateway trust boundary before forwarding it to Express, so the application limiter no longer uses one shared Tunnel connector bucket. Edge/WAF enforcement and live Cloudflare behavior remain operator verification. The limiter remains single-instance only: [`apps/web/nginx.conf`](../../apps/web/nginx.conf), [`apps/api/src/main.ts`](../../apps/api/src/main.ts), [`apps/api/src/app.module.ts`](../../apps/api/src/app.module.ts).

**Exit condition:** repository real-IP handling is implemented; configure and verify Cloudflare edge limits before relying on them, and replace in-memory storage before horizontal scaling.

### B3. Health checks can report healthy while required databases are unavailable — addressed in repository code

`/health` remains a backwards-compatible process liveness endpoint and `/health/live` is the explicit liveness path. Public `/health/ready` runs `SELECT 1` against the control database and returns `503` on failure; API and web container checks use readiness, and PostgreSQL checks `CONTROL_DB_NAME`: [`apps/api/src/health.controller.ts`](../../apps/api/src/health.controller.ts), [`infrastructure/docker-compose.yml`](../../infrastructure/docker-compose.yml). Tests cover liveness and readiness outcomes. Tenant query health remains authenticated and executes `SELECT 1`; readiness does not scan every tenant database on each request.

### B4. API availability is coupled to sequential migration of every tenant — addressed in repository deployment boundary; recovery remains operational

The API `start:prod` now starts only NestJS, while Compose runs control and tenant migrations in a one-shot `api-migrate` service before API startup: [`apps/api/package.json:15-18`](../../apps/api/package.json#L15-L18), [`infrastructure/docker-compose.yml:21-52`](../../infrastructure/docker-compose.yml#L21-L52). The tenant runner remains sequential and stops at the first failure; earlier tenants remain upgraded and later tenants remain untouched: [`apps/api/src/database/tenant-migrations.ts:112-147`](../../apps/api/src/database/tenant-migrations.ts#L112-L147). There is no in-process retry/backoff, durable run status, deployment lock, or multi-replica coordination.

The retry test only reruns mocked orchestration; it does not prove recovery from a failed Prisma ledger row or partially applied migration: [`apps/api/test/tenant-migrations.e2e-spec.ts:39-67`](../../apps/api/test/tenant-migrations.e2e-spec.ts#L39-L67).

**Exit condition:** establish one serialized release migration path, a retry/recovery runbook, partial-failure visibility, and explicit policy for whether one failed tenant blocks the whole API.

### B5. New-versus-upgraded tenant schema equivalence is verified on disposable PostgreSQL

Fresh empty databases receive the full tenant migration history. The only supported legacy baseline is the retired runner's exact `(version=1, name=students)` students-plus-ledger catalog. The verifier creates disposable PostgreSQL databases, deploys a fresh database and that exact legacy fixture, compares normalized catalogs from `pg_catalog`, reruns an already-current database, and rejects missing columns, wrong types/lengths, missing indexes, extra public tables, and incorrect legacy ledger rows. It is run by `scripts/smoke-prod.sh` in the disposable Compose job using `pnpm --filter api run test:tenant-schema`; the command requires `B5_TEST_DATABASE=1`, permits only localhost/Compose PostgreSQL, uses generated database names, and cleans them up.

The normalized comparison includes public tables, ordered columns, PostgreSQL formatted types and typmods, nullability, defaults, primary/foreign/unique/check constraints, ordered index definitions and predicates, triggers, rules, policies, and row-level security. Prisma's internal migration ledger is excluded from business-schema equality and the retired ledger is removed by its migration. Existing injected-state tests remain as unit coverage for the fail-closed decision: [`apps/api/test/tenant-migrations.e2e-spec.ts:81-182`](../../apps/api/test/tenant-migrations.e2e-spec.ts#L81-L182).

**Implementation status:** covered by the disposable PostgreSQL verifier and the existing CI `compose-smoke` job design; repository-gate completion remains pending a successful GitHub Actions `compose-smoke` run. Arbitrary historical schemas remain unsupported and fail closed.

### B6. Production backup and restore — implementation present; verification remains open

The backup path now includes the trusted control database and every registered tenant database, validates a stable registry roster, writes restrictive custom-format dumps atomically, creates a manifest with per-artifact size/checksum/timestamps, prevents overlapping runs, records persistent success/failure status, and supports private Cloudflare R2 upload with post-upload size/checksum-metadata verification: [`scripts/backup-tenants.sh`](../../scripts/backup-tenants.sh), [`docs/operations/environment.md`](../operations/environment.md#L1-L20).

The disposable Compose smoke path provisions two tenants, seeds representative data, performs the real backup, verifies checksums, restores control and every tenant into generated non-production database names, verifies registry remapping/schema/data/tenant isolation, and cleans up generated databases: [`scripts/backup-restore-smoke.sh`](../../scripts/backup-restore-smoke.sh), [`scripts/restore-tenants.sh`](../../scripts/restore-tenants.sh), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml#L24-L62). Production scheduling and the recovery runbook are provided by [`infrastructure/systemd/classora-backup.timer`](../../infrastructure/systemd/classora-backup.timer) and [`docs/operations/backup-restore.md`](../operations/backup-restore.md).

The consistency model is honest: separate database dumps are not one cross-database atomic snapshot. The initial operational objectives are RPO <= 24 hours and RTO <= 4 hours; the runbook requires recording observed drill duration rather than claiming either objective is guaranteed.

**Implementation status:** covered by the Compose-backed multi-tenant backup/restore drill, checksums, restore mapping, tenant isolation checks, R2 upload verification code, retention logic, status markers, and recovery runbook; repository-gate completion remains pending a successful GitHub Actions `compose-smoke` run. **Production operator verification required:** configure and test real R2 credentials/connectivity, private-bucket policy, timer execution, stale-success/failure alerting, disk capacity, retention observation, and a measured production-like restore drill.

### B7. Deployment and rollback are not reproducible or verified — repository contract addressed; live verification remains open

The tag-only release workflow verifies the application, builds each web/API image once, publishes GHCR release and commit-SHA aliases, and records exact image digests. Production deployment accepts only digest-qualified `WEB_IMAGE` and `API_IMAGE` values, removes application build directives, pulls exact images, and uses the same API image for `api` and `api-migrate`: [`.github/workflows/release.yml`](../../.github/workflows/release.yml), [`infrastructure/docker-compose.production.yml`](../../infrastructure/docker-compose.production.yml), [`scripts/deploy-prod.sh`](../../scripts/deploy-prod.sh).

The deployment script requires a verified backup marker, current release record, disk preflight, merged Compose validation, and a host lock. It runs the serialized migration once and starts the new API/web release only after migration succeeds. Migration failures stop the release; Prisma migrations are forward-only. Application rollback is documented as selecting the previous immutable image pair without rerunning migrations, with B6 restore/roll-forward decisions for schema incompatibility: [`docs/release/process.md`](process.md), [`docs/operations/deployment.md`](../operations/deployment.md).

The existing disposable smoke remains the normal source-build CI path and now also supports explicit digest image mode and an optional read-only previous-image check. It covers migration, gateway readiness, original Host, login, membership, tenant read, representative write/read, restart, and persistence: [`scripts/smoke-prod.sh`](../../scripts/smoke-prod.sh), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

Cloudflare remains a manual contract: `*.classora.io.vn -> Cloudflare Tunnel -> http://web:80`, with no origin Host override. Nginx forwards the original Host to NestJS; API `4101` and PostgreSQL `5432` remain internal. Live dashboard, DNS, TLS, firewall, secret, backup, and VPS checks still require operator evidence: [`docs/cloudflare-setup.md`](../cloudflare-setup.md).

**Implementation status:** addressed by immutable release publication, digest-only production deployment, serialized migration, rollback policy, and image-based disposable smoke; repository-gate completion remains pending successful GitHub Actions verification and smoke jobs. **Live exit condition:** still open until the actual VPS and Cloudflare Tunnel satisfy the documented contract and a production-like release/rollback drill is recorded.

### B8. Critical production paths lack complete live integration evidence — repository smoke verified

API tests broadly cover application behavior but use an in-memory SQL fake; no test executes real PostgreSQL constraints or migrations. The web package has no test script or browser tests: [`apps/web/package.json:5-37`](../../apps/web/package.json#L5-L37), [`apps/api/vitest.config.ts:3-8`](../../apps/api/vitest.config.ts#L3-L8), [`.github/workflows/ci.yml:16-22`](../../.github/workflows/ci.yml#L16-L22).

The disposable Compose smoke run verified the combined path: tenant hostname -> Nginx Host forwarding -> login -> membership -> real tenant pool -> representative domain write/read -> API restart -> read-after-restart. `scripts/smoke-prod.sh` exercises this path against built images and cleans up its isolated project and volume on exit. This closes the repository-level end-to-end evidence gap without proving live Cloudflare/VPS behavior.

**Implementation status:** covered by the disposable Compose smoke; repository-gate completion remains pending a successful GitHub Actions smoke run. **Live deployment exit condition:** verify the same path through the actual Cloudflare Tunnel, VPS, and production secret/runtime configuration.

## High priority hardening

These items should be resolved before or immediately after the blockers, but repository evidence does not independently make each one a release stop:

1. **Security headers and request limits.** Nginx now owns HSTS, CSP, frame protection, `X-Content-Type-Options`, Referrer-Policy, Permissions-Policy, and the 1 MiB gateway body limit. Verify Cloudflare does not conflict with HSTS ownership and complete a browser CSP check on the live VPS.
2. **Swagger exposure.** Swagger UI and raw JSON are unauthenticated when `ENABLE_SWAGGER=true`: [`apps/api/src/openapi.ts:394-423`](../../apps/api/src/openapi.ts#L394-L423). It defaults off; production must keep it off or restrict it to trusted access.
3. **Bearer token storage.** The access token is stored in `localStorage`, so successful same-origin XSS can exfiltrate it: [`apps/web/src/auth/LoginPage.tsx:20-24`](../../apps/web/src/auth/LoginPage.tsx#L20-L24), [`apps/web/src/lib/api.ts:3-25`](../../apps/web/src/lib/api.ts#L3-L25). This is an accepted access-token-only phase, but it raises the importance of CSP and XSS prevention.
4. **Operational diagnostics.** Request IDs, bounded access/error metadata, Docker log rotation, and operator runbooks are now repository controls. Central log retention, alerting, and uptime monitoring remain operator-owned.
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

**Verdict:** a fresh tenant and the supported exact retired-runner tenant converge through the checked-in artifacts; the disposable PostgreSQL verifier rejects unsupported drift and arbitrary historical schemas fail closed. The B5 implementation and local smoke evidence are present; repository-gate completion remains pending a successful GitHub Actions run. Real production tenant inventories still require operator evidence before release.

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

The repository recovery path is production-shaped; actual R2 credentials, timer execution, alerting, capacity, retention, and a measured VPS restore drill remain operator gates.

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
- Post-deployment readiness/smoke gate through the live Cloudflare/VPS topology (repository smoke passed locally; corrected GitHub Actions evidence is pending).
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
- [x] Current API test suite passes: 15 files, 106 tests (2026-09-21 local verification).
- [x] Intended production topology is understood.
- [x] Nginx original tenant Host preservation is verified in configuration.
- [x] Every checked-in control and tenant migration was inspected.
- [x] Every discovered environment variable is classified.
- [x] Release blockers are explicitly listed with file/code evidence.
- [ ] Corrected GitHub Actions `verify` and `compose-smoke` jobs pass on `main`.
- [ ] No major unknown production path remains.

The checked items above are local repository evidence; they do not restore repository-ready status until the GitHub Actions gate is green.

### Blocker exit checklist

- [x] B1: repository configuration fails closed and Compose/application settings agree; verify deployed secret injection.
- [x] B2: application login/API abuse control is implemented; verify edge behavior and single-instance limitation.
- [x] B3: database-aware readiness and operator health semantics are implemented.
- [x] B4: API startup is separated from the explicit migration service; retry, partial-failure, and concurrency operations remain documented prerequisites.
- [x] B5: fresh and supported legacy tenant schemas are compared on real PostgreSQL and drift is handled by the disposable verifier.
- [x] B6: repository backup/restore drill, checksums, R2 upload path, retention, scheduling, status, and recovery runbook exist; real R2/VPS restore evidence remains an operator gate.
- [x] B7: repository release artifacts, digest-only deployment, serialized migration, rollback policy, Cloudflare contract, and image-based Compose smoke are established; live VPS/Tunnel evidence remains an operator gate.
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

## Evidence boundary

### Repository verified

- Strict configuration and production Swagger policy tests pass.
- Nginx security headers, body limit, original Host forwarding, and trusted client-IP mapping are checked in.
- Request IDs and redacted access/error diagnostics are implemented with bounded Docker log rotation.
- `/health` and `/health/live` are liveness; `/health/ready` checks control-database reachability and returns 503 on failure.
- B5 schema equivalence, B6 backup/restore smoke, B7 immutable deployment, and the production smoke path are repository checks.
- [environment.md](../operations/environment.md), [observability.md](../operations/observability.md), and [production-security.md](../security/production-security.md) are the operator contract.

### Operator verification required on the real VPS

- Root-owned secret files, bootstrap-secret removal, firewall exposure, filesystem/volume capacity, Docker restart behavior, systemd timer execution, backup freshness, R2 access/retention, alert delivery, release/rollback drill, and measured restore duration.

### Operator verification required in Cloudflare

- Full (strict) TLS, HTTPS-only behavior, DNS, Tunnel connector health, original Host preservation, no origin Host override, edge/WAF/rate-limit policy, Cloudflare HSTS ownership, and public browser/CSP behavior.

**Completion gate:** repository implementation and local evidence are present, but the repository-level release gate remains pending until corrected GitHub Actions `verify` and `compose-smoke` jobs pass on `main`. Production release also remains contingent on the explicit VPS and Cloudflare checks above; no external control is marked complete by repository tests.
