# Continuation Prompt

Paste this to start the next session:

---

Execute the plan at docs/plans/2026-02-26-deploy-agent-implementation.md — start with Batch 6 (App Management Tools).

## Context from previous session

Batches 1–5 are complete. The project has:

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
- **Wired tools**:
  - `app_deploy` — first deploy (create SWA/DNS/auth/tags/.deploy.json/dashboard) + re-deploy (.deploy.json → ZIP → deploy → update tags → dashboard)
  - `dashboard_rebuild` — auth check → `deployDashboard(token)` → success JSON
- **4 remaining tool stubs** in `src/tools/` — `app_list`, `app_info`, `app_delete`, `app_update_info` (all return "Not implemented yet")
- **Shared test helper** at `test/helpers/mock-fetch.ts` — installMockFetch/restoreFetch/mockFetch/mockFetchOnce/getFetchCalls
- **Config** at `src/config.ts` — Azure tenant/client/subscription/resource group/DNS values (client ID still placeholder)
- **157 passing tests** — protocol, server, device-code, token-store, auth tools, tool registry, rest-client, static-web-apps (incl. deploySwaZip), dns, deny-list, zip, deploy-json, dashboard, app-deploy, dashboard-rebuild

Key structural decisions:
- `tsconfig.json` rootDir is `.` so compiled output mirrors source: `dist/src/`, `dist/test/`
- Test runner: `node --test --test-force-exit` with two glob patterns. Use `node --test` (no force-exit) for full verification.
- Zero npm runtime deps, devDeps only: typescript + @types/node
- ESM modules (`"type": "module"` in package.json, `NodeNext` module resolution)
- Node.js 22+ required (for `zlib.crc32`)
- Token store dir overridable via `DEPLOY_AGENT_TOKEN_DIR` env var (used in tool tests)

Batch 6 tasks: Wire `app_list` + `app_info` (TDD), wire `app_delete` (TDD — delete SWA + CNAME + rebuild dashboard), wire `app_update_info` (TDD — update tags + .deploy.json + rebuild dashboard). Reuse `test/helpers/mock-fetch.ts` for Azure API mocking. Follow same patterns as app_deploy and dashboard_rebuild handlers.
