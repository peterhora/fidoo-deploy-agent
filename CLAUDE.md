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

MCP server plugin for Claude Code that deploys static HTML/JS apps to Azure Static Web Apps.

**Protocol:** JSON-RPC 2.0 over stdio. `src/protocol.ts` handles message framing, `src/server.ts` routes `initialize`, `tools/list`, and `tools/call` methods.

**Tool pattern:** Each tool in `src/tools/` exports `definition: ToolDefinition` (name, description, inputSchema) and `handler: ToolHandler` (async function returning `{ content: [{type: "text", text: string}], isError?: boolean }`). All tools are registered in `src/tools/index.ts`.

**Auth flow:** OAuth2 device code flow via `src/auth/device-code.ts`. Tokens cached to `~/.deploy-agent/tokens.json` (mode 0600). Override dir with `DEPLOY_AGENT_TOKEN_DIR` env var (used in tests).

**Azure layer:** `src/azure/rest-client.ts` wraps `fetch` with ARM base URL, Bearer header, and api-version. Throws `AzureError` with `.status` and `.code` on non-2xx. SWA and DNS modules build on this.

**Deploy flow:** `collectFiles` (deny-list) → `createZipBuffer` (manual ZIP with deflateRawSync) → Azure SWA deploy. App metadata stored in Azure resource tags and local `.deploy.json`.

**Dashboard:** Auto-generated HTML listing all deployed apps. Built from Azure resource tags via `listStaticWebApps`, deployed as its own SWA (slug: `apps`). Rebuilt after every deploy/delete/update.

## Key Conventions

- **Zero runtime deps.** Only `typescript` and `@types/node` as devDeps. ZIP format, JSON-RPC, and OAuth are all hand-rolled.
- **ESM only.** `"type": "module"` in package.json, `NodeNext` module resolution. All imports use `.js` extensions.
- **Node.js 22+ required.** Uses `zlib.crc32`.
- **rootDir is `.`** (not `./src`), so compiled output mirrors source: `dist/src/`, `dist/test/`.
- **Test runner:** `node:test` + `node:assert/strict`. No test framework.
- **Test mocking:** `test/helpers/mock-fetch.ts` provides `installMockFetch`/`restoreFetch`/`mockFetch`/`getFetchCalls` for intercepting global `fetch`. Tool tests use temp dirs for token storage with `DEPLOY_AGENT_TOKEN_DIR`.
- **TDD workflow.** Write tests first, verify they fail, then implement.
