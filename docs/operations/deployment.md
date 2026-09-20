# Production deployment and rollback

Production is operator-triggered. GitHub Actions publishes artifacts but never connects to the VPS or starts services.

## Preflight

Obtain the release manifest from the tag workflow and create a verified backup marker after the backup checksum/verification step. Use a root-owned environment file; never put secrets or the Tunnel token in Git.

Run the deterministic configuration preflight before starting a deployment:

```bash
COMPOSE_ENV_FILE=/etc/classora/production.env \
RELEASE_VERSION=vX.Y.Z \
RELEASE_SHA=<full-commit-sha> \
WEB_IMAGE=ghcr.io/hoatepdev/classora-web@sha256:<64-hex-digest> \
API_IMAGE=ghcr.io/hoatepdev/classora-api@sha256:<64-hex-digest> \
BACKUP_VERIFIED_FILE=/var/lib/classora/backups/verified/latest \
./scripts/preflight-prod.sh --env-only
```

This checks required production configuration, placeholder/Swagger/dev-fallback policy, immutable release inputs, backup/R2 configuration, writable operator directories, and merged Compose resolution without starting services or printing secret values. The full command (without `--env-only`) additionally checks the running gateway headers, readiness, request ID, Swagger-disabled response, and Compose service status after deployment.

```bash
export COMPOSE_ENV_FILE=/etc/classora/production.env
export BACKUP_VERIFIED_FILE=/var/lib/classora/backups/verified/latest
export RELEASE_VERSION=vX.Y.Z
export RELEASE_SHA=<full-commit-sha>
export WEB_IMAGE=ghcr.io/hoatepdev/classora-web@sha256:<64-hex-digest>
export API_IMAGE=ghcr.io/hoatepdev/classora-api@sha256:<64-hex-digest>
export INITIAL_TENANT_SLUG=demo
export CURRENT_RELEASE_RECORD=/var/lib/classora/release/current.env
export RELEASE_RECORD=/var/lib/classora/release/$RELEASE_VERSION.env

./scripts/deploy-prod.sh
```

The script requires both application image references to contain a 64-hex SHA-256 digest, rejects Compose build sections, checks that `api` and `api-migrate` use the same API image, validates a recent successful backup marker that references `COMPLETE` and `manifest.tsv`, checks Docker disk space, and serializes deployment with a host lock. It uses no `--build` operation. A candidate release record is written as `RELEASE_STATUS=DEPLOYING` before image pull/start; it becomes `ACTIVE` only after readiness succeeds.

For an inspection-only configuration check:

```bash
docker compose --project-name classora-production \
  --env-file "$COMPOSE_ENV_FILE" \
  -f infrastructure/docker-compose.yml \
  -f infrastructure/docker-compose.production.yml config
```

The production overlay leaves PostgreSQL and Cloudflared pinned to their repository-controlled versions. API and PostgreSQL have no public port; only the loopback-bound web gateway is reachable by the Tunnel.

## Migration boundary

The deployment order is:

1. acquire the host deployment lock;
2. validate the environment, backup marker, release record, disk, and merged config;
3. pull exact digest-qualified web/API images;
4. run `api-migrate` once with `docker compose run --rm --no-build`;
5. if migration fails, exit without starting the new API/web release;
6. start/update API and web, then Cloudflared;
7. verify readiness through Nginx with the original tenant Host;
8. run authenticated smoke verification and record evidence.

The migration process holds a PostgreSQL advisory lock across control and sequential tenant migrations. It stops at the first failed tenant. Earlier databases remain migrated; later databases are not attempted. Fix the failed state and rerun the migration; there is no automatic migration rollback. If post-start readiness fails, leave the `DEPLOYING` release record in place, inspect logs and container health, and either recover with the previous compatible application images or complete the candidate release; do not treat the failed attempt as active.

## Application rollback

Use the previous `WEB_IMAGE` and `API_IMAGE` values from the current release record only after confirming schema compatibility. Pull and recreate only `api` and `web`; do not run `api-migrate`, do not run bootstrap owner creation, and do not change database state.

```bash
SMOKE_WEB_IMAGE=<current-digest-web> \
SMOKE_API_IMAGE=<current-digest-api> \
SMOKE_ROLLBACK_WEB_IMAGE=<previous-digest-web> \
SMOKE_ROLLBACK_API_IMAGE=<previous-digest-api> \
SMOKE_ENV_FILE="$COMPOSE_ENV_FILE" \
SMOKE_PROJECT_NAME=classora-smoke-rollback \
./scripts/smoke-prod.sh
```

A rollback is application-only. Prisma migrations are forward-only. If the previous image is not compatible with the current schema, roll forward with a compatible image. If data must be restored, stop application writes and follow the B6 restore runbook; never attempt to reverse schema history by editing production databases.

## Post-deployment checks

```bash
docker compose --project-name classora-production --env-file "$COMPOSE_ENV_FILE" \
  -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.production.yml ps
curl -fsS -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" \
  "http://127.0.0.1:${WEB_PORT:-4100}/api/health/ready"
```

Verify `*.classora.io.vn -> Cloudflare Tunnel -> http://web:80`, that the original Host reaches Nginx and NestJS, and that API `4101` and PostgreSQL `5432` remain internal. The live Cloudflare dashboard, DNS, firewall, TLS, secret distribution, and off-host backup checks are operator evidence, not claims made by repository tests.
