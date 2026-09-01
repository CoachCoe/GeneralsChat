#!/usr/bin/env bash
#
# Build, push, migrate, then roll the app. Run on every code change.
#
# Order matters: migrations are applied by a job that runs to completion BEFORE
# the new revision serves traffic. The schema must never be behind the code.
# This repo has already had one production outage from that ordering — a
# re-index ran against a database missing a column, deleted every policy chunk,
# could not write the replacements, and retrieval silently returned nothing.
set -euo pipefail

cd "$(dirname "$0")"
[ -f .env ] || { echo "deploy/azure/.env not found. Run provision.sh first." >&2; exit 1; }
# shellcheck disable=SC1091
source .env
[ -f .provisioned ] || { echo ".provisioned not found. Run provision.sh first." >&2; exit 1; }
# shellcheck disable=SC1091
source .provisioned

REPO_ROOT="$(cd ../.. && pwd)"
TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
[ -z "$(git -C "$REPO_ROOT" status --porcelain)" ] || TAG="${TAG}-dirty"

ACR_SERVER="$(az acr show -g "$RESOURCE_GROUP" -n "$ACR_NAME" --query loginServer -o tsv)"
APP_IMAGE="${ACR_SERVER}/${APP_NAME}:${TAG}"
MIGRATE_IMAGE="${ACR_SERVER}/${APP_NAME}-migrate:${TAG}"

echo "==> building for linux/amd64 (Container Apps does not run arm64 images)"
az acr login -n "$ACR_NAME"
docker build --platform linux/amd64 -t "$APP_IMAGE" "$REPO_ROOT"
docker build --platform linux/amd64 --target migrator -t "$MIGRATE_IMAGE" "$REPO_ROOT"
docker push "$APP_IMAGE"
docker push "$MIGRATE_IMAGE"

ACR_USER="$(az acr credential show -n "$ACR_NAME" --query username -o tsv)"
ACR_PASS="$(az acr credential show -n "$ACR_NAME" --query 'passwords[0].value' -o tsv)"

echo "==> applying migrations (job runs to completion before the app rolls)"
if ! az containerapp job show -g "$RESOURCE_GROUP" -n "$MIGRATE_JOB_NAME" -o none 2>/dev/null; then
  az containerapp job create \
    -g "$RESOURCE_GROUP" -n "$MIGRATE_JOB_NAME" --environment "$ENVIRONMENT_NAME" \
    --trigger-type Manual --replica-timeout 600 --replica-retry-limit 1 \
    --image "$MIGRATE_IMAGE" --cpu 0.5 --memory 1Gi \
    --registry-server "$ACR_SERVER" --registry-username "$ACR_USER" --registry-password "$ACR_PASS" \
    --secrets "database-url=$DATABASE_URL" \
    --env-vars "DATABASE_URL=secretref:database-url" -o none
else
  az containerapp job update \
    -g "$RESOURCE_GROUP" -n "$MIGRATE_JOB_NAME" --image "$MIGRATE_IMAGE" -o none
fi

EXECUTION="$(az containerapp job start -g "$RESOURCE_GROUP" -n "$MIGRATE_JOB_NAME" --query name -o tsv)"
echo "    execution: $EXECUTION"
for _ in $(seq 1 60); do
  STATUS="$(az containerapp job execution show -g "$RESOURCE_GROUP" -n "$MIGRATE_JOB_NAME" \
            --job-execution-name "$EXECUTION" --query properties.status -o tsv 2>/dev/null || echo Running)"
  case "$STATUS" in
    Succeeded) echo "    migrations applied"; break ;;
    Failed|Degraded)
      echo "    MIGRATION FAILED — not rolling the app. Logs:" >&2
      az containerapp job logs show -g "$RESOURCE_GROUP" -n "$MIGRATE_JOB_NAME" \
        --execution "$EXECUTION" --tail 100 >&2 || true
      exit 1 ;;
  esac
  sleep 5
done
[ "${STATUS:-}" = "Succeeded" ] || { echo "    migration job did not finish in time; not rolling the app" >&2; exit 1; }

echo "==> app"
ENVIRONMENT_ID="$(az containerapp env show -g "$RESOURCE_GROUP" -n "$ENVIRONMENT_NAME" --query id -o tsv)"

# The FQDN is only knowable once the app exists, and NEXTAUTH_URL needs it. On
# the first run, create with a placeholder, read the FQDN, then apply again.
APP_FQDN="$(az containerapp show -g "$RESOURCE_GROUP" -n "$CONTAINER_APP_NAME" \
            --query properties.configuration.ingress.fqdn -o tsv 2>/dev/null || echo '')"

render() {
  export LOCATION ENVIRONMENT_ID ACR_SERVER ACR_USER ACR_PASS DATABASE_URL \
         AUTH_SECRET ANTHROPIC_API_KEY APP_IMAGE APP_FQDN STORAGE_MOUNT_NAME
  envsubst < containerapp.template.yaml > "$1"
}

RENDERED="$(mktemp)"
trap 'rm -f "$RENDERED"' EXIT

if [ -z "$APP_FQDN" ]; then
  APP_FQDN="placeholder.invalid"
  render "$RENDERED"
  az containerapp create -g "$RESOURCE_GROUP" -n "$CONTAINER_APP_NAME" --yaml "$RENDERED" -o none
  APP_FQDN="$(az containerapp show -g "$RESOURCE_GROUP" -n "$CONTAINER_APP_NAME" \
              --query properties.configuration.ingress.fqdn -o tsv)"
  echo "    first run: re-applying with NEXTAUTH_URL=https://${APP_FQDN}"
fi

render "$RENDERED"
az containerapp update -g "$RESOURCE_GROUP" -n "$CONTAINER_APP_NAME" --yaml "$RENDERED" -o none

echo
echo "Deployed: https://${APP_FQDN}"
echo "Health:   https://${APP_FQDN}/api/health"
echo
echo "First deploy only — create the admin user with the ops image:"
echo "  ./ops.sh user:create -- --email you@example.org --name 'Your Name' --role admin"
