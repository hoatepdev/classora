#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
ENV_FILE=${SMOKE_ENV_FILE:-$ROOT/infrastructure/.env}
SMOKE_PROJECT_NAME=${SMOKE_PROJECT_NAME:-classora-smoke-$$}
SMOKE_WEB_IMAGE=${SMOKE_WEB_IMAGE:-}
SMOKE_API_IMAGE=${SMOKE_API_IMAGE:-}
SMOKE_ROLLBACK_WEB_IMAGE=${SMOKE_ROLLBACK_WEB_IMAGE:-}
SMOKE_ROLLBACK_API_IMAGE=${SMOKE_ROLLBACK_API_IMAGE:-}
cd "$ROOT"
[ -r "$ENV_FILE" ] || { echo "SMOKE_ENV_FILE is not readable: $ENV_FILE" >&2; exit 1; }
for ref in "$SMOKE_WEB_IMAGE" "$SMOKE_API_IMAGE" "$SMOKE_ROLLBACK_WEB_IMAGE" "$SMOKE_ROLLBACK_API_IMAGE"; do
  [ -z "$ref" ] || printf '%s\n' "$ref" | grep -Eq '^[^[:space:]@]+@sha256:[0-9a-fA-F]{64}$' || {
    echo "smoke image must be a digest-qualified reference: $ref" >&2
    exit 1
  }
done
IMAGE_MODE=0
[ -n "$SMOKE_WEB_IMAGE" ] && [ -n "$SMOKE_API_IMAGE" ] && IMAGE_MODE=1
[ "$IMAGE_MODE" -eq 1 ] || { [ -z "$SMOKE_WEB_IMAGE" ] && [ -z "$SMOKE_API_IMAGE" ] || { echo 'SMOKE_WEB_IMAGE and SMOKE_API_IMAGE must be provided together' >&2; exit 1; }; }
set -a
. "$ENV_FILE"
set +a
# Compose interpolates profiled services before filtering them; keep the disabled
# tunnel service from requiring a real production token during this smoke.
export CLOUDFLARE_TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN:-smoke-disabled}
compose() {
  if [ "$IMAGE_MODE" -eq 1 ]; then
    docker compose --project-name "$SMOKE_PROJECT_NAME" --env-file "$ENV_FILE" \
      -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.production.yml "$@"
  else
    docker compose --project-name "$SMOKE_PROJECT_NAME" --env-file "$ENV_FILE" -f infrastructure/docker-compose.yml "$@"
  fi
}
export COMPOSE_ENV_FILE="$ENV_FILE"
export WEB_PORT=4100
export COMPOSE_PROJECT_NAME="$SMOKE_PROJECT_NAME"
export WEB_IMAGE="$SMOKE_WEB_IMAGE"
export API_IMAGE="$SMOKE_API_IMAGE"

case "$SMOKE_PROJECT_NAME" in
  classora-smoke-*) ;;
  *) echo 'SMOKE_PROJECT_NAME must start with classora-smoke-' >&2; exit 1 ;;
esac
[ "${POSTGRES_HOST:-}" = postgres ] || { echo 'SMOKE_ENV_FILE must target the disposable Compose postgres service' >&2; exit 1; }

: "${INITIAL_USER_EMAIL:?INITIAL_USER_EMAIL is required}"
: "${INITIAL_USER_PASSWORD:?INITIAL_USER_PASSWORD is required}"
: "${INITIAL_USER_NAME:?INITIAL_USER_NAME is required}"
: "${INITIAL_TENANT_SLUG:?INITIAL_TENANT_SLUG is required}"

cleanup() {
  rc=$?
  if [ "$rc" -ne 0 ]; then
    compose logs --no-color || true
  fi
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  exit "$rc"
}
trap cleanup EXIT

compose up -d postgres
if [ "$IMAGE_MODE" -eq 1 ]; then
  compose pull web api api-migrate
  compose run --rm --no-build --no-deps -e B5_TEST_DATABASE=1 api-migrate npm run test:tenant-schema
  compose run --rm --no-build api-migrate
  compose run --rm --no-build --no-deps api npm run auth:create-owner
  compose up -d --no-build api web
else
  compose run --rm --build --no-deps -e B5_TEST_DATABASE=1 api-migrate npm run test:tenant-schema
  compose run --rm --build api-migrate
  compose run --rm --build --no-deps \
    -e INITIAL_USER_EMAIL="$INITIAL_USER_EMAIL" -e INITIAL_USER_PASSWORD="$INITIAL_USER_PASSWORD" \
    -e INITIAL_USER_NAME="$INITIAL_USER_NAME" -e INITIAL_TENANT_SLUG="$INITIAL_TENANT_SLUG" \
    api npm run auth:create-owner
  compose up -d --build api web
fi

for attempt in $(seq 1 60); do
  if curl -fsS -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" http://127.0.0.1:${WEB_PORT}/api/health/ready >/dev/null; then
    break
  fi
  [ "$attempt" -eq 60 ] && { compose logs; exit 1; }
  sleep 2
done

curl -fsS -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" http://127.0.0.1:${WEB_PORT}/api/health >/dev/null
curl -fsSI -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" http://127.0.0.1:${WEB_PORT}/ | grep -i '^Content-Security-Policy:' >/dev/null
curl -fsS -D /tmp/classora-health-headers -o /dev/null -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" http://127.0.0.1:${WEB_PORT}/api/health
grep -i '^X-Request-Id:' /tmp/classora-health-headers >/dev/null
[ "$(curl -sS -o /dev/null -w '%{http_code}' -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" http://127.0.0.1:${WEB_PORT}/api/docs/)" = 404 ]

login_payload=$(node -e 'process.stdout.write(JSON.stringify({ email: process.env.INITIAL_USER_EMAIL, password: process.env.INITIAL_USER_PASSWORD }))')
login_response=$(
  curl -fsS -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" -H 'Content-Type: application/json' \
    -d "$login_payload" \
    http://127.0.0.1:${WEB_PORT}/api/auth/login
)
access_token=$(printf '%s' "$login_response" | node -e "let input=''; process.stdin.on('data', chunk => input += chunk); process.stdin.on('end', () => { const token = JSON.parse(input).accessToken; if (!token) process.exit(1); process.stdout.write(token); });")

curl -fsS -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" -H "Authorization: Bearer $access_token" \
  http://127.0.0.1:${WEB_PORT}/api/health/tenant/query >/dev/null

student_code="SMOKE-$(date +%s)"
student_payload=$(SMOKE_STUDENT_CODE="$student_code" node -e 'process.stdout.write(JSON.stringify({ code: process.env.SMOKE_STUDENT_CODE, fullName: "Production Smoke Student" }))')
student_response=$(
  curl -fsS -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" \
    -H "Authorization: Bearer $access_token" -H 'Content-Type: application/json' \
    -d "$student_payload" \
    http://127.0.0.1:${WEB_PORT}/api/students
)
student_id=$(printf '%s' "$student_response" | node -e "let input=''; process.stdin.on('data', chunk => input += chunk); process.stdin.on('end', () => { const id = JSON.parse(input).id; if (!id) process.exit(1); process.stdout.write(id); });")

student_read=$(curl -fsS -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" \
  -H "Authorization: Bearer $access_token" \
  "http://127.0.0.1:${WEB_PORT}/api/students/$student_id")
printf '%s' "$student_read" | grep -F 'Production Smoke Student' >/dev/null

compose restart api
for attempt in $(seq 1 60); do
  if curl -fsS -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" http://127.0.0.1:${WEB_PORT}/api/health/ready >/dev/null; then
    break
  fi
  [ "$attempt" -eq 60 ] && exit 1
  sleep 2
done

student_read_after_restart=$(curl -fsS -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" \
  -H "Authorization: Bearer $access_token" \
  "http://127.0.0.1:${WEB_PORT}/api/students/$student_id")
printf '%s' "$student_read_after_restart" | grep -F 'Production Smoke Student' >/dev/null

if [ "${SMOKE_BACKUP_RESTORE:-0}" = 1 ]; then
  [ "$IMAGE_MODE" -eq 0 ] || { echo 'SMOKE_BACKUP_RESTORE requires source-build mode' >&2; exit 1; }
  SMOKE_ENV_FILE="$ENV_FILE" SMOKE_PROJECT_NAME="$SMOKE_PROJECT_NAME" WEB_PORT="$WEB_PORT" \
    INITIAL_TENANT_SLUG="$INITIAL_TENANT_SLUG" INITIAL_USER_EMAIL="$INITIAL_USER_EMAIL" \
    SMOKE_ACCESS_TOKEN="$access_token" "$ROOT/scripts/backup-restore-smoke.sh"
fi

if [ -n "$SMOKE_ROLLBACK_WEB_IMAGE" ] || [ -n "$SMOKE_ROLLBACK_API_IMAGE" ]; then
  [ "$IMAGE_MODE" -eq 1 ] || { echo 'rollback smoke requires the immutable image mode' >&2; exit 1; }
  [ -n "$SMOKE_ROLLBACK_WEB_IMAGE" ] && [ -n "$SMOKE_ROLLBACK_API_IMAGE" ] || { echo 'rollback images must be provided together' >&2; exit 1; }
  rollback_sentinel=$(curl -fsS -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" -H "Authorization: Bearer $access_token" \
    "http://127.0.0.1:${WEB_PORT}/api/students/$student_id")
  export WEB_IMAGE="$SMOKE_ROLLBACK_WEB_IMAGE" API_IMAGE="$SMOKE_ROLLBACK_API_IMAGE"
  compose pull web api
  compose up -d --no-build --no-deps api web
  for attempt in $(seq 1 60); do
    if curl -fsS -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" \
      "http://127.0.0.1:${WEB_PORT}/api/health/ready" >/dev/null; then
      break
    fi
    [ "$attempt" -eq 60 ] && { echo 'rollback readiness failed' >&2; exit 1; }
    sleep 2
  done
  rollback_read=$(curl -fsS -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" -H "Authorization: Bearer $access_token" \
    "http://127.0.0.1:${WEB_PORT}/api/students/$student_id")
  [ "$rollback_sentinel" = "$rollback_read" ] || { echo 'rollback changed the database sentinel' >&2; exit 1; }
fi

printf '%s\n' 'Compose production smoke passed: gateway, readiness, login, tenant write/read, and restart persistence are healthy.'
