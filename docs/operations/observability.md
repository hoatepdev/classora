# Production observability and diagnostics

Classora currently uses Docker stdout logs, bounded Docker JSON-file rotation, health endpoints, migration output, backup status files, and release records. It does not include a metrics, tracing, centralized logging, or uptime-monitoring service. Configure those only when the operator has a concrete monitoring requirement.

## First five minutes

```bash
export COMPOSE_ENV_FILE=/etc/classora/production.env
export COMPOSE_PROJECT_NAME=classora-production

docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file "$COMPOSE_ENV_FILE" \
  -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.production.yml ps

docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file "$COMPOSE_ENV_FILE" \
  -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.production.yml logs --tail=200 api web
curl -fsS -H 'Host: demo.classora.io.vn' \
  "http://127.0.0.1:${WEB_PORT:-4100}/api/health/live"
curl -fsS -H 'Host: demo.classora.io.vn' \
  "http://127.0.0.1:${WEB_PORT:-4100}/api/health/ready"
./scripts/preflight-prod.sh --env-only
```

A response header `X-Request-Id` is returned for every request. Give that value to the operator when reporting a failure. API access records include timestamp, level, request ID, method, route, status, duration, and resolved tenant/user context when available. Request bodies, query strings, authorization headers, JWTs, passwords, database URLs, R2 keys, Tunnel tokens, and full environment values are not logged.

## Exact diagnostics

| Need | Command |
|---|---|
| Container state/restarts | `docker compose ... ps` and `docker inspect --format '{{.Name}} restart={{.RestartCount}} status={{.State.Status}}' $(docker compose ... ps -q)` |
| API logs | `docker compose ... logs --tail=200 api` |
| Web/Nginx logs | `docker compose ... logs --tail=200 web` |
| Migration logs | `docker compose ... logs --tail=300 api-migrate` or `docker compose ... run --rm api-migrate` for an explicit retry after diagnosis |
| Tunnel logs | `docker compose --profile production ... logs --tail=200 cloudflared` |
| PostgreSQL logs | `docker compose ... logs --tail=200 postgres` |
| Liveness | `curl -i -H 'Host: demo.classora.io.vn' http://127.0.0.1:${WEB_PORT:-4100}/api/health/live` |
| Readiness | `curl -i -H 'Host: demo.classora.io.vn' http://127.0.0.1:${WEB_PORT:-4100}/api/health/ready` |
| Tenant DB check | Authenticate, then call `/api/health/tenant/query` with the tenant Host; this is not a readiness check. |
| Host disk | `df -h` and `df -ih` |
| PostgreSQL volume | `docker system df -v` and `docker volume inspect classora_postgres_data` |
| Docker usage | `docker system df -v` |
| Backup status | `./scripts/backup-tenants.sh status` and `./scripts/backup-tenants.sh last-success` |
| Backup service | `systemctl status classora-backup.service classora-backup.timer` and `journalctl -u classora-backup.service --since today` |
| Release version | `cat /var/lib/classora/release/current.env` |
| Compose config | `docker compose --env-file "$COMPOSE_ENV_FILE" -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.production.yml config --quiet` |

The exact Compose prefix is abbreviated above as `...`; use the full project/env/file arguments from [deployment.md](deployment.md).

## Immediate operator attention

Stop and investigate rather than repeatedly restarting when any of these occur:

- the PostgreSQL volume or host filesystem is nearly full;
- a container is continuously restarting;
- readiness returns 503;
- `api-migrate` exits nonzero;
- the last successful backup is stale or missing;
- R2 upload or remote checksum verification fails;
- cloudflared is unhealthy or the Tunnel dashboard reports disconnected;
- a release record is `DEPLOYING` after the deployment process exited.

No threshold in this document substitutes for measuring the VPS capacity. Set alerts against the actual disk, memory, retention, and traffic envelope of the host.

## Troubleshooting

### API will not start

Check `docker compose ... logs api-migrate api`, then run the environment-only preflight. Missing/invalid runtime values must be corrected in the root-owned env file. Do not add bootstrap values to the steady-state API environment. If migration failed, follow the migration recovery procedure in [deployment.md](deployment.md); do not manually edit Prisma ledgers.

### Readiness is 503

`/health/live` distinguishes a live process from a ready application. A 503 means the control database `SELECT 1` failed. Check PostgreSQL health/logs, `CONTROL_DB_NAME`, credentials, volume capacity, and the API-to-PostgreSQL network. Readiness intentionally does not query every tenant database.

### Tenant hostname does not resolve

Confirm Cloudflare DNS/Tunnel ingress preserves the original `Host`, the Nginx gateway receives `<slug>.classora.io.vn`, and the slug exists in the trusted control registry. Do not add `X-Tenant-ID` or a database selector; tenant resolution is hostname-based.

### Tenant membership returns 403

The JWT identifies the user, but membership is checked separately against the resolved tenant. Confirm the user is active and the control database contains the expected membership. A 403 is not fixed by changing the client tenant ID.

### Tenant database is unavailable

Use the authenticated tenant health query and API logs with its request ID. Check the registry database name, PostgreSQL logs, pool capacity, and the tenant database itself. Never silently point a tenant at another database.

### Migration failed

Keep the release stopped. Record the failing tenant and migration output. Earlier databases may already be migrated; Prisma migrations are forward-only. Correct the database/release condition and rerun the serialized migration, or use the documented restore procedure when data recovery is required.

### Backup failed

Inspect `backup-tenants.sh status`, `last-success`, and the systemd journal. Check PostgreSQL access, local backup disk, lock state, dump permissions, registry stability, and R2 credentials/permissions. A failed dump or checksum must never be marked complete.

### R2 upload failed

Do not delete the local complete run. Verify private bucket access, endpoint, prefix permissions, time, and the least-privilege token. Rerun after diagnosis and require remote `head-object` size/checksum verification.

### Cloudflare Tunnel unavailable

Check cloudflared container status/logs, the Tunnel token source, connector health in Cloudflare, DNS/ingress mapping, and VPS outbound connectivity. Confirm the origin is not directly exposed and that the Tunnel does not rewrite the tenant Host.

## Retention and accepted scope

Docker log rotation limits local growth but is not off-host retention. Backup retention and R2 verification are documented in [backup-restore.md](backup-restore.md). Cloudflare dashboard alerts, host monitoring, log shipping, and on-call notification are operator responsibilities until a concrete service is selected.
