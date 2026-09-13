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
[ -f .env ] || { echo "deploy/gcp/.env not found. Run provision.sh first." >&2; exit 1; }
# shellcheck disable=SC1091
source .env
[ -f .provisioned ] || { echo ".provisioned not found. Run provision.sh first." >&2; exit 1; }
# shellcheck disable=SC1091
source .provisioned

[ $# -gt 0 ] || { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

TAG="$(git -C ../.. rev-parse --short HEAD)"
IMAGE="${AR_HOST}/${PROJECT_ID}/${AR_REPO}/${APP_NAME}-migrate:${TAG}"

# `^|^` changes gcloud's --args delimiter from a comma, which a value here can
# plausibly contain: `--name 'Smith, Jane'` would otherwise arrive as two
# arguments and create a user called "Smith".
#
# The uploads mount is here because policies:reindex re-extracts from the
# stored source documents. Without it the job sees an empty directory and
# reports every policy as unreadable.
gcloud run jobs deploy "$OPS_JOB_NAME" \
  --image "$IMAGE" --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --execution-environment gen2 \
  --set-cloudsql-instances "$CONNECTION_NAME" \
  --set-secrets "DATABASE_URL=${APP_NAME}-database-url:latest,ANTHROPIC_API_KEY=${APP_NAME}-anthropic-key:latest" \
  --set-env-vars "UPLOADS_DIR=/app/uploads" \
  --add-volume "name=uploads,type=cloud-storage,bucket=${UPLOADS_BUCKET}" \
  --add-volume-mount "volume=uploads,mount-path=/app/uploads" \
  --command npm --args "$(printf '^|^%s' "$(printf '%s|' run "$@" | sed 's/|$//')")" \
  --max-retries 0 --task-timeout 30m --quiet

echo "running: npm run $*"
gcloud run jobs execute "$OPS_JOB_NAME" --region "$REGION" --wait --quiet
