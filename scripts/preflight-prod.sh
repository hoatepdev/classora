#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
INFRA_DIR="$ROOT/infrastructure"
COMPOSE_FILE="$INFRA_DIR/docker-compose.yml"
PRODUCTION_FILE="$INFRA_DIR/docker-compose.production.yml"
ENV_FILE=${COMPOSE_ENV_FILE:-$INFRA_DIR/.env}
MODE=${1:-}

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

[ "$MODE" = "" ] || [ "$MODE" = "--env-only" ] || fail 'Usage: COMPOSE_ENV_FILE=/path/production.env ./scripts/preflight-prod.sh [--env-only]'
[ -r "$ENV_FILE" ] || fail "COMPOSE_ENV_FILE is not readable: $ENV_FILE"

set -a
. "$ENV_FILE"
set +a

require() {
  name=$1
  value=$(printenv "$name" 2>/dev/null || true)
  [ -n "$value" ] || fail "$name is required"
}

require NODE_ENV
[ "$NODE_ENV" = production ] || fail 'NODE_ENV must be production'
require PORT
require WEB_PORT
require POSTGRES_HOST
require POSTGRES_PORT
require POSTGRES_USER
require POSTGRES_PASSWORD
require POSTGRES_DB
require CONTROL_DB_NAME
require JWT_SECRET
require JWT_ACCESS_TTL
require ENABLE_SWAGGER
require CLOUDFLARE_TUNNEL_TOKEN
if [ "$MODE" != --env-only ]; then
  require RELEASE_VERSION
  require RELEASE_SHA
  require WEB_IMAGE
  require API_IMAGE
  require BACKUP_VERIFIED_FILE
fi

[ "$POSTGRES_PASSWORD" != change-me ] || fail 'POSTGRES_PASSWORD must not use the placeholder value'
[ "${#JWT_SECRET}" -ge 32 ] || fail 'JWT_SECRET must be at least 32 bytes'
printf '%s\n' "$JWT_ACCESS_TTL" | grep -Eq '^\d+(ms|s|m|h|d|w|y)$' || fail 'JWT_ACCESS_TTL must be a duration such as 1h or 30m'
[ "$ENABLE_SWAGGER" = false ] || fail 'ENABLE_SWAGGER must be false in production'
[ -z "${DEV_TENANT_SLUG:-}" ] || fail 'DEV_TENANT_SLUG must not be set in production'
if [ "$MODE" != --env-only ]; then
  printf '%s\n' "$RELEASE_VERSION" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$' || fail 'RELEASE_VERSION must be a semantic version tag'
  printf '%s\n' "$RELEASE_SHA" | grep -Eq '^[0-9a-fA-F]{40,64}$' || fail 'RELEASE_SHA must be a full Git commit SHA'
  printf '%s\n' "$WEB_IMAGE" | grep -Eq '^[^[:space:]@]+@sha256:[0-9a-fA-F]{64}$' || fail 'WEB_IMAGE must be digest-qualified'
  printf '%s\n' "$API_IMAGE" | grep -Eq '^[^[:space:]@]+@sha256:[0-9a-fA-F]{64}$' || fail 'API_IMAGE must be digest-qualified'
  [ -s "$BACKUP_VERIFIED_FILE" ] || fail 'BACKUP_VERIFIED_FILE must reference a non-empty verified backup marker'
fi

BACKUP_ROOT=${BACKUP_ROOT:-/var/lib/classora/backups}
BACKUP_LOCK_DIR=${BACKUP_LOCK_DIR:-/run/lock/classora-backup}
RELEASE_DIR=${RELEASE_DIR:-$(dirname "${RELEASE_RECORD:-/var/lib/classora/release/current.env}")}
if [ "$MODE" = --env-only ]; then
  RELEASE_DIR=${RELEASE_DIR:-/tmp/classora-release}
fi
for directory in "$BACKUP_ROOT" "$BACKUP_LOCK_DIR" "$RELEASE_DIR"; do
  mkdir -p "$directory" 2>/dev/null || fail "required directory is not usable: $directory"
  [ -w "$directory" ] || fail "required directory is not writable: $directory"
done

if [ "${BACKUP_UPLOAD:-0}" = 1 ]; then
  for name in R2_ACCOUNT_ID R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_ENDPOINT_URL; do
    require "$name"
  done
fi

export COMPOSE_ENV_FILE="$ENV_FILE"
export COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-classora-production}
export COMPOSE_PROFILES=${COMPOSE_PROFILES:-production}
if [ "$MODE" = --env-only ]; then
  export WEB_IMAGE=${WEB_IMAGE:-preflight/web:configuration-only}
  export API_IMAGE=${API_IMAGE:-preflight/api:configuration-only}
else
  export WEB_IMAGE API_IMAGE
fi

docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" -f "$PRODUCTION_FILE" config --quiet || fail 'production Compose configuration is invalid'

printf '%s\n' 'Production environment preflight passed without printing secret values.'
[ "$MODE" = --env-only ] && exit 0

command -v docker >/dev/null 2>&1 || fail 'docker is required for live preflight'
command -v curl >/dev/null 2>&1 || fail 'curl is required for live preflight'
WEB_PORT=${WEB_PORT:-4100}
TENANT=${PREFLIGHT_TENANT_SLUG:-${INITIAL_TENANT_SLUG:-demo}}
BASE="http://127.0.0.1:$WEB_PORT"

curl -fsS -H "Host: $TENANT.classora.io.vn" "$BASE/api/health/ready" >/dev/null || fail 'gateway readiness check failed'
headers=$(curl -fsSI -H "Host: $TENANT.classora.io.vn" "$BASE/") || fail 'gateway header check failed'
for header in Strict-Transport-Security Content-Security-Policy Permissions-Policy X-Content-Type-Options X-Frame-Options Referrer-Policy; do
  printf '%s\n' "$headers" | grep -i "^$header:" >/dev/null || fail "missing gateway header: $header"
done
request_headers=$(curl -sS -D - -o /dev/null -H "Host: $TENANT.classora.io.vn" "$BASE/api/health") || fail 'health request failed'
printf '%s\n' "$request_headers" | grep -i '^X-Request-Id:' >/dev/null || fail 'health response did not include X-Request-Id'
curl -sS -o /dev/null -w '%{http_code}' -H "Host: $TENANT.classora.io.vn" "$BASE/api/docs/" | grep -qx 404 || fail 'Swagger is publicly enabled'

docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" -f "$PRODUCTION_FILE" ps >/dev/null || fail 'Compose service status check failed'
printf '%s\n' 'Production live preflight passed.'
