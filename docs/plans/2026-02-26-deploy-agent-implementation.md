# Deploy Agent Plugin — Implementation Plan

## Context

Non-technical users vibe-code static HTML/JS apps and need a dead-simple way to deploy them to Azure. The design document at `docs/plans/2026-02-26-deploy-agent-design.md` specifies a Claude Code plugin with a bundled MCP server (zero npm runtime deps) and a deploy skill. This is a greenfield project — no code exists yet.

## Project Structure

```
deploy_agent/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── .mcp.json                    # MCP server config (stdio)
├── skills/
│   └── deploy/
│       └── SKILL.md             # Deploy skill (UX orchestrator)
├── src/
│   ├── server.ts                # MCP server entry point
│   ├── protocol.ts              # JSON-RPC 2.0 over stdio
│   ├── config.ts                # Azure config values (tenant, client, sub, etc.)
│   ├── tools/
│   │   ├── index.ts             # Tool registry
│   │   ├── auth-status.ts
│   │   ├── auth-login.ts
│   │   ├── auth-poll.ts
│   │   ├── app-deploy.ts
│   │   ├── app-delete.ts
│   │   ├── app-list.ts
│   │   ├── app-info.ts
│   │   ├── app-update-info.ts
│   │   └── dashboard-rebuild.ts
│   ├── auth/
│   │   ├── device-code.ts       # OAuth2 device code flow
│   │   └── token-store.ts       # Token caching (keychain/file)
│   ├── azure/
│   │   ├── rest-client.ts       # fetch wrapper with auth headers
│   │   ├── static-web-apps.ts   # SWA ARM operations
│   │   └── dns.ts               # CNAME record management
│   └── deploy/
│       ├── zip.ts               # ZIP creation (Node.js zlib)
│       ├── deploy-json.ts       # .deploy.json read/write
│       ├── deny-list.ts         # File exclusion patterns
│       └── dashboard.ts         # Dashboard generation + deploy
├── test/
│   ├── helpers/
│   │   └── mock-fetch.ts        # Shared fetch mock
│   ├── protocol.test.ts
│   ├── tools/                   # One test file per tool
│   ├── auth/
│   ├── azure/
│   └── deploy/
├── dist/                        # Compiled JS (gitignored)
├── package.json                 # devDependencies only: typescript, @types/node
├── tsconfig.json
├── .gitignore
└── docs/plans/                  # Existing design doc
```

---

## Batch 1: Project Foundation + MCP Server Skeleton ✅ COMPLETE

**Goal:** A working MCP server that Claude Code can connect to, listing all 9 tool stubs.

**Status:** All 3 tasks done. 18 tests pass. MCP server responds correctly over stdio (initialize + tools/list + tools/call). README.md with configuration guide added.

### Task 1.1: Initialize project ✅
### Task 1.2: JSON-RPC protocol layer (TDD) ✅
### Task 1.3: MCP server entry point + tool stubs (TDD) ✅

**Implementation notes:**
- `tsconfig.json` rootDir is `.` (not `./src`) so tests compile to `dist/test/`
- Test script: `node --test --test-force-exit dist/test/*.test.js dist/test/**/*.test.js` (two globs to cover root + nested test files)
- `.mcp.json` args: `${CLAUDE_PLUGIN_ROOT}/dist/src/server.js` (includes `src/` prefix due to rootDir)
- `server.ts` exports handler functions for testability; stdio transport only starts when run as main module

---

## Batch 2: Authentication Module ✅ COMPLETE

**Goal:** Complete device code flow. User can log in via browser and get a valid Azure token.

**Status:** All 3 tasks done. 53 tests pass (32 new). Full OAuth2 device code flow implemented with file-based token storage.

### Task 2.1: Device code flow (TDD) ✅
### Task 2.2: Token storage (TDD) ✅
### Task 2.3: Wire auth tools ✅

**Implementation notes:**
- `test/helpers/mock-fetch.ts` — shared fetch mock (installMockFetch/restoreFetch/mockFetch/getFetchCalls) used by all auth tests
- `src/auth/device-code.ts` — `startDeviceCodeFlow`, `pollForToken` (handles authorization_pending/slow_down/expired_token), `refreshAccessToken`
- `src/auth/token-store.ts` — file-based storage at `~/.deploy-agent/tokens.json` (mode 0600). `DEPLOY_AGENT_TOKEN_DIR` env var overrides dir for testing. `isTokenExpired` with 5-min safety margin. Keychain support deferred (file fallback sufficient for now).
- Auth tools wired: `auth-status` (checks token store), `auth-login` (starts device code flow), `auth-poll` (polls + saves tokens)
- Tool stubs test updated to only check non-auth tools for "Not implemented" text
- `config.ts` still has `PLACEHOLDER_CLIENT_ID` — needs real Entra ID app registration values before manual testing

---

## Batch 3: Azure REST Client + Core API Operations

**Goal:** Reusable Azure REST client. Can CRUD Static Web Apps and manage DNS records.

### Task 3.1: Azure REST client (TDD)
- **Implement** `src/azure/rest-client.ts`: `azureFetch(path, {method, body, token, apiVersion})` — prepends management.azure.com, adds Bearer header, handles 401/429/4xx/5xx

### Task 3.2: Static Web Apps API (TDD)
- **Implement** `src/azure/static-web-apps.ts`: `createStaticWebApp`, `getStaticWebApp`, `deleteStaticWebApp`, `listStaticWebApps`, `getDeploymentToken`, `updateTags`, `configureAuth`

### Task 3.3: Azure DNS API (TDD)
- **Implement** `src/azure/dns.ts`: `createCnameRecord`, `deleteCnameRecord`, `getCnameRecord`

---

## Batch 4: ZIP Creation + File Exclusion + .deploy.json

**Goal:** Can ZIP a local folder (respecting deny-list), read/write .deploy.json.

### Task 4.1: File exclusion deny-list (TDD)
- **Implement** `src/deploy/deny-list.ts`: hardcoded `DENIED_PATTERNS` (.env, .git/, node_modules/, .deploy.json, .claude/, *.pem, *.key, etc.), `shouldExclude(path)`, `collectFiles(rootDir)`

### Task 4.2: ZIP creation (TDD)
- **Implement** `src/deploy/zip.ts`: `createZipBuffer(rootDir, files)` — manual ZIP format using `zlib.deflateRawSync`. Local file headers + central directory + EOCD.

### Task 4.3: .deploy.json management (TDD)
- **Implement** `src/deploy/deploy-json.ts`: `readDeployConfig`, `writeDeployConfig`, `generateSlug(appName)` (lowercase, hyphens, strip special chars, max 60 chars)

---

## Batch 5: App Deploy + Dashboard

**Goal:** Core deploy flow works end-to-end. Dashboard generation works.

### Task 5.1: Dashboard generation (TDD)
- **Implement** `src/deploy/dashboard.ts`: `buildAppsJson(token, rg)`, `generateDashboardHtml(apps)` (uses textContent not innerHTML, strict CSP), `deployDashboard(token, apps)`

### Task 5.2: Wire app_deploy tool (TDD)
- Full first-deploy flow: check auth → check slug collision → collect files → ZIP → create SWA → deploy → CNAME → auth config → write .deploy.json → rebuild dashboard
- Re-deploy flow: read .deploy.json → ZIP → deploy → rebuild dashboard

### Task 5.3: Wire dashboard_rebuild tool (TDD)

---

## Batch 6: App Management Tools

**Goal:** All remaining tools work.

### Task 6.1: app_list and app_info (TDD)
### Task 6.2: app_delete (TDD) — delete SWA + CNAME + rebuild dashboard
### Task 6.3: app_update_info (TDD) — update tags + .deploy.json + rebuild dashboard (no redeploy)

---

## Batch 7: Deploy Skill + Integration Tests

**Goal:** Complete, tested, deployable plugin.

### Task 7.1: Deploy skill (`skills/deploy/SKILL.md`)
- Skill description triggers on "deploy my app", "publish", "delete my app", "list apps", etc.
- Orchestrates auth flow → first deploy vs re-deploy → app management
- References all 9 MCP tools with usage guidance

### Task 7.2: Security hardening
- Verify deny-list completeness, slug collision check, `deployedBy` tag (extract UPN from JWT), dashboard XSS prevention

### Task 7.3: End-to-end integration tests
- Full deploy flow simulation with mocked Azure APIs
- MCP protocol flow test (pipe JSON-RPC to server process)

---

## Key Technical Decisions

1. **No MCP SDK** — JSON-RPC 2.0 over stdio is ~100-150 lines. Avoids `@modelcontextprotocol/sdk` dependency.
2. **Manual ZIP format** — `zlib.deflateRawSync` for compression, ~200 lines for the container format. Most complex zero-dep piece.
3. **macOS Keychain via `security` CLI** — zero-dep token storage using `child_process.execSync`. File fallback with 0600 permissions.
4. **Node.js built-in test runner** (`node:test`) — zero test framework dependency.
5. **Skill (not command)** — triggers naturally from conversation ("deploy my app") vs requiring a slash command.

## Verification

After each batch: `npm test` passes all tests, `npm run build` succeeds.

Final verification:
1. Install plugin locally: add to `.claude/settings.local.json`
2. Start Claude Code session, verify MCP tools appear
3. Test skill triggers on "deploy my app"
4. Full deploy flow against real Azure (requires Entra ID app registration setup)
