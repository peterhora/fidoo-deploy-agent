# Deploy Agent

Claude Code plugin for deploying static HTML/JS apps to Azure Static Web Apps with Entra ID authentication.

## Prerequisites

- Node.js 22+
- An Azure subscription with a resource group for Static Web Apps
- An Azure DNS zone for custom domains
- Two Entra ID app registrations (see Azure Setup below)

## Install

```bash
npm install
npm run build
```

## Configure the Plugin

### 1. Azure Config Values

Edit `src/config.ts` and replace the placeholder values:

| Value | Description | Where to Find |
|-------|-------------|---------------|
| `tenantId` | Entra ID tenant | Azure Portal > Entra ID > Overview |
| `clientId` | "Deploy Plugin" app registration client ID | Azure Portal > App Registrations > Deploy Plugin > Application (client) ID |
| `subscriptionId` | Azure subscription hosting the SWAs | Azure Portal > Subscriptions |
| `resourceGroup` | Resource group for all deployed apps | Default: `rg-published-apps` |
| `dnsZone` | DNS zone for custom domains | Default: `env.fidoo.cloud` |
| `dnsResourceGroup` | Resource group containing the DNS zone | Azure Portal > DNS Zones > your zone > Resource group |

Rebuild after editing:

```bash
npm run build
```

### 2. Install as Claude Code Plugin

Add the plugin to your Claude Code settings (`~/.claude/settings.local.json`):

```json
{
  "plugins": [
    "/path/to/deploy_agent"
  ]
}
```

Claude Code will auto-discover `.claude-plugin/plugin.json` and `.mcp.json`.

## Azure Setup (One-Time, Admin)

### 1. Create Resource Group

```
Name: rg-published-apps
Region: West Europe (or your preference)
```

### 2. App Registration: "Deploy Plugin"

This is the OAuth client used by the plugin to authenticate users.

1. Azure Portal > Entra ID > App Registrations > New Registration
2. Name: `Deploy Plugin`
3. Supported account types: Single tenant
4. Redirect URI: leave empty (device code flow)
5. After creation:
   - **Authentication** > Allow public client flows > **Yes** (required for device code flow)
   - **API Permissions** > Add:
     - `Azure Service Management` > `user_impersonation`
   - **App Roles** > Create:
     - Display name: `App Publisher`
     - Value: `app_publisher`
     - Allowed member types: Users/Groups
6. Copy the **Application (client) ID** into `config.ts` as `clientId`

### 3. App Registration: "Published Apps"

Shared authentication provider for all deployed Static Web Apps.

1. Azure Portal > Entra ID > App Registrations > New Registration
2. Name: `Published Apps`
3. Supported account types: Single tenant
4. Redirect URI: `https://apps.env.fidoo.cloud/.auth/login/aad/callback` (Web)
5. After creation:
   - **App Roles** > Create:
     - Display name: `App Subscriber`
     - Value: `app_subscriber`
     - Allowed member types: Users/Groups

### 4. RBAC: Grant Deploy Plugin Access

Assign a custom role (or `Contributor`) scoped to the resource group:

- Scope: `rg-published-apps`
- Assignee: Users/groups with the `app_publisher` role
- Required actions:
  - `Microsoft.Web/staticSites/*`
  - `Microsoft.Network/dnsZones/CNAME/*` (on the DNS zone resource group)

### 5. Assign Users

- **Publishers** (can deploy): Assign `app_publisher` role on the "Deploy Plugin" app
- **Subscribers** (can view apps): Assign `app_subscriber` role on the "Published Apps" app

## Development

```bash
npm run dev     # Watch mode (recompile on change)
npm run build   # One-time compile
npm test        # Run tests
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `auth_status` | Check if user has a valid Azure token |
| `auth_login` | Start device code flow (returns URL + code) |
| `auth_poll` | Poll for token after browser login |
| `app_deploy` | Deploy a static app (first deploy or update) |
| `app_delete` | Remove an app + DNS record |
| `app_list` | List all deployed apps |
| `app_info` | Get app details (URL, status, metadata) |
| `app_update_info` | Change app name/description without redeploying |
| `dashboard_rebuild` | Force-regenerate the app dashboard |
