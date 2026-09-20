# Cloudflare Setup for Classora

> Production domain: `classora.io.vn`

## 1. Architecture

Each tenant uses its own hostname and calls the API on the same origin:

```text
https://<tenant>.classora.io.vn
                 │
                 ▼
          Cloudflare Tunnel
                 │
                 ▼
            web:80 (Nginx)
              │       │
       static SPA     /api/*
                      │ strip /api, preserve Host
                      ▼
                  api:4101
                      │
                      ▼
                PostgreSQL
```

The browser always calls relative `/api` URLs. It must never send a tenant ID, database name, or custom tenant header. Nginx preserves the original `<tenant>.classora.io.vn` `Host`; NestJS resolves that hostname against trusted control-database metadata before opening a tenant database.

Public and internal paths are intentionally different:

```text
Public                     Internal NestJS
/api/health             -> /health
/api/auth/login         -> /auth/login
/api/students           -> /students
/api/students/:id       -> /students/:id
```

Do not add a global `/api` prefix in NestJS while the gateway strips this prefix.

## 2. Containers

Docker Compose runs:

```text
web          Nginx serving the Vite build and proxying /api
api          NestJS
postgres     control and tenant databases
cloudflared  outbound Cloudflare Tunnel connector
```

Only the web gateway receives Tunnel traffic. API port `4101` and PostgreSQL port `5432` stay inside the Docker network. The `api-migrate` service must complete successfully before the API is started; migration failures are fixed and rerun rather than bypassed.

For local verification, Compose binds the gateway only to loopback:

```text
127.0.0.1:${WEB_PORT:-4100}
```

This is not a public production port.

## 3. Environment

Copy `infrastructure/.env.example` to an untracked `infrastructure/.env` and set real values there.

```env
PORT=4101
WEB_PORT=4100
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=classora
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=classora
CONTROL_DB_NAME=control_db
JWT_SECRET=<at-least-32-characters>
INITIAL_USER_EMAIL=<owner-email>
INITIAL_USER_PASSWORD=<at-least-12-characters>
INITIAL_USER_NAME=<owner-name>
INITIAL_TENANT_SLUG=demo
CLOUDFLARE_TUNNEL_TOKEN=<tunnel-token>
```

Do not commit `.env`, passwords, JWT secrets, or Tunnel tokens.

The browser uses same-origin `/api`, so production does not require CORS configuration.

## 4. Create the Tunnel

In Cloudflare Dashboard:

```text
Networking
→ Tunnels
→ Create Tunnel
```

Name it `classora-production`, choose the `cloudflared` connector, and put only its Tunnel token in `infrastructure/.env`.

The Compose service runs the remotely managed Tunnel:

```text
cloudflared tunnel --no-autoupdate run
```

Do not confuse a Tunnel token with a Cloudflare API token.

## 5. Publish tenant hostnames

In the `classora-production` Tunnel, add a wildcard public hostname:

```text
Hostname: *.classora.io.vn
Service:  http://web:80
```

Leave the origin HTTP Host Header override unset. The web gateway must receive the original public tenant hostname.

Configure the corresponding proxied wildcard DNS record in Cloudflare. Exact records such as the apex or a marketing site may remain separate because exact DNS records take precedence over the wildcard.

Do not publish a separate browser API at `api.classora.io.vn`: that would replace the request hostname and prevent the current hostname-based tenant resolver from identifying the tenant.

These are Cloudflare Dashboard operations; repository deployment does not perform them automatically.

## 6. Start and inspect

Cloudflare does not deploy the application. GitHub Actions publishes immutable GHCR images, and an operator explicitly deploys a selected digest-qualified release with [`scripts/deploy-prod.sh`](../scripts/deploy-prod.sh). The production Compose overlay requires `WEB_IMAGE` and `API_IMAGE`; it removes application build directives, and `api` plus `api-migrate` use the same exact API image.

From the repository checkout on the operator host:

```bash
export COMPOSE_ENV_FILE=/etc/classora/production.env
export BACKUP_VERIFIED_FILE=/var/lib/classora/backups/verified/latest
export RELEASE_VERSION=vX.Y.Z
export RELEASE_SHA=<full-commit-sha>
export WEB_IMAGE=ghcr.io/hoatepdev/classora-web@sha256:<64-hex-digest>
export API_IMAGE=ghcr.io/hoatepdev/classora-api@sha256:<64-hex-digest>
export INITIAL_TENANT_SLUG=demo
./scripts/deploy-prod.sh
docker compose --env-file "$COMPOSE_ENV_FILE" -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.production.yml ps
```

The deploy script pulls exact images, runs the serialized migration once, and starts API/web only after migration succeeds. It never builds application source on the VPS.

Expected services:

```text
postgres      healthy
api           healthy
web           healthy
cloudflared   running
```

On the first deployment, create the initial owner and tenant membership once:

```bash
docker compose exec api npm run auth:create-owner
```

This command uses the `INITIAL_USER_*` and `INITIAL_TENANT_SLUG` values from `infrastructure/.env`. Do not add it to container startup: rerunning it updates the owner's password and membership.

Inspect logs:

```bash
docker compose logs -f api
docker compose logs -f web
docker compose logs -f cloudflared
```

## 7. Verify routing

Local gateway health check while preserving a tenant Host:

```bash
curl -H 'Host: demo.classora.io.vn' http://127.0.0.1:4100/api/health/ready
```

Public health check after Cloudflare configuration:

```bash
curl https://demo.classora.io.vn/api/health
```

Then verify the authenticated journey in a browser opened at the tenant hostname:

```text
/login
→ /students
→ /students/new
→ /students/:id
→ /students/:id/edit
```

Security checks:

- an unauthenticated tenant request returns `401` before a tenant pool is opened;
- a user without membership returns `403` before a tenant pool is opened;
- a student ID from another tenant returns `404`;
- browser requests contain no tenant ID/header/database name;
- neither port `4101` nor `5432` is publicly exposed.

## 8. Local tenant hostname

The Vite development server already proxies `/api` to NestJS, strips `/api`, and preserves the incoming Host. For browser testing, map a development tenant hostname to loopback outside the repository, for example:

```text
127.0.0.1 demo.classora.io.vn
```

Open:

```text
http://demo.classora.io.vn:4100
```

Direct `localhost` does not carry tenant identity and fails tenant resolution by default. To intentionally use it with `pnpm --filter api dev`, set `DEV_TENANT_SLUG=demo` in the untracked `apps/api/.env`.

## 9. Database backups

The production backup and restore contract is documented in [`docs/operations/backup-restore.md`](operations/backup-restore.md). It covers control plus all registered tenant databases, checksums, private R2 upload/verification, retention, scheduling, failure visibility, and disposable full restore verification.

The commands below remain useful for local inspection only; they do not replace the production runbook.

The backup script reads tenant database names from the trusted control-database registry and creates standard PostgreSQL custom-format archives. It also backs up the control database separately because the tenant registry, users, and memberships are required for full recovery.

Prerequisites:

- the Compose `postgres` service is running;
- `infrastructure/.env` contains the existing PostgreSQL and `CONTROL_DB_NAME` values;
- Docker Compose is installed;
- `infrastructure/backup/` has enough free disk space.

Run from the repository root:

```bash
./scripts/backup-tenants.sh
```

The script resolves repository paths from its own location, so an absolute path also works from another directory.

Each run uses one UTC timestamp and writes:

```text
infrastructure/backup/<YYYYMMDDTHHMMSSZ>/
  control-<timestamp>.dump
  tenant-<slug>-<timestamp>.dump
```

The script reports each control/tenant result and a final count. Dumps are taken sequentially, so they are independent database snapshots rather than one cross-database transaction. A failed dump has its `.partial` file removed; other registered tenants are still attempted, and any failure makes the command exit nonzero. An empty registry is reported explicitly.

Archives remain on local disk in this milestone. The repository has no R2 backup credentials or upload tool yet. Before scheduling production backups, configure authenticated R2 upload and upload verification, retention, scheduling, failure alerting, and periodic restore drills.

### Restore verification

Never restore automatically or into production. Verify an archive in an empty, temporary development database. Choose the tenant archive explicitly; do not derive it from untrusted input.

From the repository root, replace the archive path below with one produced by the backup script. The first command generates a unique temporary database name; `&&` prevents restore when database creation fails.

```bash
verify_db="classora_restore_verify_$(date -u +%Y%m%dT%H%M%SZ)"
docker compose --project-directory infrastructure -f infrastructure/docker-compose.yml \
  exec -T postgres sh -c 'createdb --username "$POSTGRES_USER" "$1"' sh "$verify_db" &&
docker compose --project-directory infrastructure -f infrastructure/docker-compose.yml \
  exec -T postgres sh -c \
  'pg_restore --exit-on-error --no-owner --no-privileges --username "$POSTGRES_USER" --dbname "$1"' sh "$verify_db" \
  < infrastructure/backup/<timestamp>/tenant-<slug>-<timestamp>.dump &&
docker compose --project-directory infrastructure -f infrastructure/docker-compose.yml \
  exec -T postgres sh -c \
  'psql -X --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$1" --command="SELECT to_regclass('\''public.students'\''), count(*) FROM students"' sh "$verify_db"
```

After successful verification, remove the temporary development database:

```bash
docker compose --project-directory infrastructure -f infrastructure/docker-compose.yml \
  exec -T postgres sh -c 'dropdb --username "$POSTGRES_USER" "$1"' sh "$verify_db"
```

Inspect a custom archive without restoring it:

```bash
docker compose --project-directory infrastructure -f infrastructure/docker-compose.yml \
  exec -T postgres pg_restore --list \
  < infrastructure/backup/<timestamp>/tenant-<slug>-<timestamp>.dump
```

For complete disaster recovery, restore the control archive separately, then restore each tenant archive into its registered database.

## 10. Operational rules

- Use one shared web image; do not deploy one frontend per tenant.
- Tenant identity comes from the validated hostname and trusted control database.
- Do not work around hostname resolution with a client tenant header.
- Do not expose PostgreSQL or NestJS directly to the Internet.
- Back up and verify databases before production migrations.
- Production deployment and Cloudflare mutations require explicit approval.
