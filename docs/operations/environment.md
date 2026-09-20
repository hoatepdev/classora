# Production environment contract

The production API fails closed when required runtime configuration is missing or invalid. Store the runtime file outside Git, owned by root with mode `0600`; never copy real credentials into examples or release records.

## Runtime API and Compose variables

| Name | Service | Required? | Secret? | Classification | Production purpose | Safe example/default |
|---|---|---:|---:|---|---|---|
| `NODE_ENV` | API/Compose | yes | no | runtime | Selects production behavior and disables the development tenant fallback. | `production` |
| `PORT` | API | yes | no | runtime | Internal NestJS listen port. | `4101` |
| `WEB_PORT` | Compose/Nginx | yes | no | deployment | Loopback-only host port for the Nginx gateway. | `4100` |
| `POSTGRES_HOST` | API | yes | no | runtime | PostgreSQL service/host. | `postgres` |
| `POSTGRES_PORT` | API | yes | no | runtime | PostgreSQL TCP port. | `5432` |
| `POSTGRES_USER` | API/PostgreSQL | yes | no | runtime | Database login role. | `classora` |
| `POSTGRES_PASSWORD` | API/PostgreSQL | yes | yes | runtime secret | Shared PostgreSQL login password. `change-me` is rejected. | `<set outside Git>` |
| `POSTGRES_DB` | PostgreSQL | yes | no | bootstrap/runtime | PostgreSQL initialization database. | `classora` |
| `CONTROL_DB_NAME` | API/PostgreSQL | yes | no | runtime | Control database containing tenants, users, and memberships. | `control_db` |
| `JWT_SECRET` | API | yes | yes | runtime secret | Signs access tokens; must be at least 32 bytes. | `<random 32+ byte value>` |
| `JWT_ACCESS_TTL` | API | yes in production | no | runtime | Access-token lifetime. | `1h` |
| `ENABLE_SWAGGER` | API | yes | no | runtime policy | Must be `false` in production; enabled Swagger is unauthenticated. | `false` |
| `CLOUDFLARE_TUNNEL_TOKEN` | Compose/cloudflared | yes when production profile runs | yes | runtime secret | Authenticates the Tunnel connector. Compose maps it to `TUNNEL_TOKEN`. | `<Cloudflare token>` |
| `DEV_TENANT_SLUG` | API | forbidden | no | development-only | Local development fallback only. It must not exist in production. | unset |

Compose passes only the explicit runtime API allowlist to steady-state `api` and `api-migrate` containers. Bootstrap values therefore do not remain in the application environment after bootstrap.

## Bootstrap and provisioning variables

Use these only for the one-shot command that needs them, then remove them from the host environment:

| Name | Service | Required? | Secret? | Classification | Production purpose | Safe example/default |
|---|---|---:|---:|---|---|---|
| `INITIAL_USER_EMAIL` | `auth:create-owner` | yes for command | no | bootstrap-only | Initial owner email. | `owner@example.test` |
| `INITIAL_USER_PASSWORD` | `auth:create-owner` | yes for command | yes | bootstrap-only | Initial owner password; minimum 12 characters. | `<set for command only>` |
| `INITIAL_USER_NAME` | `auth:create-owner` | yes for command | no | bootstrap-only | Initial owner display name. | `Initial Owner` |
| `INITIAL_TENANT_SLUG` | `auth:create-owner`/deployment smoke | yes for command/smoke | no | bootstrap/deployment | Initial tenant hostname slug. | `demo` |
| `TENANT_OWNER_PASSWORD` | `tenant:create` | required for a new owner | yes | bootstrap-only | Password for a newly created tenant owner; minimum 12 characters. | `<set for command only>` |

Run bootstrap explicitly, for example:

```bash
docker compose --env-file "$COMPOSE_ENV_FILE" -f infrastructure/docker-compose.yml \
  run --rm --no-deps -e INITIAL_USER_EMAIL -e INITIAL_USER_PASSWORD \
  -e INITIAL_USER_NAME -e INITIAL_TENANT_SLUG api npm run auth:create-owner
```

Do not place bootstrap secrets in `infrastructure/.env.example`, Compose runtime `environment`, manifests, logs, or release records.

## Backup and R2 host variables

These are consumed by `scripts/backup-tenants.sh` and the systemd backup service, not by steady-state API requests.

| Name | Service | Required? | Secret? | Classification | Production purpose | Safe example/default |
|---|---|---:|---:|---|---|---|
| `BACKUP_ROOT` | backup host | yes | no | runtime | Local backup filesystem. | `/var/lib/classora/backups` |
| `BACKUP_LOCK_DIR` | backup host | yes | no | runtime | Lock directory preventing overlapping backup/restore. | `/run/lock/classora-backup` |
| `BACKUP_VERIFIED_FILE` | deploy host | yes for deploy | no | deployment | Marker for a recent verified backup. | `/var/lib/classora/backups/verified/latest` |
| `BACKUP_UPLOAD` | backup host | yes | no | runtime policy | `1` enables R2 upload; `0` is local/CI only. | `1` |
| `BACKUP_LOCAL_RUNS` | backup host | no | no | optional | Retained complete local runs; supported values are `2` or `3`. | `3` |
| `R2_ACCOUNT_ID` | backup host | with upload | no | runtime | Cloudflare account identifier. | `<account-id>` |
| `R2_BUCKET` | backup host | with upload | no | runtime | Private R2 bucket. | `classora-production-backups` |
| `R2_PREFIX` | backup host | no | no | optional | Object-key prefix. | `classora-backups` |
| `R2_ACCESS_KEY_ID` | backup host | with upload | yes | runtime secret | Least-privilege R2 access key. | `<set outside Git>` |
| `R2_SECRET_ACCESS_KEY` | backup host | with upload | yes | runtime secret | Least-privilege R2 secret. | `<set outside Git>` |
| `R2_ENDPOINT_URL` | backup host | with upload | no | runtime | R2 S3 endpoint. | `https://<account-id>.r2.cloudflarestorage.com` |
| `AWS_DEFAULT_REGION` | backup host | no | no | optional | R2 region value. | `auto` |

## Release/deployment variables

`scripts/deploy-prod.sh` requires these in the operator shell, not in the API container:

| Name | Required? | Secret? | Classification | Purpose | Safe example/default |
|---|---:|---:|---|---|---|
| `COMPOSE_ENV_FILE` | yes | no | deployment | Root-owned production env file. | `/etc/classora/production.env` |
| `RELEASE_VERSION` | yes | no | deployment | Semantic release tag. | `v1.2.3` |
| `RELEASE_SHA` | yes | no | deployment | Full reviewed commit SHA. | `<40-64 hex characters>` |
| `WEB_IMAGE` | yes | no | deployment | Digest-qualified web image. | `ghcr.io/hoatepdev/classora-web@sha256:<digest>` |
| `API_IMAGE` | yes | no | deployment | Digest-qualified API image. | `ghcr.io/hoatepdev/classora-api@sha256:<digest>` |
| `CURRENT_RELEASE_RECORD` | no | no | deployment | Current release record. | `/var/lib/classora/release/current.env` |
| `RELEASE_RECORD` | no | no | deployment | New release record. | `/var/lib/classora/release/v1.2.3.env` |
| `DEPLOY_LOCK_FILE` | no | no | deployment | Host deployment lock. | `/var/lock/classora-deploy.lock` |
| `MIN_FREE_KB` | no | no | optional | Minimum Docker filesystem free space. | `1048576` |
| `BACKUP_MAX_AGE_HOURS` | no | no | optional | Maximum accepted verified-backup age. | `36` |

`DATABASE_URL` is generated internally for Prisma tenant migration child processes. `TUNNEL_TOKEN` is the container-only alias for `CLOUDFLARE_TUNNEL_TOKEN`. Neither is an operator-facing value and neither may be logged.

## Operator checks

- `NODE_ENV` must be exactly `production`.
- `DEV_TENANT_SLUG` must be absent.
- Production Swagger stays disabled.
- Bootstrap credentials are supplied only to the one-shot bootstrap command and are absent from the steady-state API container.
- `CLOUDFLARE_TUNNEL_TOKEN` is present only in the root-owned production file and is never printed.
- R2 credentials use a private bucket and least privilege; backup status and checksums are recorded without credentials.
