# Continuation Prompt

Paste this to start the next session:

---

Execute the plan at docs/plans/2026-02-26-deploy-agent-implementation.md — start with Batch 5 (App Deploy + Dashboard).

## Context from previous session

Batches 1–4 are complete. The project has:

- **Working MCP server** at `src/server.ts` — handles `initialize`, `tools/list`, `tools/call` over JSON-RPC 2.0 stdio
- **Protocol layer** at `src/protocol.ts` — parses/formats JSON-RPC messages, creates stdio transport
- **Auth module** at `src/auth/`:
  - `device-code.ts` — `startDeviceCodeFlow`, `pollForToken`, `refreshAccessToken`
  - `token-store.ts` — file-based storage (`~/.deploy-agent/tokens.json`, mode 0600), `DEPLOY_AGENT_TOKEN_DIR` env var for test override
- **3 wired auth tools**: `auth-status`, `auth-login`, `auth-poll`
- **Azure REST client** at `src/azure/rest-client.ts` — `azureFetch(path, {token, method?, body?, apiVersion?})`. Prepends ARM base URL, adds Bearer header, appends api-version, handles 204 (returns null), throws `AzureError` with `.status` and `.code` on non-2xx.
- **Static Web Apps API** at `src/azure/static-web-apps.ts` — `createStaticWebApp`, `getStaticWebApp`, `deleteStaticWebApp`, `listStaticWebApps`, `getDeploymentToken`, `updateTags`, `configureAuth`
- **DNS API** at `src/azure/dns.ts` — `createCnameRecord`, `deleteCnameRecord`, `getCnameRecord`
- **Deploy modules** at `src/deploy/`:
  - `deny-list.ts` — `DENIED_PATTERNS` (8 patterns: .env*, .git/, node_modules/, .deploy.json, .claude/, *.pem, *.key, .DS_Store), `shouldExclude(path)`, `collectFiles(rootDir)` (recursive walk, skips excluded dirs, returns sorted relative paths)
  - `zip.ts` — `createZipBuffer(rootDir, files)` — manual ZIP format: local file headers + deflateRawSync compressed data + central directory + EOCD. Uses `zlib.crc32` (Node 22+).
  - `deploy-json.ts` — `DeployConfig` interface (appSlug, appName, appDescription, resourceId), `readDeployConfig(dir)` (returns null on missing/invalid), `writeDeployConfig(dir, config)` (formatted JSON), `generateSlug(appName)` (lowercase, hyphens, max 60 chars)
- **6 remaining tool stubs** in `src/tools/` — all return "Not implemented yet"
- **Shared test helper** at `test/helpers/mock-fetch.ts` — installMockFetch/restoreFetch/mockFetch/mockFetchOnce/getFetchCalls (handles 204 null-body responses)
- **Config** at `src/config.ts` — Azure tenant/client/subscription/resource group/DNS values (client ID still placeholder)
- **127 passing tests** — protocol, server, device-code, token-store, auth tools, tool registry, rest-client, static-web-apps, dns, deny-list, zip, deploy-json

Key structural decisions:
- `tsconfig.json` rootDir is `.` so compiled output mirrors source: `dist/src/`, `dist/test/`
- Test runner: `node --test --test-force-exit` with two glob patterns. Note: `--test-force-exit` can prematurely terminate as test count grows — use `node --test` (no force-exit) for full verification.
- Zero npm runtime deps, devDeps only: typescript + @types/node
- ESM modules (`"type": "module"` in package.json, `NodeNext` module resolution)
- Node.js 22+ required (for `zlib.crc32`)
- Token store dir overridable via `DEPLOY_AGENT_TOKEN_DIR` env var (used in tool tests)

Batch 5 tasks: Dashboard generation (TDD), wire app_deploy tool (TDD), wire dashboard_rebuild tool (TDD). The deploy flow uses modules from Batches 3–4: `collectFiles` → `createZipBuffer` → `createStaticWebApp` → deploy ZIP → `createCnameRecord` → `configureAuth` → `writeDeployConfig` → rebuild dashboard. Reuse `test/helpers/mock-fetch.ts` for Azure API mocking. Design doc at `docs/plans/2026-02-26-deploy-agent-design.md` has the full deploy flow and dashboard spec.

Note: Plan also includes Batch 8 (Azure IaC via `az` CLI) and Batch 9 (Windows support + CI) — added this session. These come after Batch 7.
