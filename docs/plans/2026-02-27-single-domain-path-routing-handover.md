# Handover: Single-Domain Path-Based Routing

## Status

**Branch:** `feat/single-domain-path-routing` (9 commits ahead of `main`)
**Completed:** Tasks 1-9 of 14
**Remaining:** Tasks 10-14

## Completed Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | Config: remove DNS, add blob/SWA fields | `2c51a8d` |
| 2 | Blob storage client (`src/azure/blob.ts`) | `8c662af` |
| 3 | Registry module (`src/deploy/registry.ts`) | `48998a5` |
| 4 | Site assembly module (`src/deploy/assemble.ts`) | `319250a` |
| 5 | Dashboard refactor (accepts registry data, path URLs) | `4696a4a` |
| 6 | Site deploy helper (`src/deploy/site-deploy.ts`) | `81e126d` |
| 7 | Rewrite app_deploy | `7298b01` |
| 8 | Rewrite app_delete | `41ed6b3` |
| 9 | Rewrite app_list | `7db1dd1` |

## Remaining Tasks

### Task 10: Rewrite app_info tool
**Files:** `src/tools/app-info.ts`, `test/tools/app-info.test.ts`
**Change:** Replace `getStaticWebApp` + `AzureError` with `loadRegistry` → find by slug. URL: `https://${config.appDomain}/${slug}/`. Return `{ slug, name, description, url, deployedAt, deployedBy }` or "not found" error. No `deploySite` needed (read-only).

### Task 11: Rewrite app_update_info tool
**Files:** `src/tools/app-update-info.ts`, `test/tools/app-update-info.test.ts`
**Change:** Replace `getStaticWebApp` + `updateTags` + `deployDashboard` with `loadRegistry` → find → update fields → `upsertApp` → `saveRegistry` → `deploySite`. Remove `AzureError` import.

### Task 12: Remove dashboard_rebuild tool, DNS module, update tool registry
**Files:** Delete `src/tools/dashboard-rebuild.ts`, `test/tools/dashboard-rebuild.test.ts`, `src/azure/dns.ts`, `test/azure/dns.test.ts`. Modify `src/tools/index.ts` (remove dashboardRebuild import+registration), `test/tools/tool-stubs.test.ts` (update count 9→8), `test/server.test.ts` (update count 9→8).

### Task 13: Update integration test
**Files:** `test/integration/deploy-flow.test.ts`
**Change:** Rewrite to test full lifecycle with blob/registry/single-SWA mocks instead of per-app SWA/DNS mocks.

### Task 14: Update infra setup script and CLAUDE.md
**Files:** `infra/setup.sh`, `CLAUDE.md`
**Change:** Add storage account + blob container setup. Single SWA creation. Update architecture docs.

## Current TS Errors (all expected, fixed by remaining tasks)

- `src/azure/dns.ts` — references removed `dnsResourceGroup`, `dnsZone`, `dnsApiVersion` → deleted in Task 12
- `src/tools/app-info.ts` — references removed `config.dnsZone` → fixed in Task 10
- `src/tools/app-update-info.ts` — imports removed `deployDashboard` → fixed in Task 11
- `src/tools/dashboard-rebuild.ts` — references removed `dashboardSlug`, `dnsZone` → deleted in Task 12

## Key Module Reference

| Module | Exports | Used by remaining tasks |
|--------|---------|------------------------|
| `src/config.ts` | `config.appDomain`, `config.swaSlug`, `config.storageAccount`, `config.containerName` | 10, 11 |
| `src/azure/blob.ts` | `uploadBlob`, `downloadBlob`, `deleteBlob`, `listBlobs`, `deleteBlobsByPrefix` | — |
| `src/deploy/registry.ts` | `loadRegistry`, `saveRegistry`, `upsertApp`, `removeApp`, types `Registry`, `AppEntry` | 10, 11 |
| `src/deploy/site-deploy.ts` | `deploySite(token, registry)` | 11 |
| `src/auth/token-store.ts` | `loadTokens`, `isTokenExpired` | 10, 11 |
| `test/helpers/mock-fetch.ts` | `installMockFetch`, `restoreFetch`, `mockFetch`, `getFetchCalls` | 10, 11, 12, 13 |

## Parallelization Notes

- **Tasks 10 and 11** are independent (different files) — can run in parallel as sub-agents
- **Task 12** depends on nothing but should run after 10+11 so all tool TS errors are resolved first
- **Task 13** depends on 12 (tool count change)
- **Task 14** is independent (docs only)
- Recommended batches: [10, 11] parallel → [12] → [13, 14] parallel

## Continuation Prompt

```
Continue executing the implementation plan in docs/plans/2026-02-27-single-domain-path-routing-plan.md using the superpowers:executing-plans skill.

Context: We're on branch `feat/single-domain-path-routing`. Tasks 1-9 are complete (config, blob client, registry, assembly, dashboard refactor, site-deploy, app_deploy, app_delete, app_list). Tasks 10-14 remain. The handover doc is at docs/plans/2026-02-27-single-domain-path-routing-handover.md.

Use sub-agents for parallel tasks. Recommended batches:
- Batch 4: Tasks 10+11 in parallel (rewrite app_info and app_update_info)
- Batch 5: Task 12 (remove dead code — dashboard_rebuild, dns.ts)
- Batch 6: Tasks 13+14 in parallel (integration test + docs)
```
