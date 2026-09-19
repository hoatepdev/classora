#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
ENV_FILE=${SMOKE_ENV_FILE:-$ROOT/infrastructure/.env}
SMOKE_PROJECT_NAME=${SMOKE_PROJECT_NAME:-classora-smoke-$$}
cd "$ROOT"
[ -r "$ENV_FILE" ] || { echo "SMOKE_ENV_FILE is not readable: $ENV_FILE" >&2; exit 1; }
set -a
. "$ENV_FILE"
set +a
# Compose interpolates profiled services before filtering them; keep the disabled
# tunnel service from requiring a real production token during this smoke.
export CLOUDFLARE_TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN:-smoke-disabled}
compose() {
  docker compose --project-name "$SMOKE_PROJECT_NAME" --env-file "$ENV_FILE" -f infrastructure/docker-compose.yml "$@"
}
export COMPOSE_ENV_FILE="$ENV_FILE"
export WEB_PORT=4100
export COMPOSE_PROJECT_NAME="$SMOKE_PROJECT_NAME"

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

compose up -d --build postgres
compose run --rm --build api-migrate
compose run --rm --build --no-deps api npm run auth:create-owner
compose up -d --build api web

for attempt in $(seq 1 60); do
  if curl -fsS -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" http://127.0.0.1:${WEB_PORT}/api/health/ready >/dev/null; then
    break
  fi
  [ "$attempt" -eq 60 ] && { compose logs; exit 1; }
  sleep 2
done

curl -fsS -H "Host: ${INITIAL_TENANT_SLUG}.classora.io.vn" http://127.0.0.1:${WEB_PORT}/api/health >/dev/null

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
printf '%s\n' 'Compose production smoke passed: gateway, readiness, login, tenant write/read, and restart persistence are healthy.'
