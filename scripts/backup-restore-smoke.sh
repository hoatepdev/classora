#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
ENV_FILE=${SMOKE_ENV_FILE:?SMOKE_ENV_FILE is required}
PROJECT_NAME=${SMOKE_PROJECT_NAME:?SMOKE_PROJECT_NAME is required}
WEB_PORT=${WEB_PORT:-4100}
: "${INITIAL_TENANT_SLUG:?INITIAL_TENANT_SLUG is required}"
: "${INITIAL_USER_EMAIL:?INITIAL_USER_EMAIL is required}"
: "${SMOKE_ACCESS_TOKEN:?SMOKE_ACCESS_TOKEN is required}"

compose() {
  docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" --project-directory "$ROOT/infrastructure" -f "$ROOT/infrastructure/docker-compose.yml" "$@"
}

backup_root=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/classora-backup.XXXXXX")
cleanup() { rm -rf "$backup_root"; }
trap cleanup EXIT HUP INT TERM

compose run --rm --build --no-deps \
  -e TENANT_OWNER_PASSWORD="${TENANT_OWNER_PASSWORD:-}" \
  api npm run tenant:create -- --code=backup-beta --name='Backup Beta' --owner="$INITIAL_USER_EMAIL"

for slug in "$INITIAL_TENANT_SLUG" backup-beta; do
  code="BACKUP-${slug}-$(date +%s)"
  payload=$(SMOKE_STUDENT_CODE="$code" node -e 'process.stdout.write(JSON.stringify({ code: process.env.SMOKE_STUDENT_CODE, fullName: "Backup Restore Student" }))')
  curl -fsS -H "Host: ${slug}.classora.io.vn" -H "Authorization: Bearer $SMOKE_ACCESS_TOKEN" \
    -H 'Content-Type: application/json' -d "$payload" \
    "http://127.0.0.1:${WEB_PORT}/api/students" >/dev/null
done

BACKUP_ROOT="$backup_root" BACKUP_LOCK_DIR="$backup_root/lock" BACKUP_UPLOAD=0 COMPOSE_PROJECT_NAME="$PROJECT_NAME" COMPOSE_ENV_FILE="$ENV_FILE" \
  "$ROOT/scripts/backup-tenants.sh"
run_dir=$(cat "$backup_root/last-success")
[ -f "$run_dir/COMPLETE" ]
[ -f "$run_dir/manifest.tsv" ]
[ "$(find "$run_dir" -maxdepth 1 -name 'tenant-*.dump' | wc -l | tr -d '[:space:]')" -ge 2 ]

BACKUP_ROOT="$backup_root" BACKUP_LOCK_DIR="$backup_root/lock" COMPOSE_PROJECT_NAME="$PROJECT_NAME" COMPOSE_ENV_FILE="$ENV_FILE" \
  "$ROOT/scripts/restore-tenants.sh" --source "$run_dir" --require-data --cleanup

printf '%s\n' 'Backup/restore smoke passed: control registry, all tenants, checksums, restore data, and isolation.'
