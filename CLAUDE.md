# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Watch mode (tsc --watch)
npm test               # Run all tests (uses --test-force-exit, may skip slow tests)
node --test dist/test/*.test.js dist/test/**/*.test.js   # Full test suite (no force-exit, preferred for verification)
node --test dist/test/tools/app-list.test.js             # Run a single test file
```

Always `npm run build` before running tests — tests run from `dist/`.

## Architecture

MCP server plugin for Claude Code that deploys static HTML/JS apps to a single Azure Static Web App with path-based routing. Apps are served at `https://{domain}/{slug}/`. App content is stored in Azure Blob Storage; a single SWA hosts the assembled site (all apps + dashboard).

**Protocol:** JSON-RPC 2.0 over stdio. `src/protocol.ts` handles message framing, `src/server.ts` routes `initialize`, `tools/list`, and `tools/call` methods.

**Tool pattern:** Each tool in `src/tools/` exports `definition: ToolDefinition` (name, description, inputSchema) and `handler: ToolHandler` (async function returning `{ content: [{type: "text", text: string}], isError?: boolean }`). All 8 tools are registered in `src/tools/index.ts`: `auth_login`, `auth_poll`, `auth_status`, `app_deploy`, `app_delete`, `app_list`, `app_info`, `app_update_info`.

**Auth flow:** OAuth2 device code flow via `src/auth/device-code.ts`. Tokens cached to `~/.deploy-agent/tokens.json` (mode 0600). Override dir with `DEPLOY_AGENT_TOKEN_DIR` env var (used in tests).

**Azure layer:** `src/azure/rest-client.ts` wraps `fetch` with ARM base URL, Bearer header, and api-version. Throws `AzureError` with `.status` and `.code` on non-2xx. `src/azure/static-web-apps.ts` manages SWA deployment. `src/azure/blob.ts` handles blob upload/download/delete and registry operations against Azure Blob Storage.

**Deploy flow:** `collectFiles` (deny-list) → blob upload (`src/azure/blob.ts`) → registry update (`src/deploy/registry.ts`) → `assembleSite` (`src/deploy/assemble.ts`: downloads all apps from blob, generates dashboard HTML) → `createZipBuffer` → deploy ZIP to single SWA via `src/deploy/site-deploy.ts`.

**Registry:** `registry.json` in Azure Blob Storage is the source of truth for app metadata (slug, title, description, version). Updated on every deploy/delete/update-info.

**Dashboard:** Auto-generated HTML listing all deployed apps. Built by `src/deploy/dashboard.ts` during site assembly from registry data. No separate dashboard tool — the dashboard is regenerated as part of every site deploy.

## Config Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DEPLOY_AGENT_TENANT_ID` | Azure AD tenant ID | (required) |
| `DEPLOY_AGENT_CLIENT_ID` | Deploy Plugin app registration client ID | (required) |
| `DEPLOY_AGENT_SUBSCRIPTION_ID` | Azure subscription ID | (required) |
| `DEPLOY_AGENT_RESOURCE_GROUP` | Azure resource group name | (required) |
| `DEPLOY_AGENT_STORAGE_ACCOUNT` | Azure Storage account name | (required) |
| `DEPLOY_AGENT_CONTAINER_NAME` | Blob container name | `app-content` |
| `DEPLOY_AGENT_APP_DOMAIN` | Custom domain for apps | `ai-apps.env.fidoo.cloud` |
| `DEPLOY_AGENT_SWA_SLUG` | Single SWA resource name | `swa-ai-apps` |
| `DEPLOY_AGENT_TOKEN_DIR` | Override token storage dir | `~/.deploy-agent` |

## Key Conventions

- **Zero runtime deps.** Only `typescript` and `@types/node` as devDeps. ZIP format, JSON-RPC, and OAuth are all hand-rolled.
- **ESM only.** `"type": "module"` in package.json, `NodeNext` module resolution. All imports use `.js` extensions.
- **Node.js 22+ required.** Uses `zlib.crc32`.
- **rootDir is `.`** (not `./src`), so compiled output mirrors source: `dist/src/`, `dist/test/`.
- **Test runner:** `node:test` + `node:assert/strict`. No test framework.
- **Test mocking:** `test/helpers/mock-fetch.ts` provides `installMockFetch`/`restoreFetch`/`mockFetch`/`getFetchCalls` for intercepting global `fetch`. Tool tests use temp dirs for token storage with `DEPLOY_AGENT_TOKEN_DIR`.
- **TDD workflow.** Write tests first, verify they fail, then implement.
