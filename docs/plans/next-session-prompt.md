# Continuation Prompt

Paste this to start the next session:

---

Execute the plan at docs/plans/2026-02-26-deploy-agent-implementation.md — start with Batch 7 (Deploy Skill + Integration Tests).

## Context from previous session

Batches 1–6 are complete. All 9 MCP tools are fully wired and tested. The project has:

- **Working MCP server** at `src/server.ts` — handles `initialize`, `tools/list`, `tools/call` over JSON-RPC 2.0 stdio
- **Protocol layer** at `src/protocol.ts` — parses/formats JSON-RPC messages, creates stdio transport
- **Auth module** at `src/auth/`:
  - `device-code.ts` — `startDeviceCodeFlow`, `pollForToken`, `refreshAccessToken`
  - `token-store.ts` — file-based storage (`~/.deploy-agent/tokens.json`, mode 0600), `DEPLOY_AGENT_TOKEN_DIR` env var for test override
- **3 wired auth tools**: `auth-status`, `auth-login`, `auth-poll`
- **Azure REST client** at `src/azure/rest-client.ts` — `azureFetch(path, {token, method?, body?, apiVersion?})`. Prepends ARM base URL, adds Bearer header, appends api-version, handles 204 (returns null), throws `AzureError` with `.status` and `.code` on non-2xx.
- **Static Web Apps API** at `src/azure/static-web-apps.ts` — `createStaticWebApp`, `getStaticWebApp`, `deleteStaticWebApp`, `listStaticWebApps`, `getDeploymentToken`, `updateTags`, `configureAuth`, `deploySwaZip`
- **DNS API** at `src/azure/dns.ts` — `createCnameRecord`, `deleteCnameRecord`, `getCnameRecord`
- **Deploy modules** at `src/deploy/`:
  - `deny-list.ts` — `DENIED_PATTERNS` (8 patterns), `shouldExclude(path)`, `collectFiles(rootDir)`
  - `zip.ts` — `createZipBuffer(rootDir, files)` — manual ZIP format with deflateRawSync
  - `deploy-json.ts` — `DeployConfig` interface, `readDeployConfig(dir)`, `writeDeployConfig(dir, config)`, `generateSlug(appName)`
  - `dashboard.ts` — `buildAppsJson(token)`, `generateDashboardHtml(apps)`, `deployDashboard(token)` — generates HTML dashboard with CSP + textContent, deploys via ZIP to dashboard SWA
- **All 9 tools wired**:
  - `app_deploy` — first deploy (create SWA/DNS/auth/tags/.deploy.json/dashboard) + re-deploy (.deploy.json → ZIP → deploy → update tags → dashboard)
  - `app_list` — auth check → `listStaticWebApps` → filter out dashboard → sorted list with slug/name/description/url/deployedAt
  - `app_info` — auth check → `getStaticWebApp` → return details from tags, handles 404
  - `app_delete` — auth check → prevents dashboard deletion → `deleteStaticWebApp` + `deleteCnameRecord` + `deployDashboard`
  - `app_update_info` — auth check → verifies app exists → `updateTags` (only provided fields) + `deployDashboard`, no redeploy
  - `dashboard_rebuild` — auth check → `deployDashboard(token)` → success JSON
- **Shared test helper** at `test/helpers/mock-fetch.ts` — installMockFetch/restoreFetch/mockFetch/mockFetchOnce/getFetchCalls
- **Config** at `src/config.ts` — Azure tenant/client/subscription/resource group/DNS values (client ID still placeholder)
- **CLAUDE.md** — project guidance file for Claude Code
- **182 passing tests** — protocol, server, device-code, token-store, auth tools, tool registry, rest-client, static-web-apps, dns, deny-list, zip, deploy-json, dashboard, app-deploy, dashboard-rebuild, app-list, app-info, app-delete, app-update-info

Batch 7 tasks:
1. **Deploy skill** (`skills/deploy/SKILL.md`) — skill description triggers on "deploy my app", "publish", "delete my app", "list apps", etc. Orchestrates auth flow → first deploy vs re-deploy → app management. References all 9 MCP tools with usage guidance.
2. **Security hardening** — verify deny-list completeness, slug collision check, `deployedBy` tag (extract UPN from JWT), dashboard XSS prevention.
3. **End-to-end integration tests** — full deploy flow simulation with mocked Azure APIs, MCP protocol flow test (pipe JSON-RPC to server process).
