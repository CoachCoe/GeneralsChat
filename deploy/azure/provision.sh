#!/usr/bin/env bash
#
# Create the Azure resources this app needs. Safe to re-run: every step either
# creates or reports that the resource already exists.
#
# Run once per environment. deploy.sh is what you run on every code change.
set -euo pipefail

cd "$(dirname "$0")"
[ -f .env ] || { echo "deploy/azure/.env not found. Copy env.example to .env and edit it." >&2; exit 1; }
# shellcheck disable=SC1091
source .env

require() { [ -n "${!1:-}" ] || { echo "$1 must be set in deploy/azure/.env" >&2; exit 1; }; }
for v in APP_NAME LOCATION RESOURCE_GROUP ACR_NAME ENVIRONMENT_NAME CONTAINER_APP_NAME \
         MIGRATE_JOB_NAME PG_SERVER_NAME PG_ADMIN_USER PG_DATABASE STORAGE_ACCOUNT \
         FILE_SHARE STORAGE_MOUNT_NAME AUTH_SECRET ANTHROPIC_API_KEY; do require "$v"; done

az extension add --name containerapp --upgrade --only-show-errors >/dev/null
az provider register --namespace Microsoft.App --wait >/dev/null
az provider register --namespace Microsoft.OperationalInsights --wait >/dev/null

echo "==> resource group"
az group create -n "$RESOURCE_GROUP" -l "$LOCATION" -o none

echo "==> container registry"
az acr create -g "$RESOURCE_GROUP" -n "$ACR_NAME" --sku Basic --admin-enabled true -o none

echo "==> postgres flexible server"
if [ -z "${PG_ADMIN_PASSWORD:-}" ]; then
  PG_ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)Aa1!"
  echo "    generated Postgres admin password (store this now, it is not shown again):"
  echo "    $PG_ADMIN_PASSWORD"
fi
az postgres flexible-server create \
  -g "$RESOURCE_GROUP" -n "$PG_SERVER_NAME" -l "$LOCATION" \
  --admin-user "$PG_ADMIN_USER" --admin-password "$PG_ADMIN_PASSWORD" \
  --tier Burstable --sku-name Standard_B1ms --storage-size 32 \
  --version 16 --public-access 0.0.0.0 --yes -o none 2>/dev/null || echo "    exists"
az postgres flexible-server db create \
  -g "$RESOURCE_GROUP" -s "$PG_SERVER_NAME" -d "$PG_DATABASE" -o none 2>/dev/null || true

# --public-access 0.0.0.0 allows Azure services only, not the internet. Add
# your own address explicitly if you want to connect psql from your machine.
echo "==> storage for uploads (student records — must outlive any revision)"
az storage account create \
  -g "$RESOURCE_GROUP" -n "$STORAGE_ACCOUNT" -l "$LOCATION" \
  --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 -o none 2>/dev/null || echo "    exists"
STORAGE_KEY="$(az storage account keys list -g "$RESOURCE_GROUP" -n "$STORAGE_ACCOUNT" --query '[0].value' -o tsv)"
az storage share-rm create \
  -g "$RESOURCE_GROUP" --storage-account "$STORAGE_ACCOUNT" -n "$FILE_SHARE" --quota 64 -o none 2>/dev/null || true

echo "==> container apps environment"
az containerapp env create \
  -g "$RESOURCE_GROUP" -n "$ENVIRONMENT_NAME" -l "$LOCATION" -o none 2>/dev/null || echo "    exists"

echo "==> attach the file share to the environment"
az containerapp env storage set \
  -g "$RESOURCE_GROUP" -n "$ENVIRONMENT_NAME" \
  --storage-name "$STORAGE_MOUNT_NAME" \
  --azure-file-account-name "$STORAGE_ACCOUNT" \
  --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name "$FILE_SHARE" \
  --access-mode ReadWrite -o none

cat > .provisioned <<EOF
export PG_ADMIN_PASSWORD='${PG_ADMIN_PASSWORD}'
export DATABASE_URL='postgresql://${PG_ADMIN_USER}:${PG_ADMIN_PASSWORD}@${PG_SERVER_NAME}.postgres.database.azure.com:5432/${PG_DATABASE}?sslmode=require'
EOF
chmod 600 .provisioned

echo
echo "Provisioned. Connection details written to deploy/azure/.provisioned (chmod 600)."
echo "Next: ./deploy.sh"
