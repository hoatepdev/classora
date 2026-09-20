#!/bin/sh
set -eu

umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(dirname "$SCRIPT_DIR")
INFRA_DIR="$REPO_DIR/infrastructure"
COMPOSE_FILE="$INFRA_DIR/docker-compose.yml"
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-}
BACKUP_ROOT=${BACKUP_ROOT:-$INFRA_DIR/backup}
CLEANUP=0
REQUIRE_DATA=0
SOURCE=
R2_SOURCE=
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
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  else echo 'Neither sha256sum nor shasum is available' >&2; return 1; fi
}

fail() { echo "$1" >&2; exit 1; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --source) [ "$#" -ge 2 ] || fail '--source requires a run directory'; SOURCE=$2; shift 2 ;;
    --r2) [ "$#" -ge 2 ] || fail '--r2 requires an s3://bucket/prefix URL'; R2_SOURCE=$2; shift 2 ;;
    --cleanup) CLEANUP=1; shift ;;
    --require-data) REQUIRE_DATA=1; shift ;;
    *) fail "unknown option: $1" ;;
  esac
done
[ -n "$SOURCE" ] || [ -n "$R2_SOURCE" ] || fail 'provide exactly one of --source or --r2'
[ -z "$SOURCE" ] || [ -z "$R2_SOURCE" ] || fail 'provide exactly one of --source or --r2'

lock_dir=${BACKUP_LOCK_DIR:-$BACKUP_ROOT/.lock}
if ! mkdir "$lock_dir" 2>/dev/null; then fail "another backup or restore is running (lock: $lock_dir)"; fi
printf '%s\n' "$$" >"$lock_dir/pid"
restore_root=
cleanup_targets=
cleanup_restore() {
  rc=$?
  if [ "$rc" -ne 0 ] && [ -n "$cleanup_targets" ] && [ -f "$cleanup_targets" ]; then
    while IFS='|' read -r database _; do
      [ -n "$database" ] || continue
      compose exec -T postgres sh -c 'dropdb --if-exists --username "$POSTGRES_USER" "$1"' sh "$database" >/dev/null 2>&1 || true
    done <"$cleanup_targets"
  fi
  [ -n "$restore_root" ] && rm -rf "$restore_root"
  rm -rf "$lock_dir"
  exit "$rc"
}
trap cleanup_restore EXIT HUP INT TERM

if [ -n "$R2_SOURCE" ]; then
  case "$R2_SOURCE" in s3://*/*) ;; *) fail 'R2 source must be s3://bucket/prefix' ;; esac
  command -v aws >/dev/null 2>&1 || fail '--r2 requires the AWS CLI'
  : "${R2_ENDPOINT_URL:?R2_ENDPOINT_URL is required for --r2}"
  : "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required for --r2}"
  : "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required for --r2}"
  export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-auto} AWS_EC2_METADATA_DISABLED=true
  bucket=${R2_SOURCE#s3://}; bucket=${bucket%%/*}
  prefix=${R2_SOURCE#s3://$bucket/}; prefix=${prefix%/}
  case "$prefix" in *..*|/*) fail 'unsafe R2 backup prefix' ;; esac
  restore_root=$(mktemp -d "${TMPDIR:-/tmp}/classora-restore.XXXXXX")
  mkdir -p "$restore_root/source"
  aws s3api head-object --endpoint-url "$R2_ENDPOINT_URL" --bucket "$bucket" --key "$prefix/COMPLETE" >/dev/null || fail 'R2 backup is not marked COMPLETE'
  aws s3 cp --endpoint-url "$R2_ENDPOINT_URL" "s3://$bucket/$prefix/manifest.tsv" "$restore_root/source/manifest.tsv" >/dev/null
  SOURCE="$restore_root/source"
  awk -F '\t' 'BEGIN{a=0} /^kind\t/{a=1; next} a && NF >= 5 {print $5}' "$SOURCE/manifest.tsv" | while IFS= read -r filename; do
    [ -n "$filename" ] || continue
    case "$filename" in control.dump|tenant-*.dump|registry.tsv) ;; *) fail "manifest contains unsafe artifact: $filename" ;; esac
    aws s3 cp --endpoint-url "$R2_ENDPOINT_URL" "s3://$bucket/$prefix/$filename" "$SOURCE/$filename" >/dev/null
  done
else
  case "$SOURCE" in /*) ;; *) SOURCE=$REPO_DIR/$SOURCE ;; esac
  [ -d "$SOURCE" ] || fail "backup run does not exist: $SOURCE"
  restore_root=$(mktemp -d "${TMPDIR:-/tmp}/classora-restore.XXXXXX")
  mkdir -p "$restore_root/source"
  cp -R "$SOURCE"/. "$restore_root/source/"
  SOURCE="$restore_root/source"
fi

[ -f "$SOURCE/COMPLETE" ] || fail 'backup run is not marked COMPLETE'
[ -f "$SOURCE/manifest.tsv" ] || fail 'backup manifest is missing'
[ -f "$SOURCE/control.dump" ] || fail 'control.dump is missing'

metadata=$(awk -F '\t' 'NR==2 {print; exit}' "$SOURCE/manifest.tsv")
run_id=$(printf '%s\n' "$metadata" | cut -f2)
format_version=$(printf '%s\n' "$metadata" | cut -f1)
control_source_db=$(printf '%s\n' "$metadata" | cut -f5)
[ "$format_version" = 1 ] || fail 'unsupported backup manifest version'
case "$run_id" in [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z) ;; *) fail 'invalid backup run ID' ;; esac
case "$control_source_db" in ''|*[!A-Za-z0-9_-]*) fail 'invalid control database name in manifest' ;; esac

artifact_rows="$SOURCE/.restore-artifacts"
awk -F '\t' 'BEGIN{a=0} /^kind\t/{a=1; next} a && NF >= 9 {print}' "$SOURCE/manifest.tsv" >"$artifact_rows"
control_row=$(awk -F '\t' '$1 == "control" {print; exit}' "$artifact_rows")
[ -n "$control_row" ] || fail 'manifest has no control artifact'
tenant_rows="$SOURCE/.restore-tenants"
awk -F '\t' '$1 == "tenant" {print}' "$artifact_rows" >"$tenant_rows"

tenant_count=0
seen_slugs="$SOURCE/.seen-slugs"
seen_dbs="$SOURCE/.seen-dbs"
: >"$seen_slugs"; : >"$seen_dbs"
while IFS="$TAB" read -r kind tenant_id slug source_db filename started completed size checksum; do
  tenant_count=$((tenant_count + 1))
  [ "$kind" = tenant ] || fail 'invalid tenant manifest row'
  case "$tenant_id" in ''|*[!A-Z0-9]*) fail "invalid tenant ID for $slug" ;; esac
  case "$slug" in
    ''|*[!a-z0-9-]*) fail "invalid tenant slug: $slug" ;;
  esac
  case "$slug" in
    -*|*-) fail "invalid tenant slug: $slug" ;;
  esac
  case "$source_db" in ''|*[!A-Za-z0-9_-]*) fail "invalid tenant database name for $slug" ;; esac
  [ "$source_db" != "$control_source_db" ] || fail "tenant $slug points to control database"
  case "$filename" in tenant-"$slug".dump) ;; *) fail "tenant artifact filename does not match slug: $filename" ;; esac
  grep -Fqx "$slug" "$seen_slugs" && fail "duplicate tenant slug: $slug"
  grep -Fqx "$source_db" "$seen_dbs" && fail "duplicate tenant database: $source_db"
  printf '%s\n' "$slug" >>"$seen_slugs"
  printf '%s\n' "$source_db" >>"$seen_dbs"
  [ -f "$SOURCE/$filename" ] || fail "missing artifact: $filename"
  [ "$(wc -c <"$SOURCE/$filename" | tr -d '[:space:]')" = "$size" ] || fail "size mismatch: $filename"
  [ "$(sha256_file "$SOURCE/$filename")" = "$checksum" ] || fail "checksum mismatch: $filename"
done <"$tenant_rows"

control_filename=$(printf '%s\n' "$control_row" | awk -F '\t' '{print $5}')
control_size=$(printf '%s\n' "$control_row" | awk -F '\t' '{print $8}')
control_checksum=$(printf '%s\n' "$control_row" | awk -F '\t' '{print $9}')
[ "$control_filename" = control.dump ] || fail 'invalid control artifact filename'
[ "$(wc -c <"$SOURCE/control.dump" | tr -d '[:space:]')" = "$control_size" ] || fail 'control dump size mismatch'
[ "$(sha256_file "$SOURCE/control.dump")" = "$control_checksum" ] || fail 'control dump checksum mismatch'
registry_size=$(awk -F '\t' '$1 == "registry" {print $8; exit}' "$artifact_rows")
registry_checksum=$(awk -F '\t' '$1 == "registry" {print $9; exit}' "$artifact_rows")
[ -f "$SOURCE/registry.tsv" ] || fail 'registry snapshot is missing'
[ "$(wc -c <"$SOURCE/registry.tsv" | tr -d '[:space:]')" = "$registry_size" ] || fail 'registry snapshot size mismatch'
[ "$(sha256_file "$SOURCE/registry.tsv")" = "$registry_checksum" ] || fail 'registry snapshot checksum mismatch'

control_target="classora_restore_verify_${run_id}_control"
case "$control_target" in *[!A-Za-z0-9_]*|????????????????????????????????????????????????????????????????) fail 'generated control database name is invalid' ;; esac
cleanup_targets="$SOURCE/.cleanup-targets"
: >"$cleanup_targets"
create_db() {
  name=$1
  case "$name" in ''|*[!A-Za-z0-9_-]*|*[!a-zA-Z0-9_]* ) fail "unsafe generated database name: $name" ;; esac
  [ "$name" != "$control_source_db" ] || fail 'generated database equals source control database'
  [ "$name" != "${POSTGRES_DB:-}" ] || fail 'generated database equals POSTGRES_DB'
  [ "${#name}" -le 63 ] || fail "generated database name is too long: $name"
  compose exec -T postgres sh -c 'createdb --username "$POSTGRES_USER" "$1"' sh "$name"
  printf '%s|%s\n' "$name" created >>"$cleanup_targets"
}
restore_db() {
  database=$1; dump=$2
  compose exec -T postgres sh -c 'pg_restore --exit-on-error --no-owner --no-privileges --username "$POSTGRES_USER" --dbname "$1"' sh "$database" <"$dump"
}

create_db "$control_target"
restore_db "$control_target" "$SOURCE/control.dump"

control_registry="$SOURCE/.control-registry"
compose exec -T postgres sh -c 'psql -X --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$1" --no-align --tuples-only --field-separator="$(printf "\\t")" --command="SELECT id, slug, db_name FROM tenants ORDER BY created_at, id"' sh "$control_target" >"$control_registry"
expected_registry="$SOURCE/.expected-registry"
awk -F '\t' '$1 == "tenant" {print $2 "\t" $3 "\t" $4}' "$artifact_rows" | sort >"$expected_registry"
actual_registry="$SOURCE/.actual-registry"
cat "$control_registry" | sort >"$actual_registry"
while IFS="$TAB" read -r tenant_id slug source_db; do
  grep -Fqx "$tenant_id$(printf '\t')$slug$(printf '\t')$source_db" "$actual_registry" || fail "restored control registry does not contain $slug -> $source_db"
done <"$expected_registry"

mapping="$SOURCE/mapping.tsv"
printf 'tenant_id\ttenant_slug\tsource_database\trestored_database\trestore_run_id\n' >"$mapping"
ordinal=0
while IFS="$TAB" read -r kind tenant_id slug source_db filename started completed size checksum; do
  ordinal=$((ordinal + 1))
  target="classora_restore_verify_${run_id}_t${ordinal}"
  create_db "$target"
  restore_db "$target" "$SOURCE/$filename"
  compose exec -T postgres sh -c 'psql -X --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$1" --command="SELECT 1 FROM information_schema.tables WHERE table_schema = '\''public'\'' AND table_name = '\''_prisma_migrations'\''"' sh "$target" | grep -q 1 || fail "tenant migration ledger missing for $slug"
  for table in students courses classes teachers enrollments schedules attendance_sessions attendance_records; do
    compose exec -T postgres sh -c 'psql -X --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$1" --tuples-only --command="$2"' sh "$target" "SELECT CASE WHEN to_regclass('public.$table') IS NOT NULL THEN 1 ELSE 0 END" | grep -q 1 || fail "tenant table missing for $slug: $table"
    mismatches=$(compose exec -T postgres sh -c 'psql -X --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$1" --tuples-only --command="SELECT count(*) FROM \"$2\" WHERE tenant_id IS DISTINCT FROM '\''$3'\''"' sh "$target" "$table" "$tenant_id" | tr -d '[:space:]')
    [ "${mismatches:-}" = 0 ] || fail "tenant isolation mismatch for $slug: $table ($mismatches row(s))"
  done
  if [ "$REQUIRE_DATA" -eq 1 ]; then
    students=$(compose exec -T postgres sh -c 'psql -X --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$1" --tuples-only --command="SELECT count(*) FROM students"' sh "$target" | tr -d '[:space:]')
    [ "${students:-0}" -gt 0 ] || fail "no representative students restored for $slug"
  fi
  updated_id=$(compose exec -T postgres sh -c 'psql -X --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$1" --tuples-only --command="WITH updated AS (UPDATE tenants SET db_name = '\''$3'\'' WHERE id = '\''$2'\'' RETURNING id) SELECT count(*) FROM updated"' sh "$control_target" "$tenant_id" "$target" | tr -d '[:space:]')
  [ "$updated_id" = 1 ] || fail "restored control mapping update failed for $slug"
  printf '%s\t%s\t%s\t%s\t%s\n' "$tenant_id" "$slug" "$source_db" "$target" "$run_id" >>"$mapping"
done <"$tenant_rows"

# Ensure the restored control mapping points only at the generated tenant databases.
while IFS="$TAB" read -r tenant_id slug source_db target restore_id; do
  [ "$tenant_id" = tenant_id ] && continue
  compose exec -T postgres sh -c 'psql -X --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$1" --tuples-only --command="SELECT CASE WHEN db_name = '\''$3'\'' THEN 1 ELSE 0 END FROM tenants WHERE id = '\''$2'\''"' sh "$control_target" "$tenant_id" "$target" | grep -q 1 || fail "restored control mapping is incorrect for $slug"
done <"$mapping"

if [ "$CLEANUP" -eq 1 ]; then
  while IFS='|' read -r database _; do
    [ -n "$database" ] || continue
    compose exec -T postgres sh -c 'dropdb --if-exists --username "$POSTGRES_USER" "$1"' sh "$database" >/dev/null
  done <"$cleanup_targets"
fi

printf 'Restore verification passed: control registry, %s tenant database(s), checksums, schema, data, and tenant isolation.\n' "$tenant_count"
printf 'Mapping: %s\n' "$mapping"
trap - EXIT HUP INT TERM
rm -rf "$restore_root" "$lock_dir"
exit 0
