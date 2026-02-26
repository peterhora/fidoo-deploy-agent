# Deploy Agent Plugin — Design Document

Date: 2026-02-26

## Problem

Non-technical business users vibe-code static HTML/JS apps using Claude Code and Claude Cowork. They need a dead-simple way to deploy these apps to Azure, protected by Entra ID, without knowing anything about git, Azure CLI, or cloud infrastructure.

## Constraints

- Static apps only (HTML/JS, no backend, no database)
- Azure infrastructure (subscription exists)
- No Azure CLI or tooling assumed on user machines
- Entra ID authentication with two roles: `app_publisher` (can deploy), `app_subscriber` (can use apps)
- Minimal/zero 3rd-party npm dependencies (security concern)
- Centralized plugin distribution, bundled MCP
- Must work in both Claude Code and Claude Cowork
- Custom domains under `*.env.fidoo.cloud` (DNS zone exists)
- 10-50 apps expected

## Approach

Bundled MCP server with raw Azure REST API calls. Zero npm dependencies — uses Node.js built-in `fetch` for all HTTP. OAuth2 device code flow for authentication (no MSAL library).

### Alternatives Considered

**Backend deployment service (Azure Function):** Would simplify the plugin but adds infrastructure to maintain. Rejected — unnecessary operational overhead for 10-50 apps.

**Azure SDK dependencies (`@azure/identity`, `@azure/arm-appservice`):** More robust auth/API handling but introduces ~10-20 npm packages. Rejected — conflicts with zero-dependency security requirement.

## Architecture

```
┌─────────────────────────────────────────────┐
│  Claude Code / Cowork                       │
│  ┌───────────────┐  ┌────────────────────┐  │
│  │  deploy.md    │  │  MCP Server (TS)   │  │
│  │  (skill)      │──│  Node.js runtime   │  │
│  │  orchestrates │  │  zero npm deps     │  │
│  │  the UX       │  │  raw Azure REST    │  │
│  └───────────────┘  └────────┬───────────┘  │
└──────────────────────────────┼──────────────┘
                               │ HTTPS (fetch)
                               ▼
┌──────────────────────────────────────────────┐
│  Azure                                       │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐  │
│  │ Entra ID │  │ ARM API   │  │ Azure DNS │  │
│  │ (auth)   │  │ (manage   │  │ (CNAME    │  │
│  │          │  │  SWAs)    │  │  records) │  │
│  └──────────┘  └─────┬─────┘  └───────────┘  │
│                       ▼                      │
│  ┌─────────────────────────────────────────┐ │
│  │         Static Web Apps                 │ │
│  │  apps.env.fidoo.cloud  (dashboard)      │ │
│  │  myapp.env.fidoo.cloud (user app)       │ │
│  │  other.env.fidoo.cloud (user app)       │ │
│  │  All protected by Entra ID              │ │
│  └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

## Tech Stack

| Component        | Choice                | Rationale                                      |
|------------------|-----------------------|------------------------------------------------|
| Runtime          | Node.js               | Guaranteed by Claude Code installation          |
| Language         | TypeScript            | Natural for MCP servers in Claude Code ecosystem|
| npm dependencies | Zero                  | `fetch`, `fs`, `crypto` from Node.js built-ins  |
| Azure hosting    | Static Web Apps (Free)| Built-in Entra ID auth, custom domains, free SSL|
| Auth mechanism   | OAuth2 device code    | No CLI needed, browser-based, user-friendly     |
| Plugin format    | Skill + bundled MCP   | Works in Code + Cowork, centrally distributable  |

## User Experience

### First Deploy

```
User: "Deploy my app"

Plugin: "What should we call this app?"
User:   "Expense Tracker"

Plugin: "Short description for the app dashboard?"
User:   "Submit and approve team expenses"

Plugin: "Open https://microsoft.com/devicelogin and enter code ABCD1234"
        (user completes browser login)

Plugin: → Creates Static Web App "expense-tracker" in rg-published-apps
        → Tags resource with name + description
        → ZIPs local folder and uploads
        → Adds CNAME: expense-tracker.env.fidoo.cloud
        → Configures Entra ID auth
        → Regenerates dashboard from all resource tags
        → Re-deploys dashboard

        "Deployed! https://expense-tracker.env.fidoo.cloud
         Dashboard updated: https://apps.env.fidoo.cloud"
```

### Re-Deploy (same folder)

```
User: "Deploy my app"

Plugin: → Reads .deploy.json (slug, name, description already stored)
        → ZIPs and uploads (no questions asked)
        → Regenerates + re-deploys dashboard (in case deploy timestamp changed)

        "Updated! https://expense-tracker.env.fidoo.cloud"
```

### Update App Info

```
User: "Change the app description to 'Expense management for all teams'"

Plugin: → Updates .deploy.json
        → Updates Azure resource tags
        → Regenerates + re-deploys dashboard
        (does NOT re-deploy the app itself)

        "App info updated on dashboard."
```

## Local Config: .deploy.json

Stored in the app's project folder. Created on first deploy, read silently on re-deploys.

```json
{
  "appSlug": "expense-tracker",
  "appName": "Expense Tracker",
  "appDescription": "Submit and approve team expenses",
  "resourceId": "/subscriptions/<sub-id>/resourceGroups/rg-published-apps/providers/Microsoft.Web/staticSites/expense-tracker"
}
```

- `appSlug` is set once and never changes (it's the URL identity)
- `appName` and `appDescription` are display metadata, updatable via `app_update_info`
- One folder = one app

## App Dashboard

A static HTML/JS app deployed at `apps.env.fidoo.cloud`. Renders a list of all published apps with name, description, URL, and last deploy time.

**Source of truth:** Azure resource tags on each Static Web App in `rg-published-apps`.

**How it stays current:** On every deploy or delete, the plugin:
1. Queries ARM API for all Static Web Apps in the resource group
2. Reads their tags (name, description, slug)
3. Generates `apps.json` manifest
4. Re-deploys the dashboard with the updated manifest

**Dashboard itself is protected** by the same Entra ID `app_subscriber` role.

```json
// apps.json
[
  {
    "slug": "expense-tracker",
    "name": "Expense Tracker",
    "description": "Submit and approve team expenses",
    "url": "https://expense-tracker.env.fidoo.cloud",
    "deployedAt": "2026-02-26T14:30:00Z"
  }
]
```

## MCP Server Tools

| Tool              | Purpose                                                                 |
|-------------------|-------------------------------------------------------------------------|
| `auth_status`     | Check if user has a valid Azure token                                   |
| `auth_login`      | Start device code flow, return code + URL                               |
| `auth_poll`       | Poll for token after user completes browser login                       |
| `app_deploy`      | First deploy: requires name + description. Re-deploy: reads .deploy.json. ZIPs folder, creates/updates SWA, configures DNS + auth, regenerates dashboard. |
| `app_delete`      | Remove a deployed app + CNAME record, regenerates dashboard             |
| `app_list`        | List all deployed apps in the resource group                            |
| `app_info`        | Get URL, status, name, description, last deploy time for an app         |
| `app_update_info` | Change app name and/or description. Updates .deploy.json, resource tags, and dashboard. Does NOT re-deploy the app. |
| `dashboard_rebuild` | Force-regenerate the dashboard from current resource tags (admin recovery) |

## Backend Infrastructure (Admin One-Time Setup)

1. **Entra ID App Registration: "Deploy Plugin"**
   - Public client (no secret) with device code flow enabled
   - API permissions: Azure Resource Manager, Azure DNS zone management
   - App role: `app_publisher`
   - Config values to distribute: tenant ID, client ID

2. **Entra ID App Registration: "Published Apps"**
   - Shared authentication provider for all deployed Static Web Apps
   - App role: `app_subscriber`

3. **Resource Group: `rg-published-apps`**
   - Contains all Static Web App resources including the dashboard

4. **DNS Zone: `env.fidoo.cloud`**
   - Already exists — plugin adds per-app CNAME records

## Security Model

- Plugin auth: user must have `app_publisher` Entra ID role to deploy
- App access: users must have `app_subscriber` Entra ID role to view any app
- Token storage: access + refresh tokens cached locally in OS-appropriate location
- No secrets in plugin: tenant ID and client ID are public OAuth client values
- Zero npm dependencies: nothing to audit in the supply chain
- Static Web Apps auth handled by Azure — no custom auth code in deployed apps

## Security Review

### Token Storage

**Risk:** Access and refresh tokens cached locally. If stored as plaintext files, any process or malware on the user's machine can steal them and impersonate the user against Azure.

**Mitigation:** Store tokens in OS keychain (macOS Keychain, Windows Credential Manager) or at minimum in a user-readable-only file (`0600` permissions). Document the chosen approach. Consider encrypting tokens at rest with a machine-derived key.

### Deployment Content — Accidental Secret Leakage

**Risk:** Users vibe-coding apps may have `.env` files, API keys, credentials, or private data in their project folder. The ZIP upload sends the entire folder to a publicly-accessible (auth-gated) Static Web App.

**Mitigation:** The `app_deploy` tool must exclude sensitive files by default (`.env`, `.git/`, `node_modules/`, `.deploy.json`, `.claude/`). Maintain a hardcoded deny-list. Warn users if the folder contains files matching known secret patterns before uploading.

### Slug Squatting and Naming Collisions

**Risk:** Any user with `app_publisher` can claim any slug (e.g., `hr-portal`, `finance-dashboard`), blocking others or creating confusion. A malicious publisher could deploy a phishing page under a trusted-looking subdomain.

**Mitigation:** Consider a slug reservation or naming convention (e.g., prefix with team or user). At minimum, `app_deploy` should check if the slug already exists and refuse to overwrite another user's app. Resource tags should record the deploying user's identity.

### No Deployment Audit Trail

**Risk:** No record of who deployed what and when, beyond Azure activity logs (which require admin access to review). If a malicious or broken app is deployed, tracing it back is difficult for non-admins.

**Mitigation:** Tag each Static Web App resource with `deployedBy` (user's Entra ID email/UPN extracted from the token). Consider logging deploys to a lightweight audit mechanism (e.g., an `audit.json` in the dashboard, or Azure resource tags with timestamps).

### Device Code Flow Phishing

**Risk:** OAuth2 device code flow is inherently phishable — an attacker could present a victim with a device code and trick them into authenticating it. The attacker then receives the victim's token.

**Mitigation:** This is a known limitation of device code flow and acceptable given the constraint (no CLI tooling). Mitigate by: (1) displaying the full scope of permissions being granted in the skill UX, (2) setting short device code expiry in the Entra ID app registration, (3) enabling Conditional Access policies (MFA, compliant device) on the tenant.

### Cross-App XSS Isolation

**Risk:** Vibe-coded apps are unlikely to follow security best practices. A vulnerable app at `app-a.env.fidoo.cloud` could have XSS. While different subdomains provide origin isolation, cookies set on `.env.fidoo.cloud` (parent domain) could leak across apps.

**Mitigation:** Ensure Static Web Apps auth cookies are scoped to the specific subdomain, not the parent domain. SWA's built-in auth handles this correctly by default. Add a note in the design that deployed apps must not set cookies on the parent domain. Consider adding security headers (`Content-Security-Policy`, `X-Frame-Options`) via SWA configuration.

### Resource Group Blast Radius

**Risk:** All apps share `rg-published-apps`. Any user with `app_publisher` role has ARM-level write access to the resource group, meaning they could theoretically modify or delete other users' apps via the Azure portal or direct API calls (outside the plugin).

**Mitigation:** Scope the Entra ID app registration's permissions as narrowly as possible — ideally to `Microsoft.Web/staticSites/*` actions only via a custom RBAC role, not broad `Contributor` on the resource group. This limits damage even if a token is compromised.

### Plugin Distribution Integrity

**Risk:** The plugin is centrally distributed. If the distribution channel is compromised, a tampered plugin could exfiltrate tokens, inject malicious code into deployments, or deploy backdoored apps.

**Mitigation:** Distribute via a trusted internal channel (e.g., private npm registry, internal git repo). Pin plugin versions. Consider signing plugin releases or providing checksums for verification.

### Dashboard as Attack Surface

**Risk:** The dashboard renders `apps.json` which contains user-supplied `appName` and `appDescription`. If these aren't sanitized, XSS is possible in the dashboard itself.

**Mitigation:** The dashboard must treat all values from `apps.json` as untrusted input. Use `textContent` (not `innerHTML`) when rendering app names and descriptions. Apply a strict CSP header on the dashboard.

### Summary of Required Actions

| Item | Priority | Phase |
|------|----------|-------|
| File exclusion deny-list in `app_deploy` | **High** | Build |
| Token storage in OS keychain or protected file | **High** | Build |
| Narrow RBAC scope for app registration | **High** | Admin setup |
| `deployedBy` tag on resources | **Medium** | Build |
| Slug collision check before deploy | **Medium** | Build |
| Dashboard XSS prevention (textContent, CSP) | **Medium** | Build |
| Short device code expiry + Conditional Access | **Medium** | Admin setup |
| Plugin distribution signing/checksums | **Low** | Distribution |
| Security headers on deployed SWAs | **Low** | Build |

## Out of Scope

- Per-app access control (all subscribers see all apps)
- Backend/API/database support (static files only)
- Git/Bitbucket integration
- App versioning or rollback UI (deploy always overwrites)
