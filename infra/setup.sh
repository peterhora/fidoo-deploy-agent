#!/usr/bin/env bash
#
# infra/setup.sh — Idempotent Azure infrastructure setup for Deploy Agent
#
# Creates: resource group, Deploy Plugin app registration, Storage Account,
#          single Static Web App, RBAC.
# Safe to re-run — checks resource existence before creating.
#
# Prerequisites:
#   - Azure CLI (`az`) installed and logged in with admin permissions
#   - Sufficient permissions: create app registrations, assign roles,
#     create SWAs, create Storage Accounts
#
# Usage:
#   chmod +x infra/setup.sh
#   ./infra/setup.sh
#
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

LOCATION="westeurope"
RESOURCE_GROUP="rg-published-apps"
DEPLOY_PLUGIN_APP_NAME="Deploy Plugin"
SWA_SLUG="ai-apps"                        # Single SWA resource name
SWA_NAME="swa-${SWA_SLUG}"
STORAGE_ACCOUNT="stpublishedapps"          # Must be globally unique, 3-24 lowercase alphanumeric
CONTAINER_NAME="app-content"               # Blob container for app files + registry
APP_DOMAIN="ai-apps.env.fidoo.cloud"       # Custom domain (DNS configured manually)

# ── Helpers ───────────────────────────────────────────────────────────────────

info()  { printf '\033[1;34m[INFO]\033[0m  %s\n' "$*"; }
ok()    { printf '\033[1;32m[OK]\033[0m    %s\n' "$*"; }
warn()  { printf '\033[1;33m[WARN]\033[0m  %s\n' "$*"; }
error() { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

# ── Pre-flight checks ────────────────────────────────────────────────────────

info "Running pre-flight checks..."

command -v az >/dev/null 2>&1 || error "Azure CLI (az) is not installed. Install from https://aka.ms/install-azure-cli"

# Check if logged in
az account show >/dev/null 2>&1 || error "Not logged in to Azure CLI. Run: az login"

TENANT_ID=$(az account show --query tenantId -o tsv)
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
SUBSCRIPTION_NAME=$(az account show --query name -o tsv)

info "Tenant:       $TENANT_ID"
info "Subscription: $SUBSCRIPTION_NAME ($SUBSCRIPTION_ID)"

# ── 1. Resource Group ─────────────────────────────────────────────────────────

info "Checking resource group '$RESOURCE_GROUP'..."

if az group show --name "$RESOURCE_GROUP" >/dev/null 2>&1; then
  ok "Resource group '$RESOURCE_GROUP' already exists"
else
  info "Creating resource group '$RESOURCE_GROUP' in $LOCATION..."
  az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
  ok "Resource group '$RESOURCE_GROUP' created"
fi

# ── 2. App Registration: Deploy Plugin ────────────────────────────────────────

info "Checking app registration '$DEPLOY_PLUGIN_APP_NAME'..."

DEPLOY_PLUGIN_APP_ID=$(az ad app list --display-name "$DEPLOY_PLUGIN_APP_NAME" --query "[0].appId" -o tsv 2>/dev/null || true)

if [[ -n "$DEPLOY_PLUGIN_APP_ID" && "$DEPLOY_PLUGIN_APP_ID" != "None" ]]; then
  ok "App registration '$DEPLOY_PLUGIN_APP_NAME' already exists (appId: $DEPLOY_PLUGIN_APP_ID)"
else
  info "Creating app registration '$DEPLOY_PLUGIN_APP_NAME'..."
  DEPLOY_PLUGIN_APP_ID=$(az ad app create \
    --display-name "$DEPLOY_PLUGIN_APP_NAME" \
    --sign-in-audience "AzureADMyOrg" \
    --is-fallback-public-client true \
    --query appId -o tsv)
  ok "App registration '$DEPLOY_PLUGIN_APP_NAME' created (appId: $DEPLOY_PLUGIN_APP_ID)"
fi

# Enable public client flow (idempotent)
info "Ensuring public client flow is enabled..."
az ad app update --id "$DEPLOY_PLUGIN_APP_ID" --is-fallback-public-client true 2>/dev/null
ok "Public client flow enabled"

# Add API permission: Azure Service Management / user_impersonation
# Resource App ID for Azure Service Management: 797f4846-ba00-4fd7-ba43-dac1f8f63013
# Permission ID for user_impersonation: 41094075-9dad-400e-a0bd-54e686782033
info "Adding API permission (Azure Service Management / user_impersonation)..."
az ad app permission add \
  --id "$DEPLOY_PLUGIN_APP_ID" \
  --api "797f4846-ba00-4fd7-ba43-dac1f8f63013" \
  --api-permissions "41094075-9dad-400e-a0bd-54e686782033=Scope" 2>/dev/null || true
ok "API permission configured"

# Create app_publisher app role (idempotent — check if it exists first)
info "Checking app_publisher role..."
EXISTING_ROLES=$(az ad app show --id "$DEPLOY_PLUGIN_APP_ID" --query "appRoles[?value=='app_publisher'].id" -o tsv 2>/dev/null || true)

if [[ -n "$EXISTING_ROLES" ]]; then
  ok "app_publisher role already exists"
else
  info "Creating app_publisher role..."
  APP_ROLE_ID=$(uuidgen 2>/dev/null || python3 -c "import uuid; print(uuid.uuid4())")
  az ad app update --id "$DEPLOY_PLUGIN_APP_ID" --app-roles "[
    {
      \"allowedMemberTypes\": [\"User\"],
      \"description\": \"Can deploy and manage static web apps\",
      \"displayName\": \"App Publisher\",
      \"isEnabled\": true,
      \"value\": \"app_publisher\",
      \"id\": \"$APP_ROLE_ID\"
    }
  ]" 2>/dev/null
  ok "app_publisher role created"
fi

# ── 3. Storage Account ───────────────────────────────────────────────────────

info "Checking storage account '$STORAGE_ACCOUNT'..."

if az storage account show --name "$STORAGE_ACCOUNT" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  ok "Storage account '$STORAGE_ACCOUNT' already exists"
else
  info "Creating storage account '$STORAGE_ACCOUNT'..."
  az storage account create \
    --name "$STORAGE_ACCOUNT" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --output none
  ok "Storage account '$STORAGE_ACCOUNT' created"
fi

# Create blob container (idempotent)
info "Checking blob container '$CONTAINER_NAME'..."
CONTAINER_EXISTS=$(az storage container exists \
  --name "$CONTAINER_NAME" \
  --account-name "$STORAGE_ACCOUNT" \
  --auth-mode login \
  --query exists -o tsv 2>/dev/null || echo "false")

if [[ "$CONTAINER_EXISTS" == "true" ]]; then
  ok "Blob container '$CONTAINER_NAME' already exists"
else
  info "Creating blob container '$CONTAINER_NAME'..."
  az storage container create \
    --name "$CONTAINER_NAME" \
    --account-name "$STORAGE_ACCOUNT" \
    --auth-mode login \
    --output none
  ok "Blob container '$CONTAINER_NAME' created"
fi

# ── 4. Single Static Web App ─────────────────────────────────────────────────

info "Checking SWA '$SWA_NAME'..."

if az staticwebapp show --name "$SWA_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  ok "SWA '$SWA_NAME' already exists"
else
  info "Creating SWA '$SWA_NAME'..."
  az staticwebapp create \
    --name "$SWA_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Free \
    --output none
  ok "SWA '$SWA_NAME' created"
fi

# ── 5. RBAC ──────────────────────────────────────────────────────────────────

# Create a service principal for the Deploy Plugin app if it doesn't exist
info "Checking service principal for '$DEPLOY_PLUGIN_APP_NAME'..."
DEPLOY_PLUGIN_SP_ID=$(az ad sp list --filter "appId eq '$DEPLOY_PLUGIN_APP_ID'" --query "[0].id" -o tsv 2>/dev/null || true)

if [[ -z "$DEPLOY_PLUGIN_SP_ID" || "$DEPLOY_PLUGIN_SP_ID" == "None" ]]; then
  info "Creating service principal..."
  DEPLOY_PLUGIN_SP_ID=$(az ad sp create --id "$DEPLOY_PLUGIN_APP_ID" --query id -o tsv)
  ok "Service principal created (objectId: $DEPLOY_PLUGIN_SP_ID)"
else
  ok "Service principal already exists (objectId: $DEPLOY_PLUGIN_SP_ID)"
fi

# Assign Contributor on the resource group (idempotent — az role assignment create is already idempotent)
RG_ID=$(az group show --name "$RESOURCE_GROUP" --query id -o tsv)

info "Assigning Contributor role on '$RESOURCE_GROUP'..."
az role assignment create \
  --assignee "$DEPLOY_PLUGIN_APP_ID" \
  --role "Contributor" \
  --scope "$RG_ID" \
  --output none 2>/dev/null || true
ok "Contributor role assigned"

# Assign Storage Blob Data Contributor on the storage account
STORAGE_ID=$(az storage account show --name "$STORAGE_ACCOUNT" --resource-group "$RESOURCE_GROUP" --query id -o tsv)

info "Assigning Storage Blob Data Contributor on '$STORAGE_ACCOUNT'..."
az role assignment create \
  --assignee "$DEPLOY_PLUGIN_APP_ID" \
  --role "Storage Blob Data Contributor" \
  --scope "$STORAGE_ID" \
  --output none 2>/dev/null || true
ok "Storage Blob Data Contributor role assigned"

# ── 6. Write infra/.env ──────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

info "Writing config to $ENV_FILE..."
cat > "$ENV_FILE" <<EOF
# Deploy Agent configuration — generated by infra/setup.sh
# Source this file or set these environment variables before running the plugin.
#
# Usage: source infra/.env

DEPLOY_AGENT_TENANT_ID=$TENANT_ID
DEPLOY_AGENT_CLIENT_ID=$DEPLOY_PLUGIN_APP_ID
DEPLOY_AGENT_SUBSCRIPTION_ID=$SUBSCRIPTION_ID
DEPLOY_AGENT_RESOURCE_GROUP=$RESOURCE_GROUP
DEPLOY_AGENT_STORAGE_ACCOUNT=$STORAGE_ACCOUNT
DEPLOY_AGENT_CONTAINER_NAME=$CONTAINER_NAME
DEPLOY_AGENT_APP_DOMAIN=$APP_DOMAIN
DEPLOY_AGENT_SWA_SLUG=$SWA_SLUG
EOF

ok "Config written to $ENV_FILE"

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════════════════════════════"
echo "  Infrastructure setup complete!"
echo "══════════════════════════════════════════════════════════════════════════"
echo ""
echo "  Config values (also written to infra/.env):"
echo ""
echo "    DEPLOY_AGENT_TENANT_ID=$TENANT_ID"
echo "    DEPLOY_AGENT_CLIENT_ID=$DEPLOY_PLUGIN_APP_ID"
echo "    DEPLOY_AGENT_SUBSCRIPTION_ID=$SUBSCRIPTION_ID"
echo "    DEPLOY_AGENT_RESOURCE_GROUP=$RESOURCE_GROUP"
echo "    DEPLOY_AGENT_STORAGE_ACCOUNT=$STORAGE_ACCOUNT"
echo "    DEPLOY_AGENT_CONTAINER_NAME=$CONTAINER_NAME"
echo "    DEPLOY_AGENT_APP_DOMAIN=$APP_DOMAIN"
echo "    DEPLOY_AGENT_SWA_SLUG=$SWA_SLUG"
echo ""
echo "  DNS setup (manual — must be done by an admin):"
echo "    Create a CNAME record pointing '$APP_DOMAIN' to the default"
echo "    hostname of the SWA '$SWA_NAME'. Then configure the custom domain"
echo "    on the SWA in the Azure portal."
echo ""
echo "  Next steps:"
echo "    1. Source the env file:  source infra/.env"
echo "    2. Rebuild the plugin:  npm run build"
echo ""
echo "  Assign users:"
echo "    - Publishers: Assign 'app_publisher' role on '$DEPLOY_PLUGIN_APP_NAME' enterprise app"
echo ""
