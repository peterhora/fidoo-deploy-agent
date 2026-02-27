# Deploy Agent

Claude Code plugin for deploying static HTML/JS apps to Azure Static Web Apps with Entra ID authentication.

## Install

```bash
/plugin marketplace add peterhora/fidoo-deploy-agent
/plugin install deploy-agent@fidoo-deploy
```

That's it. The `dist/` folder is shipped in the repo, so no build step is needed. Claude Code auto-discovers the plugin manifest and MCP server.

## Azure Requirements

### For publishers (deploy apps)

1. **A Fidoo FX Test tenant account** (`@FidooFXtest.onmicrosoft.com`)
2. **Membership in the `fi-aiapps-pub` security group** — an admin adds you with:

```bash
az ad group member add --group fi-aiapps-pub --member-id <user-object-id>
```

The group has the required Azure RBAC roles (Storage Blob Data Contributor on storage, Contributor on SWA).

### For viewers (browse apps)

Any tenant member can view deployed apps — just log in with Entra ID when prompted. No group membership needed.

### For admins (one-time setup)

The infrastructure is already provisioned. To re-run or set up in a new tenant:

```bash
az login
./infra/setup.sh
```

The script is idempotent and creates: resource group `rg-published-apps`, app registration "Deploy Plugin" (with API permissions for Azure Service Management and Azure Storage), storage account `stpublishedapps` with `app-content` container, Static Web App `swa-ai-apps`, RBAC assignments, and grants admin consent for all API permissions.

**Note:** The admin consent step (`az ad app permission admin-consent`) requires Global Administrator or Privileged Role Administrator. If it fails, grant consent manually in the Azure Portal: **Entra ID** > **App registrations** > **Deploy Plugin** > **API permissions** > **Grant admin consent**. Both Azure Service Management and Azure Storage `user_impersonation` permissions must be consented.

DNS: CNAME `ai-apps.env.fidoo.cloud` pointing to the SWA default hostname, then add the custom domain to the SWA.

### Onboarding a new publisher

```bash
# Get the user's object ID
az ad user show --id user@FidooFXtest.onmicrosoft.com --query id -o tsv

# Add them to the publisher group
az ad group member add --group fi-aiapps-pub --member-id <user-object-id>
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `auth_status` | Check if user has a valid Azure token |
| `auth_login` | Start device code flow (returns URL + code) |
| `auth_poll` | Poll for token after browser login |
| `app_deploy` | Deploy a static app (first deploy or update) |
| `app_delete` | Remove an app and redeploy site |
| `app_list` | List all deployed apps |
| `app_info` | Get app details (URL, metadata) |
| `app_update_info` | Change app name/description without redeploying code |

## Development

```bash
npm install        # Install devDependencies (typescript, @types/node)
npm run build      # Compile TypeScript to dist/
npm run dev        # Watch mode
npm test           # Run tests (requires build first)
```
