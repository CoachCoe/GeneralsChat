#!/usr/bin/env bash
#
# Run an operational command against the deployed database.
#
#   ./ops.sh user:create -- --email you@example.org --name 'You' --role admin
#   ./ops.sh policies:coverage
#   ./ops.sh policies:reindex -- --apply
#
# Uses the migrator image, which carries src/ and scripts/; the app image is
# deliberately too lean to run these.
#
# These write to the pilot's real database. `policies:reindex` without --apply
# is a dry run, and that is the right way to start.
set -euo pipefail

cd "$(dirname "$0")"
# shellcheck disable=SC1091
source .env
# shellcheck disable=SC1091
source .provisioned

[ $# -gt 0 ] || { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

ACR_SERVER="$(az acr show -g "$RESOURCE_GROUP" -n "$ACR_NAME" --query loginServer -o tsv)"
TAG="$(git -C ../.. rev-parse --short HEAD)"
IMAGE="${ACR_SERVER}/${APP_NAME}-migrate:${TAG}"
JOB="job-${APP_NAME}-ops"
ACR_USER="$(az acr credential show -n "$ACR_NAME" --query username -o tsv)"
ACR_PASS="$(az acr credential show -n "$ACR_NAME" --query 'passwords[0].value' -o tsv)"

CMD_ARGS=$(printf '"%s",' npm run "$@" | sed 's/,$//')

az containerapp job delete -g "$RESOURCE_GROUP" -n "$JOB" --yes -o none 2>/dev/null || true
az containerapp job create \
  -g "$RESOURCE_GROUP" -n "$JOB" --environment "$ENVIRONMENT_NAME" \
  --trigger-type Manual --replica-timeout 1800 --replica-retry-limit 0 \
  --image "$IMAGE" --cpu 1 --memory 2Gi \
  --registry-server "$ACR_SERVER" --registry-username "$ACR_USER" --registry-password "$ACR_PASS" \
  --secrets "database-url=$DATABASE_URL" "anthropic-key=${ANTHROPIC_API_KEY}" \
  --env-vars "DATABASE_URL=secretref:database-url" "ANTHROPIC_API_KEY=secretref:anthropic-key" \
  --command "[$CMD_ARGS]" -o none

EXEC="$(az containerapp job start -g "$RESOURCE_GROUP" -n "$JOB" --query name -o tsv)"
echo "running: npm run $* (execution $EXEC)"
for _ in $(seq 1 360); do
  STATUS="$(az containerapp job execution show -g "$RESOURCE_GROUP" -n "$JOB" \
            --job-execution-name "$EXEC" --query properties.status -o tsv 2>/dev/null || echo Running)"
  [ "$STATUS" = "Running" ] || break
  sleep 5
done
az containerapp job logs show -g "$RESOURCE_GROUP" -n "$JOB" --execution "$EXEC" --tail 200 || true
echo "status: ${STATUS:-unknown}"
[ "${STATUS:-}" = "Succeeded" ]
