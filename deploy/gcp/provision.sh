#!/usr/bin/env bash
#
# Create the Google Cloud resources this app needs. Safe to re-run: every step
# either creates the resource or reports that it already exists.
#
# Run once per environment. deploy.sh is what you run on every code change.
#
# Cloud Run rather than GKE because this app is one container and one replica.
#
# The database keeps its public address and adds no authorized networks. That
# is not a gap: connections arrive through the Cloud SQL Auth proxy, which
# authenticates with IAM, so the address answers nothing without credentials.
# Removing the address instead would need a private IP and Serverless VPC
# Access for Cloud Run to reach it at all -- more moving parts for the same
# property.
set -euo pipefail

cd "$(dirname "$0")"
[ -f .env ] || { echo "deploy/gcp/.env not found. Copy env.example to .env and edit it." >&2; exit 1; }
# shellcheck disable=SC1091
source .env

require() { [ -n "${!1:-}" ] || { echo "$1 must be set in deploy/gcp/.env" >&2; exit 1; }; }
for v in PROJECT_ID REGION APP_NAME AR_REPO SERVICE_NAME MIGRATE_JOB_NAME OPS_JOB_NAME \
         SQL_INSTANCE SQL_TIER SQL_DATABASE SQL_USER UPLOADS_BUCKET SERVICE_ACCOUNT \
         AUTH_SECRET ANTHROPIC_API_KEY; do require "$v"; done

gcloud config set project "$PROJECT_ID" >/dev/null

# `|| true` on a create would report success for a quota denial, a tier not
# offered in this region, or a missing permission, and the next step would run
# against a resource that does not exist. Every create is followed by a check
# that it is actually there.
fatal() { echo "    FAILED: $1" >&2; exit 1; }

echo "==> enabling APIs"
gcloud services enable \
  run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com storage.googleapis.com cloudbuild.googleapis.com \
  --project "$PROJECT_ID" --quiet

echo "==> artifact registry"
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker --location="$REGION" \
  --description="${APP_NAME} images" --quiet 2>/dev/null || echo "    exists"
gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" --quiet >/dev/null 2>&1 \
  || fatal "artifact registry repository ${AR_REPO} does not exist in ${REGION}"

echo "==> cloud sql postgres 16"
if [ -z "${SQL_PASSWORD:-}" ]; then
  SQL_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)Aa1"
  echo "    generated database password (store this now, it is not shown again):"
  echo "    $SQL_PASSWORD"
fi
gcloud sql instances create "$SQL_INSTANCE" \
  --database-version=POSTGRES_16 --tier="$SQL_TIER" --region="$REGION" \
  --storage-size=20 --storage-auto-increase \
  --quiet 2>/dev/null || echo "    exists"
gcloud sql instances describe "$SQL_INSTANCE" --quiet >/dev/null 2>&1 \
  || fatal "Cloud SQL instance ${SQL_INSTANCE} does not exist. Re-run without 2>/dev/null to see why the create was refused -- an unavailable SQL_TIER for this region is the usual cause."
gcloud sql databases create "$SQL_DATABASE" --instance="$SQL_INSTANCE" --quiet 2>/dev/null || true
# Re-run sets the password, so .provisioned and the instance cannot disagree.
gcloud sql users create "$SQL_USER" --instance="$SQL_INSTANCE" \
  --password="$SQL_PASSWORD" --quiet 2>/dev/null \
  || gcloud sql users set-password "$SQL_USER" --instance="$SQL_INSTANCE" \
       --password="$SQL_PASSWORD" --quiet

echo "==> uploads bucket (student records — must outlive any revision)"
gcloud storage buckets create "gs://${UPLOADS_BUCKET}" \
  --location="$REGION" --uniform-bucket-level-access \
  --public-access-prevention --quiet 2>/dev/null || echo "    exists"
gcloud storage buckets describe "gs://${UPLOADS_BUCKET}" --quiet >/dev/null 2>&1 \
  || fatal "bucket gs://${UPLOADS_BUCKET} does not exist. Bucket names are globally unique; pick another UPLOADS_BUCKET."

echo "==> service account"
SA_EMAIL="${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud iam service-accounts create "$SERVICE_ACCOUNT" \
  --display-name="${APP_NAME} Cloud Run" --quiet 2>/dev/null || echo "    exists"
gcloud iam service-accounts describe "$SA_EMAIL" --quiet >/dev/null 2>&1 \
  || fatal "service account ${SA_EMAIL} does not exist"

echo "==> secrets"
# A new version each run. Re-running with a *different* AUTH_SECRET silently
# signs every administrator out, because the JWTs in their browsers were signed
# with the old one -- so change it deliberately, not by editing .env in passing.
put_secret() {
  local name="$1" value="$2"
  gcloud secrets describe "$name" --quiet >/dev/null 2>&1 \
    || gcloud secrets create "$name" --replication-policy=automatic --quiet
  printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --quiet >/dev/null
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role=roles/secretmanager.secretAccessor --quiet >/dev/null
}

CONNECTION_NAME="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')"
# Over the Cloud SQL unix socket. Prisma needs an explicit role in the URL --
# it does not fall back to the OS user the way psql does, and a userless URL
# fails migrate with P1010: User was denied access.
DATABASE_URL="postgresql://${SQL_USER}:${SQL_PASSWORD}@localhost/${SQL_DATABASE}?host=/cloudsql/${CONNECTION_NAME}&schema=public"

put_secret "${APP_NAME}-database-url" "$DATABASE_URL"
put_secret "${APP_NAME}-auth-secret" "$AUTH_SECRET"
put_secret "${APP_NAME}-anthropic-key" "$ANTHROPIC_API_KEY"

echo "==> iam"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" --role=roles/cloudsql.client \
  --condition=None --quiet >/dev/null
# Object admin on this bucket only, not project-wide storage access: the
# service reads and writes attachments here and has no business anywhere else.
gcloud storage buckets add-iam-policy-binding "gs://${UPLOADS_BUCKET}" \
  --member="serviceAccount:${SA_EMAIL}" --role=roles/storage.objectAdmin --quiet >/dev/null

cat > .provisioned <<EOF
export SQL_PASSWORD='${SQL_PASSWORD}'
export CONNECTION_NAME='${CONNECTION_NAME}'
export SA_EMAIL='${SA_EMAIL}'
export AR_HOST='${REGION}-docker.pkg.dev'
EOF
chmod 600 .provisioned

echo
echo "Provisioned. Connection details written to deploy/gcp/.provisioned (chmod 600)."
echo "Next: ./deploy.sh"
