#!/bin/sh
set -eu

umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(dirname "$SCRIPT_DIR")
INFRA_DIR="$REPO_DIR/infrastructure"
COMPOSE_FILE="$INFRA_DIR/docker-compose.yml"
BACKUP_ROOT=${BACKUP_ROOT:-$INFRA_DIR/backup}
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-}
BACKUP_UPLOAD=${BACKUP_UPLOAD:-0}
BACKUP_LOCAL_RUNS=${BACKUP_LOCAL_RUNS:-3}
R2_PREFIX=${R2_PREFIX:-classora-backups}
TAB=$(printf '\t')

compose() {
  if [ -n "${COMPOSE_PROJECT_NAME:-}" ] && [ -n "$COMPOSE_ENV_FILE" ]; then
    docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file "$COMPOSE_ENV_FILE" --project-directory "$INFRA_DIR" -f "$COMPOSE_FILE" "$@"
  elif [ -n "${COMPOSE_PROJECT_NAME:-}" ]; then
    docker compose --project-name "$COMPOSE_PROJECT_NAME" --project-directory "$INFRA_DIR" -f "$COMPOSE_FILE" "$@"
  elif [ -n "$COMPOSE_ENV_FILE" ]; then
    docker compose --env-file "$COMPOSE_ENV_FILE" --project-directory "$INFRA_DIR" -f "$COMPOSE_FILE" "$@"
  else
    docker compose --project-directory "$INFRA_DIR" -f "$COMPOSE_FILE" "$@"
  fi
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    echo "Neither sha256sum nor shasum is available" >&2
    return 1
  fi
}

file_size() {
  wc -c <"$1" | tr -d '[:space:]'
}

status_file="$BACKUP_ROOT/latest-status"
verified_file=${BACKUP_VERIFIED_FILE:-$BACKUP_ROOT/verified/latest}
lock_dir=${BACKUP_LOCK_DIR:-$BACKUP_ROOT/.lock}
run_dir=
run_id=
run_status=FAILED
failure_reason=
lock_held=0

write_status() {
  status=$1
  reason=${2:-}
  mkdir -p "$BACKUP_ROOT"
  tmp="$BACKUP_ROOT/.status.$$"
  {
    printf 'status=%s\n' "$status"
    printf 'run_id=%s\n' "${run_id:-none}"
    printf 'run_dir=%s\n' "${run_dir:-none}"
    printf 'updated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    [ "$status" = SUCCESS ] && printf 'completed_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    [ -n "$reason" ] && printf 'reason=%s\n' "$reason"
  } >"$tmp"
  mv "$tmp" "$status_file"
  if [ "$status" = SUCCESS ]; then
    printf '%s\n' "$run_dir" >"$BACKUP_ROOT/last-success"
    mkdir -p "$(dirname "$verified_file")"
    cp "$status_file" "$verified_file"
    chmod 600 "$verified_file"
  else
    printf '%s\n' "$run_dir" >"$BACKUP_ROOT/last-failure"
  fi
}

release_lock() {
  if [ "$lock_held" -eq 1 ]; then
    rm -rf "$lock_dir"
    lock_held=0
  fi
}

on_exit() {
  rc=$?
  if [ -n "$run_dir" ]; then
    rm -f "$run_dir"/*.partial "$run_dir"/manifest.tsv.partial
    if [ "$rc" -eq 0 ] && [ "$run_status" = SUCCESS ]; then
      write_status SUCCESS "backup and required verification completed"
    else
      write_status FAILED "${failure_reason:-backup command failed (exit $rc)}"
    fi
  fi
  release_lock
  exit "$rc"
}

fail() {
  failure_reason=$1
  echo "$failure_reason" >&2
  exit 1
}

status_command() {
  if [ -r "$status_file" ]; then
    cat "$status_file"
  else
    echo "status=UNKNOWN"
    echo "No backup status has been recorded."
    return 1
  fi
}

last_success_command() {
  if [ -r "$BACKUP_ROOT/last-success" ]; then
    printf 'Last successful production backup: '
    cat "$BACKUP_ROOT/last-success"
  else
    echo 'No successful production backup has been recorded.'
    return 1
  fi
}

remote_configured() {
  [ "$BACKUP_UPLOAD" = 1 ]
}

require_r2_config() {
  command -v aws >/dev/null 2>&1 || fail 'BACKUP_UPLOAD=1 requires the AWS CLI'
  : "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID is required when BACKUP_UPLOAD=1}"
  : "${R2_BUCKET:?R2_BUCKET is required when BACKUP_UPLOAD=1}"
  : "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required when BACKUP_UPLOAD=1}"
  : "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required when BACKUP_UPLOAD=1}"
  : "${R2_ENDPOINT_URL:?R2_ENDPOINT_URL is required when BACKUP_UPLOAD=1}"
  export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-auto}
  export AWS_EC2_METADATA_DISABLED=true
}

remote_base() {
  prefix=${R2_PREFIX#/}
  prefix=${prefix%/}
  printf '%s/%s/%s/%s/%s' "$prefix" "${run_id%%-*}" "${run_id%%-*}" "${run_id%%-*}" "$run_id"
}

remote_object() {
  printf 's3://%s/%s/%s' "$R2_BUCKET" "$remote_prefix" "$1"
}

remote_put_verified() {
  file=$1
  key=$2
  checksum=$3
  size=$4
  aws s3api put-object --endpoint-url "$R2_ENDPOINT_URL" --bucket "$R2_BUCKET" --key "$key" --body "$file" --metadata "sha256=$checksum" >/dev/null
  remote_size=$(aws s3api head-object --endpoint-url "$R2_ENDPOINT_URL" --bucket "$R2_BUCKET" --key "$key" --query ContentLength --output text)
  remote_checksum=$(aws s3api head-object --endpoint-url "$R2_ENDPOINT_URL" --bucket "$R2_BUCKET" --key "$key" --query 'Metadata.sha256' --output text)
  [ "$remote_size" = "$size" ] || fail "R2 size verification failed for $key"
  [ "$remote_checksum" = "$checksum" ] || fail "R2 checksum metadata verification failed for $key"
}

remote_put_marker() {
  marker="$BACKUP_ROOT/.complete-marker.$$"
  : >"$marker"
  aws s3api put-object --endpoint-url "$R2_ENDPOINT_URL" --bucket "$R2_BUCKET" --key "$remote_prefix/COMPLETE" --body "$marker" >/dev/null
  rm -f "$marker"
}

write_manifest() {
  offsite_status=$1
  manifest_tmp="$run_dir/manifest.tsv.partial"
  {
    printf 'format_version\tbackup_id\tstarted_at\tcompleted_at\tcontrol_database\tlocal_status\toffsite_status\trelease_version\n'
    printf '1\t%s\t%s\t%s\t%s\tSUCCESS\t%s\t%s\n' "$run_id" "$started_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$control_db" "$offsite_status" "${CLASSORA_RELEASE_VERSION:-unknown}"
    printf 'kind\ttenant_id\ttenant_slug\tsource_database\tfilename\tstarted_at\tcompleted_at\tsize\tsha256\n'
    cat "$artifact_rows"
  } >"$manifest_tmp"
  mv "$manifest_tmp" "$run_dir/manifest.tsv"
}

prune_local() {
  case "$BACKUP_LOCAL_RUNS" in
    2|3) ;;
    *) fail 'BACKUP_LOCAL_RUNS must be 2 or 3' ;;
  esac
  list="$run_dir/.complete-runs"
  : >"$list"
  find "$BACKUP_ROOT" -mindepth 5 -maxdepth 5 -type f -name COMPLETE -print 2>/dev/null \
    | while IFS= read -r marker; do dirname "$marker"; done \
    | sort -r >"$list"
  keep=0
  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    keep=$((keep + 1))
    if [ "$keep" -gt "$BACKUP_LOCAL_RUNS" ] && [ "$candidate" != "$run_dir" ]; then
      case "$candidate" in
        "$BACKUP_ROOT"/[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]/*)
          rm -rf "$candidate"
          ;;
        *) fail "refusing to prune unvalidated local backup path: $candidate" ;;
      esac
    fi
  done <"$list"
  rm -f "$list"
}

prune_remote() {
  # Remote pruning is intentionally conservative: only complete, validated run prefixes are candidates.
  complete_list="$run_dir/.remote-complete-runs"
  aws s3api list-objects-v2 --endpoint-url "$R2_ENDPOINT_URL" --bucket "$R2_BUCKET" --prefix "${R2_PREFIX#/}/" --query 'Contents[?ends_with(Key, `/COMPLETE`)].Key' --output text \
    | tr '\t' '\n' \
    | while IFS= read -r key; do
        case "$key" in
          "${R2_PREFIX#/}"/production/[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]/[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z/COMPLETE)
            printf '%s\n' "${key%/COMPLETE}" ;;
          *)
            echo "Skipping malformed remote backup marker: $key" >&2
            ;;
        esac
      done >"$complete_list"

  [ -s "$complete_list" ] || { rm -f "$complete_list"; return 0; }
  keep_file="$run_dir/.remote-keep"
  : >"$keep_file"
  days_file="$run_dir/.remote-days"
  weeks_file="$run_dir/.remote-weeks"
  months_file="$run_dir/.remote-months"
  : >"$days_file"; : >"$weeks_file"; : >"$months_file"
  day_count=0; week_count=0; month_count=0
  while IFS= read -r prefix; do
    backup_id=${prefix##*/}
    date_part=${backup_id%T*}
    year=${date_part%????}; month=${date_part#????}; month=${month%??}; day=${date_part#??????}
    day_key="$date_part"
    week_key=$(date -u -d "${date_part}T00:00:00Z" +%G-W%V 2>/dev/null || date -u -j -f '%Y%m%dT%H%M%SZ' "${backup_id}" +%G-W%V)
    month_key=${date_part%??}
    if ! grep -Fqx "$day_key" "$days_file"; then
      day_count=$((day_count + 1)); printf '%s\n' "$day_key" >>"$days_file"
    fi
    if ! grep -Fqx "$week_key" "$weeks_file"; then
      week_count=$((week_count + 1)); printf '%s\n' "$week_key" >>"$weeks_file"
    fi
    if ! grep -Fqx "$month_key" "$months_file"; then
      month_count=$((month_count + 1)); printf '%s\n' "$month_key" >>"$months_file"
    fi
    [ "$day_count" -le 14 ] || [ "$week_count" -le 8 ] || [ "$month_count" -le 12 ] || continue
    printf '%s\n' "$prefix" >>"$keep_file"
  done <"$complete_list"

  while IFS= read -r prefix; do
    [ -n "$prefix" ] || continue
    grep -Fqx "$prefix" "$keep_file" && continue
    case "$prefix" in
      "${R2_PREFIX#/}"/production/[0-9][0-9][0-9][0-9]/[0-9][0-9]/[0-9][0-9]/*)
        aws s3 rm --endpoint-url "$R2_ENDPOINT_URL" "s3://$R2_BUCKET/$prefix/" --recursive >/dev/null ;;
      *) fail "refusing to prune unvalidated remote backup path: $prefix" ;;
    esac
  done <"$complete_list"
  rm -f "$complete_list" "$keep_file" "$days_file" "$weeks_file" "$months_file"
}

case "${1:-run}" in
  status)
    status_command
    exit 0
    ;;
  last-success)
    last_success_command
    exit 0
    ;;
  run)
    ;;
  *)
    echo "Usage: $0 [run|status|last-success]" >&2
    exit 2
    ;;
esac

mkdir -p "$BACKUP_ROOT"
if ! mkdir "$lock_dir" 2>/dev/null; then
  fail "another backup or restore is running (lock: $lock_dir)"
fi
lock_held=1
printf '%s\n' "$$" >"$lock_dir/pid"
trap on_exit EXIT HUP INT TERM

started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
run_id=$(date -u +%Y%m%dT%H%M%SZ)
date_part=${run_id%T*}
year=${date_part%????}
month=${date_part#????}; month=${month%??}
day=${date_part#??????}
run_dir="$BACKUP_ROOT/$year/$month/$day/$run_id"
[ ! -e "$run_dir" ] || fail "backup run already exists: $run_dir"
mkdir -p "$run_dir"
chmod 700 "$run_dir"
artifact_rows="$run_dir/.artifact-rows"
: >"$artifact_rows"
control_db=

if remote_configured; then
  require_r2_config
fi

registry_file="$run_dir/registry.tsv"
registry_after="$run_dir/registry-after.tsv"
if ! compose exec -T postgres sh -c \
  'psql -X --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$CONTROL_DB_NAME" --no-align --tuples-only --field-separator="|" --command="SELECT id, slug, db_name FROM tenants ORDER BY created_at, id"' \
  >"$run_dir/.registry-rows"; then
  fail 'could not read the tenant registry from the control database'
fi
control_db=$(compose exec -T postgres sh -c 'printf %s "$CONTROL_DB_NAME"' | tr -d '\r\n')
[ -n "$control_db" ] || fail 'could not determine the control database name'
{
  printf 'tenant_id\ttenant_slug\tdb_name\n'
  tr '|' "$TAB" <"$run_dir/.registry-rows"
} >"$registry_file"
cp "$registry_file" "$registry_after"

control_dump="$run_dir/control.dump"
control_started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "[control] backing up control database"
if ! compose exec -T postgres sh -c \
  'pg_dump --format=custom --no-owner --no-privileges --username "$POSTGRES_USER" --dbname "$CONTROL_DB_NAME"' \
  </dev/null >"$control_dump.partial"; then
  fail '[control] backup failed'
fi
mv "$control_dump.partial" "$control_dump"
control_completed=$(date -u +%Y-%m-%dT%H:%M:%SZ)
control_checksum=$(sha256_file "$control_dump")
control_size=$(file_size "$control_dump")
printf 'control\t-\t-\t%s\tcontrol.dump\t%s\t%s\t%s\t%s\n' "$control_db" "$control_started" "$control_completed" "$control_size" "$control_checksum" >>"$artifact_rows"

tenant_count=0
tenant_successes=0
while IFS="$TAB" read -r tenant_id slug db_name; do
  [ "$tenant_id" = tenant_id ] && continue
  tenant_count=$((tenant_count + 1))
  case "$tenant_id" in
    ''|*[!A-Z0-9]*) fail "[tenant row $tenant_count] invalid tenant ID in registry" ;;
  esac
  case "$slug" in
    ''|*[!a-z0-9-]*) fail "[tenant row $tenant_count] invalid registry slug" ;;
  esac
  case "$slug" in
    -*|*-) fail "[tenant row $tenant_count] invalid registry slug" ;;
  esac
  [ "${#slug}" -le 47 ] || fail "[tenant $slug] registry slug is too long"
  case "$db_name" in
    ''|*[!A-Za-z0-9_-]*) fail "[tenant $slug] invalid registry database name" ;;
  esac
  [ "$db_name" != "$control_db" ] || fail "[tenant $slug] registry database is the control database"

  output="$run_dir/tenant-$slug.dump"
  tenant_started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo "[tenant $slug] backing up database \"$db_name\""
  if ! compose exec -T postgres sh -c \
    'pg_dump --format=custom --no-owner --no-privileges --username "$POSTGRES_USER" --dbname "$1"' sh "$db_name" \
    </dev/null >"$output.partial"; then
    fail "[tenant $slug] backup failed for database \"$db_name\""
  fi
  mv "$output.partial" "$output"
  tenant_completed=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  tenant_checksum=$(sha256_file "$output")
  tenant_size=$(file_size "$output")
  printf 'tenant\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$tenant_id" "$slug" "$db_name" "tenant-$slug.dump" "$tenant_started" "$tenant_completed" "$tenant_size" "$tenant_checksum" >>"$artifact_rows"
  tenant_successes=$((tenant_successes + 1))
done <"$registry_file"

if ! compose exec -T postgres sh -c \
  'psql -X --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$CONTROL_DB_NAME" --no-align --tuples-only --field-separator="|" --command="SELECT id, slug, db_name FROM tenants ORDER BY created_at, id"' \
  >"$run_dir/.registry-after-rows"; then
  fail 'could not re-read the tenant registry after database dumps'
fi
{
  printf 'tenant_id\ttenant_slug\tdb_name\n'
  tr '|' "$TAB" <"$run_dir/.registry-after-rows"
} >"$registry_after"
if ! cmp -s "$registry_file" "$registry_after"; then
  fail 'tenant registry changed during backup; run is not publishable'
fi
registry_checksum=$(sha256_file "$registry_file")
registry_size=$(file_size "$registry_file")
printf 'registry\t-\t-\t-\tregistry.tsv\t%s\t%s\t%s\t%s\n' "$started_at" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$registry_size" "$registry_checksum" >>"$artifact_rows"

write_manifest PENDING

if remote_configured; then
  remote_prefix="${R2_PREFIX#/}/production/$year/$month/$day/$run_id"
  while IFS="$TAB" read -r kind tenant_id slug source_database filename started completed size checksum; do
    [ -n "$kind" ] || continue
    remote_put_verified "$run_dir/$filename" "$remote_prefix/$filename" "$checksum" "$size"
  done <"$artifact_rows"
  write_manifest VERIFIED
  manifest_checksum=$(sha256_file "$run_dir/manifest.tsv")
  manifest_size=$(file_size "$run_dir/manifest.tsv")
  remote_put_verified "$run_dir/manifest.tsv" "$remote_prefix/manifest.tsv" "$manifest_checksum" "$manifest_size"
  remote_put_marker
  prune_remote
else
  remote_prefix=
  write_manifest DISABLED
fi

prune_local
: >"$run_dir/COMPLETE"
chmod 600 "$run_dir"/*.dump "$run_dir"/*.tsv "$run_dir"/COMPLETE
run_status=SUCCESS
echo "Backup summary: control=ok, tenants=$tenant_successes/$tenant_count, offsite=$([ "$BACKUP_UPLOAD" = 1 ] && printf verified || printf disabled)"
echo "Backup completed: $run_dir"
exit 0
