#!/usr/bin/env bash
#
# Build, push, migrate, then roll the service. Run on every code change.
#
# Order matters: migrations are applied by a Cloud Run job that runs to
# completion BEFORE the new revision serves traffic. The schema must never be
# behind the code. This repo has already had one production outage from that
# ordering — a re-index ran against a database missing a column, deleted every
# policy chunk, could not write the replacements, and retrieval silently
# returned nothing.
set -euo pipefail

cd "$(dirname "$0")"
[ -f .env ] || { echo "deploy/gcp/.env not found. Run provision.sh first." >&2; exit 1; }
# shellcheck disable=SC1091
source .env
[ -f .provisioned ] || { echo ".provisioned not found. Run provision.sh first." >&2; exit 1; }
# shellcheck disable=SC1091
source .provisioned

REPO_ROOT="$(cd ../.. && pwd)"
TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
[ -z "$(git -C "$REPO_ROOT" status --porcelain)" ] || TAG="${TAG}-dirty"

IMAGE_BASE="${AR_HOST}/${PROJECT_ID}/${AR_REPO}"
APP_IMAGE="${IMAGE_BASE}/${APP_NAME}:${TAG}"
MIGRATE_IMAGE="${IMAGE_BASE}/${APP_NAME}-migrate:${TAG}"

echo "==> building for linux/amd64 (Cloud Run does not run arm64 images)"
gcloud auth configure-docker "$AR_HOST" --quiet
docker build --platform linux/amd64 -t "$APP_IMAGE" "$REPO_ROOT"
docker build --platform linux/amd64 --target migrator -t "$MIGRATE_IMAGE" "$REPO_ROOT"
docker push "$APP_IMAGE"
docker push "$MIGRATE_IMAGE"

SECRETS="DATABASE_URL=${APP_NAME}-database-url:latest"

echo "==> applying migrations (job runs to completion before the service rolls)"
# `jobs deploy` creates or updates, so this is the same command on every run.
gcloud run jobs deploy "$MIGRATE_JOB_NAME" \
  --image "$MIGRATE_IMAGE" --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --set-cloudsql-instances "$CONNECTION_NAME" \
  --set-secrets "$SECRETS" \
  --max-retries 0 --task-timeout 10m --quiet

if ! gcloud run jobs execute "$MIGRATE_JOB_NAME" --region "$REGION" --wait --quiet; then
  echo "    MIGRATION FAILED — not rolling the service. Logs:" >&2
  gcloud logging read \
    "resource.type=cloud_run_job AND resource.labels.job_name=${MIGRATE_JOB_NAME}" \
    --project "$PROJECT_ID" --limit 100 --format='value(textPayload)' >&2 || true
  exit 1
fi
echo "    migrations applied"

echo "==> service"
# The URL is only knowable once the service exists, and NEXTAUTH_URL needs it.
# On the first run, deploy without it, read the URL, then deploy again.
SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" \
               --format='value(status.url)' 2>/dev/null || echo '')"

deploy_service() {
  # --execution-environment=gen2 is required for volume mounts.
  #
  # min=max=1 is deliberate, not a cost setting. The rate limiter counts in
  # process memory, so N instances make the effective limit N times what is
  # configured -- it degrades quietly. Scale-to-zero would also make an
  # administrator wait through a cold start mid-incident. Raising either needs
  # a shared counter store first.
  gcloud run deploy "$SERVICE_NAME" \
    --image "$APP_IMAGE" --region "$REGION" \
    --service-account "$SA_EMAIL" \
    --execution-environment gen2 \
    --port 3000 --cpu 1 --memory 1Gi \
    --min-instances 1 --max-instances 1 \
    --allow-unauthenticated \
    --set-cloudsql-instances "$CONNECTION_NAME" \
    --set-secrets "DATABASE_URL=${APP_NAME}-database-url:latest,AUTH_SECRET=${APP_NAME}-auth-secret:latest,ANTHROPIC_API_KEY=${APP_NAME}-anthropic-key:latest" \
    --set-env-vars "UPLOADS_DIR=/app/uploads,AUTH_TRUST_HOST=true${1:+,NEXTAUTH_URL=$1}${ANTHROPIC_MODEL:+,ANTHROPIC_MODEL=$ANTHROPIC_MODEL}" \
    --add-volume "name=uploads,type=cloud-storage,bucket=${UPLOADS_BUCKET}" \
    --add-volume-mount "volume=uploads,mount-path=/app/uploads" \
    --quiet
}

if [ -z "$SERVICE_URL" ]; then
  deploy_service ""
  SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)')"
  echo "    first run: re-deploying with NEXTAUTH_URL=${SERVICE_URL}"
fi
deploy_service "$SERVICE_URL"

echo
echo "Deployed: ${SERVICE_URL}"
echo "Health:   ${SERVICE_URL}/api/health"
echo
echo "First deploy only — create the admin user with the ops job:"
echo "  ./ops.sh user:create -- --email you@example.org --name 'Your Name' --role admin"
