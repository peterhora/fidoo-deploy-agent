# Continuation Prompt

Paste this to start the next session:

---

Execute the plan at docs/plans/2026-02-26-deploy-agent-implementation.md — start with Batch 9 (Windows Support + CI).

## Context from previous session

Batches 1–8 are complete. All 9 MCP tools are fully wired and tested. The project has:

- **Working MCP server** at `src/server.ts` — handles `initialize`, `tools/list`, `tools/call` over JSON-RPC 2.0 stdio
- **Protocol layer** at `src/protocol.ts` — parses/formats JSON-RPC messages, creates stdio transport
- **Auth module** at `src/auth/`:
  - `device-code.ts` — `startDeviceCodeFlow`, `pollForToken`, `refreshAccessToken`
  - `token-store.ts` — file-based storage (`~/.deploy-agent/tokens.json`, mode 0600), `DEPLOY_AGENT_TOKEN_DIR` env var for test override
  - `jwt.ts` — `extractUpn(token)` — extracts UPN from JWT for `deployedBy` audit tag
- **3 wired auth tools**: `auth-status`, `auth-login`, `auth-poll`
- **Azure REST client** at `src/azure/rest-client.ts` — `azureFetch(path, {token, method?, body?, apiVersion?})`. Prepends ARM base URL, adds Bearer header, appends api-version, handles 204 (returns null), throws `AzureError` with `.status` and `.code` on non-2xx.
- **Static Web Apps API** at `src/azure/static-web-apps.ts` — `createStaticWebApp`, `getStaticWebApp`, `deleteStaticWebApp`, `listStaticWebApps`, `getDeploymentToken`, `updateTags`, `configureAuth`, `deploySwaZip`
- **DNS API** at `src/azure/dns.ts` — `createCnameRecord`, `deleteCnameRecord`, `getCnameRecord`
- **Deploy modules** at `src/deploy/`:
  - `deny-list.ts` — `DENIED_PATTERNS` (14 patterns including .env, .git, node_modules, .claude, *.pem, *.key, *.pfx, *.p12, .npmrc, id_rsa, id_ed25519, id_ecdsa), `shouldExclude(path)`, `collectFiles(rootDir)`
  - `zip.ts` — `createZipBuffer(rootDir, files)` — manual ZIP format with deflateRawSync
  - `deploy-json.ts` — `DeployConfig` interface, `readDeployConfig(dir)`, `writeDeployConfig(dir, config)`, `generateSlug(appName)`
  - `dashboard.ts` — `buildAppsJson(token)`, `generateDashboardHtml(apps)`, `deployDashboard(token)` — generates HTML dashboard with CSP + textContent, deploys via ZIP to dashboard SWA
- **All 9 tools wired** with `deployedBy` tag from JWT UPN:
  - `app_deploy` — first deploy (create SWA/DNS/auth/tags/.deploy.json/dashboard) + re-deploy (.deploy.json → ZIP → deploy → update tags → dashboard)
  - `app_list` — auth check → `listStaticWebApps` → filter out dashboard → sorted list
  - `app_info` — auth check → `getStaticWebApp` → return details from tags, handles 404
  - `app_delete` — auth check → prevents dashboard deletion → `deleteStaticWebApp` + `deleteCnameRecord` + `deployDashboard`
  - `app_update_info` — auth check → verifies app exists → `updateTags` (only provided fields) + `deployDashboard`
  - `dashboard_rebuild` — auth check → `deployDashboard(token)` → success JSON
- **Deploy skill** at `skills/deploy/SKILL.md` — orchestrates auth → deploy → app management, registered in `.claude-plugin/plugin.json`
- **Infrastructure script** at `infra/setup.sh` — idempotent `az` CLI script: creates resource group, two Entra ID app registrations (Deploy Plugin + Published Apps), dashboard SWA, RBAC, outputs `infra/.env` with all config values
- **Config injection** at `src/config.ts` — `buildConfig()` reads from `DEPLOY_AGENT_*` env vars with hardcoded defaults. 7 configurable values: `TENANT_ID`, `CLIENT_ID`, `SUBSCRIPTION_ID`, `RESOURCE_GROUP`, `DNS_ZONE`, `DNS_RESOURCE_GROUP`, `LOCATION`
- **Shared test helper** at `test/helpers/mock-fetch.ts` — installMockFetch/restoreFetch/mockFetch/mockFetchOnce/getFetchCalls
- **Integration tests** at `test/integration/`:
  - `deploy-flow.test.ts` — full lifecycle (auth → deploy → list → info → update → redeploy → delete)
  - `mcp-protocol.test.ts` — stdio JSON-RPC flow (initialize → tools/list → tools/call → error handling)
- **Config** at `src/config.ts` — Azure tenant/client/subscription/resource group/DNS values (client ID still placeholder until `infra/setup.sh` is run)
- **CLAUDE.md** — project guidance file for Claude Code
- **209 passing tests** — protocol, server, device-code, token-store, jwt, auth tools, tool registry, rest-client, static-web-apps, dns, deny-list, zip, deploy-json, dashboard, app-deploy, dashboard-rebuild, app-list, app-info, app-delete, app-update-info, config, integration (deploy-flow, mcp-protocol)

Batch 9 tasks:
1. **Token store Windows fix** — keep `mode: 0o600` (harmless on Windows), conditionally skip permission assertion in test on `win32`. Clean up unused `symlink` import in deny-list test.
2. **Cross-platform test verification** — run full suite, verify no platform-specific assumptions, check path handling + `os.homedir()`/`os.tmpdir()` usage.
3. **GitHub Actions CI** — `.github/workflows/ci.yml` with matrix (`ubuntu-latest` + `windows-latest`, Node 22), trigger on push to main + PRs.
