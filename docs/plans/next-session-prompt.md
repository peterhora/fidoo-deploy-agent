# Continuation Prompt

Paste this to start the next session:

---

Execute the plan at docs/plans/2026-02-26-deploy-agent-implementation.md — start with Batch 4 (ZIP Creation + File Exclusion + .deploy.json).

## Context from previous session

Batches 1–3 are complete. The project has:

- **Working MCP server** at `src/server.ts` — handles `initialize`, `tools/list`, `tools/call` over JSON-RPC 2.0 stdio
- **Protocol layer** at `src/protocol.ts` — parses/formats JSON-RPC messages, creates stdio transport
- **Auth module** at `src/auth/`:
  - `device-code.ts` — `startDeviceCodeFlow`, `pollForToken`, `refreshAccessToken`
  - `token-store.ts` — file-based storage (`~/.deploy-agent/tokens.json`, mode 0600), `DEPLOY_AGENT_TOKEN_DIR` env var for test override
- **3 wired auth tools**: `auth-status`, `auth-login`, `auth-poll`
- **Azure REST client** at `src/azure/rest-client.ts` — `azureFetch(path, {token, method?, body?, apiVersion?})`. Prepends ARM base URL, adds Bearer header, appends api-version, handles 204 (returns null), throws `AzureError` with `.status` and `.code` on non-2xx.
- **Static Web Apps API** at `src/azure/static-web-apps.ts` — `createStaticWebApp`, `getStaticWebApp`, `deleteStaticWebApp`, `listStaticWebApps`, `getDeploymentToken`, `updateTags`, `configureAuth`
- **DNS API** at `src/azure/dns.ts` — `createCnameRecord`, `deleteCnameRecord`, `getCnameRecord`
- **6 remaining tool stubs** in `src/tools/` — all return "Not implemented yet"
- **Shared test helper** at `test/helpers/mock-fetch.ts` — installMockFetch/restoreFetch/mockFetch/mockFetchOnce/getFetchCalls (handles 204 null-body responses)
- **Config** at `src/config.ts` — Azure tenant/client/subscription/resource group/DNS values (client ID still placeholder)
- **82 passing tests** — protocol, server, device-code, token-store, auth tools, tool registry, rest-client, static-web-apps, dns

Key structural decisions:
- `tsconfig.json` rootDir is `.` so compiled output mirrors source: `dist/src/`, `dist/test/`
- Test runner: `node --test --test-force-exit` with two glob patterns. Note: `--test-force-exit` can prematurely terminate as test count grows — use `node --test` (no force-exit) for full verification.
- Zero npm runtime deps, devDeps only: typescript + @types/node
- ESM modules (`"type": "module"` in package.json, `NodeNext` module resolution)
- Token store dir overridable via `DEPLOY_AGENT_TOKEN_DIR` env var (used in tool tests)

Batch 4 tasks: File exclusion deny-list (TDD), ZIP creation using zlib (TDD), .deploy.json management (TDD). Design doc at `docs/plans/2026-02-26-deploy-agent-design.md` has security requirements (deny-list patterns). Reuse `test/helpers/mock-fetch.ts` for any tests needing fetch mocking. Batch 4 is mostly filesystem/buffer work — no Azure API calls.
