#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
INFRA_DIR="$ROOT/infrastructure"
COMPOSE_FILE="$INFRA_DIR/docker-compose.yml"
PRODUCTION_FILE="$INFRA_DIR/docker-compose.production.yml"
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:?COMPOSE_ENV_FILE is required}
COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-classora-production}
RELEASE_VERSION=${RELEASE_VERSION:?RELEASE_VERSION is required}
RELEASE_SHA=${RELEASE_SHA:?RELEASE_SHA is required}
WEB_IMAGE=${WEB_IMAGE:?WEB_IMAGE is required}
API_IMAGE=${API_IMAGE:?API_IMAGE is required}
CURRENT_RELEASE_RECORD=${CURRENT_RELEASE_RECORD:-$INFRA_DIR/release/current.env}
RELEASE_RECORD=${RELEASE_RECORD:-$INFRA_DIR/release/$RELEASE_VERSION.env}
LOCK_FILE=${DEPLOY_LOCK_FILE:-/var/lock/classora-deploy.lock}
BACKUP_VERIFIED_FILE=${BACKUP_VERIFIED_FILE:?BACKUP_VERIFIED_FILE is required}
MIN_FREE_KB=${MIN_FREE_KB:-1048576}
BACKUP_MAX_AGE_HOURS=${BACKUP_MAX_AGE_HOURS:-36}

printf '%s\n' "$RELEASE_VERSION" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$' || {
  echo "RELEASE_VERSION must be a semantic version tag: $RELEASE_VERSION" >&2
  exit 1
}
printf '%s\n' "$RELEASE_SHA" | grep -Eq '^[0-9a-fA-F]{40,64}$' || {
  echo "RELEASE_SHA must be a full Git commit SHA: $RELEASE_SHA" >&2
  exit 1
}

# Deployment accepts only immutable registry references, never a mutable tag.
for ref in "$WEB_IMAGE" "$API_IMAGE"; do
  printf '%s\n' "$ref" | grep -Eq '^[^[:space:]@]+@sha256:[0-9a-fA-F]{64}$' || {
    echo "image must be a digest-qualified reference: $ref" >&2
    exit 1
  }
done

[ -r "$COMPOSE_ENV_FILE" ] || { echo "COMPOSE_ENV_FILE is not readable: $COMPOSE_ENV_FILE" >&2; exit 1; }
[ -s "$BACKUP_VERIFIED_FILE" ] || { echo "verified backup marker is required: $BACKUP_VERIFIED_FILE" >&2; exit 1; }
backup_run=$(sed -n 's/^run_dir=//p' "$BACKUP_VERIFIED_FILE" | head -n 1)
backup_completed=$(sed -n 's/^completed_at=//p' "$BACKUP_VERIFIED_FILE" | head -n 1)
[ "$(sed -n 's/^status=//p' "$BACKUP_VERIFIED_FILE" | head -n 1)" = SUCCESS ] && [ -n "$backup_run" ] && [ -f "$backup_run/COMPLETE" ] && [ -f "$backup_run/manifest.tsv" ] && [ "$(awk -F '\\t' 'NR == 2 { print $6; exit }' "$backup_run/manifest.tsv")" = SUCCESS ] && [ "$(awk -F '\\t' 'NR == 2 { print $7; exit }' "$backup_run/manifest.tsv")" = VERIFIED ] || {
  echo 'verified backup marker must reference a complete backup run with a manifest' >&2
  exit 1
}
case "$backup_completed" in
  *Z) ;;
  *) echo 'verified backup marker must contain completed_at in UTC format' >&2; exit 1 ;;
esac
backup_age=$(( $(date -u +%s) - $(date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$backup_completed" +%s 2>/dev/null || date -u -d "$backup_completed" +%s) ))
[ "$backup_age" -ge 0 ] && [ "$backup_age" -le $((BACKUP_MAX_AGE_HOURS * 3600)) ] || {
  echo "verified backup is older than ${BACKUP_MAX_AGE_HOURS} hours" >&2
  exit 1
}
if [ "${INITIAL_RELEASE:-0}" != 1 ]; then
  [ -s "$CURRENT_RELEASE_RECORD" ] || {
    echo "current release record is required: $CURRENT_RELEASE_RECORD" >&2
    exit 1
  }
  [ "$(sed -n 's/^RELEASE_STATUS=//p' "$CURRENT_RELEASE_RECORD" | head -n 1)" = ACTIVE ] || {
    echo "current release record is not active: $CURRENT_RELEASE_RECORD" >&2
    exit 1
  }
fi
[ "$RELEASE_RECORD" != "$CURRENT_RELEASE_RECORD" ] || {
  echo 'RELEASE_RECORD must be distinct from CURRENT_RELEASE_RECORD' >&2
  exit 1
}

# Check the filesystem backing Docker before pulling a second image set.
docker_root=$(docker info --format '{{.DockerRootDir}}')
free_kb=$(df -Pk "$docker_root" | awk 'NR == 2 { print $4 }')
[ "${free_kb:-0}" -ge "$MIN_FREE_KB" ] || {
  echo "insufficient free Docker disk space: ${free_kb:-0} KiB < $MIN_FREE_KB KiB" >&2
  exit 1
}

export COMPOSE_ENV_FILE COMPOSE_PROJECT_NAME WEB_IMAGE API_IMAGE
export COMPOSE_PROFILES=${COMPOSE_PROFILES:-production}

compose() {
  docker compose --project-name "$COMPOSE_PROJECT_NAME" --env-file "$COMPOSE_ENV_FILE" \
    -f "$COMPOSE_FILE" -f "$PRODUCTION_FILE" "$@"
}

mkdir -p "$(dirname "$RELEASE_RECORD")" "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock 9

previous_web=$(sed -n 's/^WEB_IMAGE=//p' "$CURRENT_RELEASE_RECORD" 2>/dev/null || true)
previous_api=$(sed -n 's/^API_IMAGE=//p' "$CURRENT_RELEASE_RECORD" 2>/dev/null || true)

rendered_config=$(mktemp)
record_tmp=
trap 'rm -f "$rendered_config" "$record_tmp" /tmp/classora-readiness.json' EXIT

write_release_record() {
  status=$1
  record_tmp=$(mktemp "${RELEASE_RECORD}.tmp.XXXXXX")
  umask 077
  cat >"$record_tmp" <<EOF
RELEASE_STATUS=$status
RELEASE_VERSION=$RELEASE_VERSION
RELEASE_SHA=$RELEASE_SHA
WEB_IMAGE=$WEB_IMAGE
API_IMAGE=$API_IMAGE
PREVIOUS_WEB_IMAGE=$previous_web
PREVIOUS_API_IMAGE=$previous_api
BACKUP_VERIFIED_FILE=$BACKUP_VERIFIED_FILE
UPDATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
  mv "$record_tmp" "$RELEASE_RECORD"
  if [ "$status" = ACTIVE ] && [ "$RELEASE_RECORD" != "$CURRENT_RELEASE_RECORD" ]; then
    cp "$RELEASE_RECORD" "$CURRENT_RELEASE_RECORD"
    chmod 600 "$CURRENT_RELEASE_RECORD"
  fi
  record_tmp=
}
compose config >"$rendered_config"
if grep -Eq '^[[:space:]]+build:' "$rendered_config"; then
  echo 'production Compose config still contains a build section' >&2
  exit 1
fi
[ "$(grep -Fc "image: $API_IMAGE" "$rendered_config")" -eq 2 ] || {
  echo 'api and api-migrate do not resolve to the same API image' >&2
  exit 1
}
grep -F "image: $WEB_IMAGE" "$rendered_config" >/dev/null || {
  echo 'web does not resolve to WEB_IMAGE' >&2
  exit 1
}

write_release_record DEPLOYING
compose pull web api api-migrate
if ! compose run --rm --no-build api-migrate; then
  echo 'Migration failed; the new application release was not started.' >&2
  exit 1
fi

compose up -d --wait --wait-timeout 120 --no-build --no-deps api web cloudflared
for attempt in $(seq 1 60); do
  if curl -fsS -H "Host: ${INITIAL_TENANT_SLUG:?INITIAL_TENANT_SLUG is required}.classora.io.vn" \
    "http://127.0.0.1:${WEB_PORT:-4100}/api/health/ready" >/tmp/classora-readiness.json; then
    break
  fi
  [ "$attempt" -eq 60 ] && { echo 'Release readiness failed' >&2; exit 1; }
  sleep 2
done

write_release_record ACTIVE
printf '%s\n' "Production release $RELEASE_VERSION deployed from $RELEASE_SHA"
cat /tmp/classora-readiness.json
