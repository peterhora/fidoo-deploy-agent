# Single-Domain Path-Based Routing Design

**Date:** 2026-02-27
**Status:** Approved

## Problem

The current architecture creates a separate Azure Static Web App and DNS CNAME record per deployed app (`{slug}.env.fidoo.cloud`). This:

1. **Requires DNS zone write access** — dangerous to grant to automated tooling
2. **Creates one Azure resource per app** — wasteful for small static sites
3. **Custom domains don't actually work** — no TLS cert provisioning or domain binding on the SWA side, only a DNS-level CNAME

## Solution

One SWA. One domain. One blob store. Path-based routing.

- Single Azure Static Web App at a fixed, pre-configured domain: `ai-apps.env.fidoo.cloud`
- Each app lives at `/{slug}/` (e.g., `/my-calculator/`, `/expense-report/`)
- Dashboard at the root `/` lists all apps
- Azure Blob Storage is the source of truth for all app content
- `registry.json` at the SWA root tracks app metadata
- DNS is set up once by an admin — the agent never touches DNS

## Deploy Flow

```
User deploys "my-app" from folder ./my-app/
    │
    ├── 1. collectFiles(./my-app/) + createZipBuffer()
    │
    ├── 2. Upload app files to Blob Storage under /my-app/*
    │
    ├── 3. Download registry.json from Blob (or create empty)
    │      Update entry for "my-app" (name, description, deployedAt, deployedBy)
    │      Upload updated registry.json to Blob
    │
    ├── 4. Download ALL app folders from Blob Storage
    │      + Generate dashboard index.html from registry.json
    │      + Place registry.json at root
    │      + Assemble full site tree:
    │          /index.html          (dashboard)
    │          /registry.json       (app metadata)
    │          /my-app/index.html   (app files)
    │          /my-app/style.css
    │          /other-app/...       (other apps from blob)
    │
    ├── 5. ZIP everything → deploySwaZip(token, swaSlug, zip)
    │
    └── 6. Return { url: "https://ai-apps.env.fidoo.cloud/my-app/" }
```

All temporary downloaded content is cleaned up in a `finally` block after deploy.

## Delete Flow

1. Delete app folder from Blob Storage
2. Remove entry from registry.json in Blob
3. Re-download all remaining apps from Blob
4. Regenerate dashboard, assemble full site, ZIP, re-deploy SWA

## Re-deploy Flow

Same as first deploy — step 2 overwrites existing blobs for the slug, then full site is re-assembled and re-deployed.

## App Registry

`registry.json` stored in Blob Storage (and deployed to SWA root):

```json
{
  "apps": [
    {
      "slug": "my-app",
      "name": "My App",
      "description": "A calculator app",
      "deployedAt": "2026-02-27T10:00:00Z",
      "deployedBy": "user@fidoo.cloud"
    }
  ]
}
```

Replaces Azure resource tags as the metadata store. Updated atomically on each deploy/delete/update-info operation.

## Dashboard

Lives at the root of the single SWA (`/index.html`). Generated from `registry.json`. Each app card links to `/{slug}/`. No longer a separate SWA resource.

## Authentication

Entra ID auth configured once on the single SWA. All apps inherit the same auth policy. No per-app auth configuration needed.

## What Changes vs. Current Architecture

| Aspect | Before | After |
|--------|--------|-------|
| SWA resources | One per app | One total |
| DNS records | One CNAME per app | One pre-configured CNAME |
| DNS write access | Required | Not needed |
| URL pattern | `https://{slug}.env.fidoo.cloud` | `https://ai-apps.env.fidoo.cloud/{slug}/` |
| App metadata | Azure resource tags | `registry.json` in Blob |
| Dashboard | Separate SWA (slug: `apps`) | Root of the single SWA |
| Auth | Configured per SWA | Configured once |
| Content store | None (deploy-and-forget) | Azure Blob Storage |

## Code Removed

- `src/azure/dns.ts` — no DNS operations
- Per-app `createStaticWebApp` calls
- Per-app `configureAuth` calls
- Azure resource tag read/write for metadata
- Dashboard as separate SWA (`dashboardSlug`)

## Code Added

- `src/azure/blob.ts` — Blob Storage REST client (upload, download, delete, list blobs)
- `src/deploy/registry.ts` — registry.json CRUD operations
- Site assembly logic — download all from blob, merge with new app, generate dashboard, ZIP

## Code Modified

- `src/tools/app-deploy.ts` — new deploy flow (blob upload → assemble → deploy)
- `src/tools/app-delete.ts` — delete from blob, remove from registry, re-deploy
- `src/tools/app-list.ts` — read from registry.json instead of Azure resource tags
- `src/tools/app-info.ts` — read from registry.json
- `src/tools/app-update-info.ts` — update registry.json
- `src/deploy/dashboard.ts` — generate from registry.json, output to root of site
- `src/config.ts` — new config values, remove DNS config

## New Configuration

| Env Var | Default | Purpose |
|---------|---------|---------|
| `DEPLOY_AGENT_STORAGE_ACCOUNT` | (required) | Azure Storage account name |
| `DEPLOY_AGENT_CONTAINER_NAME` | `app-content` | Blob container for app files |
| `DEPLOY_AGENT_APP_DOMAIN` | `ai-apps.env.fidoo.cloud` | Fixed domain for all apps |
| `DEPLOY_AGENT_SWA_SLUG` | `ai-apps` | The single SWA resource name |

Removed:
- `DEPLOY_AGENT_DNS_ZONE`
- `DEPLOY_AGENT_DNS_RESOURCE_GROUP`

## Infrastructure Prerequisites

Set up once by admin (via updated `infra/setup.sh`):

1. **Azure Storage Account** with a blob container (`app-content`)
2. **Single SWA** resource (`ai-apps` slug)
3. **DNS CNAME** — `ai-apps.env.fidoo.cloud` → SWA's `defaultHostname`
4. **Custom domain binding** on the SWA — registered via ARM so TLS works
5. **Entra ID auth** configured on the SWA

## Temp File Cleanup

Every deploy/delete operation:
1. Creates a temp dir via `os.tmpdir()` + unique suffix
2. Downloads blob content into it
3. Assembles site, ZIPs, deploys
4. Removes the entire temp dir in a `finally` block

No local state persists between operations.
