#!/bin/sh
set -u

umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(dirname "$SCRIPT_DIR")
INFRA_DIR="$REPO_DIR/infrastructure"
COMPOSE_FILE="$INFRA_DIR/docker-compose.yml"
BACKUP_ROOT="$INFRA_DIR/backup"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
RUN_DIR="$BACKUP_ROOT/$TIMESTAMP"
REGISTRY_FILE="$RUN_DIR/.tenants"
failures=0
tenant_count=0
tenant_successes=0
control_status=failed

compose() {
  docker compose --project-directory "$INFRA_DIR" -f "$COMPOSE_FILE" "$@"
}

cleanup() {
  rm -f "$REGISTRY_FILE" "$RUN_DIR"/*.partial
}

trap cleanup EXIT
trap 'exit 130' HUP INT TERM

mkdir -p "$BACKUP_ROOT"
if ! mkdir "$RUN_DIR"; then
  echo "Backup directory already exists: $RUN_DIR" >&2
  exit 1
fi

if ! compose exec -T postgres sh -c \
  'psql -X --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$CONTROL_DB_NAME" --no-align --tuples-only --field-separator="|" --command="SELECT slug, db_name, db_name = current_database() FROM tenants ORDER BY created_at, id"' \
  >"$REGISTRY_FILE"; then
  echo "Could not read the tenant registry from the control database" >&2
  exit 1
fi

control_output="$RUN_DIR/control-$TIMESTAMP.dump"
echo "[control] backing up control database"
if compose exec -T postgres sh -c \
  'pg_dump --format=custom --no-owner --no-privileges --username "$POSTGRES_USER" --dbname "$CONTROL_DB_NAME"' \
  </dev/null >"$control_output.partial" &&
  mv "$control_output.partial" "$control_output"; then
  control_status=ok
  echo "[control] wrote $control_output"
else
  rm -f "$control_output.partial"
  failures=$((failures + 1))
  echo "[control] backup failed" >&2
fi

while IFS='|' read -r slug db_name is_control; do
  tenant_count=$((tenant_count + 1))

  case "$slug" in
    ''|*[!a-z0-9-]*|-*|*-)
      echo "[tenant row $tenant_count] invalid registry slug; backup failed" >&2
      failures=$((failures + 1))
      continue
      ;;
  esac
  if [ "${#slug}" -gt 47 ]; then
    echo "[tenant row $tenant_count] invalid registry slug; backup failed" >&2
    failures=$((failures + 1))
    continue
  fi
  case "$db_name" in
    ''|*[!A-Za-z0-9_-]*)
      echo "[tenant $slug] invalid registry database name; backup failed" >&2
      failures=$((failures + 1))
      continue
      ;;
  esac
  if [ "$is_control" != f ]; then
    echo "[tenant $slug] registry database is invalid or matches the control database; backup failed" >&2
    failures=$((failures + 1))
    continue
  fi

  output="$RUN_DIR/tenant-$slug-$TIMESTAMP.dump"
  echo "[tenant $slug] backing up database \"$db_name\""
  if compose exec -T postgres sh -c \
    'pg_dump --format=custom --no-owner --no-privileges --username "$POSTGRES_USER" --dbname "$1"' sh "$db_name" \
    </dev/null >"$output.partial" &&
    mv "$output.partial" "$output"; then
    tenant_successes=$((tenant_successes + 1))
    echo "[tenant $slug] wrote $output"
  else
    rm -f "$output.partial"
    failures=$((failures + 1))
    echo "[tenant $slug] backup failed for database \"$db_name\"" >&2
  fi
done <"$REGISTRY_FILE"

if [ "$tenant_count" -eq 0 ]; then
  echo "No registered tenant databases found"
fi

echo "Backup summary: control=$control_status, tenants=$tenant_successes/$tenant_count, failures=$failures"
if [ "$failures" -ne 0 ]; then
  exit 1
fi

echo "Backup completed: $RUN_DIR"
