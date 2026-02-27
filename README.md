# Deploy Agent

Claude Code plugin for deploying static HTML/JS apps to Azure Static Web Apps with Entra ID authentication.

## Install

```bash
claude plugin add <repo-url>
```

That's it. The `dist/` folder is shipped in the repo, so no build step is needed. Claude Code auto-discovers the plugin manifest and MCP server.

## Azure Requirements

### For end users (publishers)

Each user who deploys apps needs:

1. **A Fidoo FX Test tenant account** (`@FidooFXtest.onmicrosoft.com`)
2. **Azure RBAC roles** assigned by an admin on the relevant resources:

| Role | Scope | Why |
|------|-------|-----|
| **Storage Blob Data Contributor** | Storage account `stpublishedapps` | Read/write/delete app files and registry in blob storage |
| **Contributor** on the SWA | Static Web App `swa-ai-apps` | Read SWA properties, list deployment secrets, deploy ZIP |

3. *(Optional)* **app_publisher** app role on the "Deploy Plugin" enterprise app — for future role-based access control within the plugin.

### For admins (one-time setup)

The infrastructure is already provisioned. To re-run or set up in a new tenant:

```bash
az login
./infra/setup.sh
```

The script is idempotent and creates: resource group `rg-published-apps`, app registration "Deploy Plugin", storage account `stpublishedapps` with `app-content` container, Static Web App `swa-ai-apps`, and RBAC assignments.

DNS: CNAME `ai-apps.env.fidoo.cloud` pointing to the SWA default hostname, then add the custom domain to the SWA.

### Granting access to a new user

```bash
# Storage Blob Data Contributor on the storage account
az role assignment create \
  --assignee user@FidooFXtest.onmicrosoft.com \
  --role "Storage Blob Data Contributor" \
  --scope "/subscriptions/910c52ef-044b-4bd1-b5e9-84700289fca7/resourceGroups/rg-published-apps/providers/Microsoft.Storage/storageAccounts/stpublishedapps"

# Contributor on the SWA
az role assignment create \
  --assignee user@FidooFXtest.onmicrosoft.com \
  --role "Contributor" \
  --scope "/subscriptions/910c52ef-044b-4bd1-b5e9-84700289fca7/resourceGroups/rg-published-apps/providers/Microsoft.Web/staticSites/swa-ai-apps"
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
