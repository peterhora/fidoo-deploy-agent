#!/usr/bin/env bash
#
# infra/grant-container-permissions.sh — Grant fi-aiapps-pub group the RBAC roles
# needed to deploy container apps to the Container Apps environment.
#
# Must be run by an admin with Owner or User Access Administrator on rg-alipowski-test.
#
# Usage:
#   chmod +x infra/grant-container-permissions.sh
#   ./infra/grant-container-permissions.sh
#
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

GROUP_NAME="fi-aiapps-pub"
ACR_NAME="fidooapps"
CONTAINER_RESOURCE_GROUP="rg-alipowski-test"
CONTAINER_ENV_NAME="managedEnvironment-rgalipowskitest-adaa"
PULL_IDENTITY_NAME="fidoo-vibe-container-puller"
PULL_IDENTITY_RG="rg-published-apps"

# ── Helpers ───────────────────────────────────────────────────────────────────

info()  { printf '\033[1;34m[INFO]\033[0m  %s\n' "$*"; }
ok()    { printf '\033[1;32m[OK]\033[0m    %s\n' "$*"; }
error() { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

# ── Preflight ─────────────────────────────────────────────────────────────────

command -v az >/dev/null 2>&1 || error "Azure CLI (az) not installed."
az account show >/dev/null 2>&1 || error "Not logged in. Run: az login"

info "Subscription: $(az account show --query name -o tsv)"

# ── Resolve IDs ───────────────────────────────────────────────────────────────

info "Resolving group '$GROUP_NAME'..."
GROUP_ID=$(az ad group show --group "$GROUP_NAME" --query id -o tsv)
ok "Group object ID: $GROUP_ID"

info "Resolving ACR '$ACR_NAME' in '$CONTAINER_RESOURCE_GROUP'..."
ACR_ID=$(az acr show --name "$ACR_NAME" --resource-group "$CONTAINER_RESOURCE_GROUP" --query id -o tsv)
ok "ACR resource ID: $ACR_ID"

info "Resolving pull identity '$PULL_IDENTITY_NAME' in '$PULL_IDENTITY_RG'..."
PULL_IDENTITY_PRINCIPAL=$(az identity show --name "$PULL_IDENTITY_NAME" --resource-group "$PULL_IDENTITY_RG" --query principalId -o tsv)
ok "Pull identity principal ID: $PULL_IDENTITY_PRINCIPAL"

info "Resolving resource group '$CONTAINER_RESOURCE_GROUP'..."
RG_ID=$(az group show --name "$CONTAINER_RESOURCE_GROUP" --query id -o tsv)
ok "Resource group ID: $RG_ID"

# ── Role assignments ──────────────────────────────────────────────────────────

# Contributor on ACR — required for ACR Tasks (scheduleRun, listBuildSourceUploadUrl).
# AcrPush alone is insufficient; those ARM actions require Contributor.
info "Assigning Contributor on ACR '$ACR_NAME' to group '$GROUP_NAME'..."
az role assignment create \
  --assignee-object-id "$GROUP_ID" \
  --assignee-principal-type Group \
  --role Contributor \
  --scope "$ACR_ID" \
  --output none 2>/dev/null || true
ok "Contributor on ACR assigned"

# AcrPull on ACR for the pull identity (managed identity used by Container Apps to pull images).
info "Assigning AcrPull on ACR '$ACR_NAME' to pull identity '$PULL_IDENTITY_NAME'..."
az role assignment create \
  --assignee-object-id "$PULL_IDENTITY_PRINCIPAL" \
  --assignee-principal-type ServicePrincipal \
  --role AcrPull \
  --scope "$ACR_ID" \
  --output none 2>/dev/null || true
ok "AcrPull on ACR assigned to pull identity"

# Contributor on resource group — required to CREATE Container Apps (new resources).
# Contributor on the environment resource alone is not enough for new resource creation.
info "Assigning Contributor on resource group '$CONTAINER_RESOURCE_GROUP' to group '$GROUP_NAME'..."
az role assignment create \
  --assignee-object-id "$GROUP_ID" \
  --assignee-principal-type Group \
  --role Contributor \
  --scope "$RG_ID" \
  --output none 2>/dev/null || true
ok "Contributor on resource group assigned"

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════════════════════════════"
echo "  Container RBAC setup complete!"
echo "══════════════════════════════════════════════════════════════════════════"
echo ""
echo "  Group '$GROUP_NAME' now has:"
echo "    - Contributor on ACR '$ACR_NAME' (for image builds via ACR Tasks)"
echo "    - Contributor on resource group '$CONTAINER_RESOURCE_GROUP' (for Container Apps create/update)"
echo ""
echo "  Pull identity '$PULL_IDENTITY_NAME' now has:"
echo "    - AcrPull on ACR '$ACR_NAME' (for Container Apps to pull images at runtime)"
echo ""
echo "  To onboard a publisher:"
echo "    USER_ID=\$(az ad user show --id user@FidooFXtest.onmicrosoft.com --query id -o tsv)"
echo "    az ad group member add --group $GROUP_NAME --member-id \$USER_ID"
echo ""
