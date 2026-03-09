# Remove `az acr build` Dependency — Design Document

**Date:** 2026-03-09
**Status:** Approved
**Branch:** feat/remove-az-cli-dependency

---

## Problem

The PoC introduced `az acr build` (Azure CLI) as a runtime dependency in `src/azure/acr.ts`. The original design intended pure REST/HTTP throughout. `az` is an optional external tool that users must install separately and is inappropriate as a runtime dependency for an MCP server.

## Goal

Replace `az acr build` with equivalent ARM + Azure Files REST calls. No local Docker required. No `az` CLI required.

---

## Root Cause of Original SAS URL Failure

The original implementation attempted to pass a blob storage SAS URL as `sourceLocation` in the ACR Tasks `scheduleRun` request. This failed because ACR Tasks does not download from arbitrary blob storage URLs. It expects source to be uploaded to its own internal Azure Files store via `listBuildSourceUploadUrl`, and `sourceLocation` must be the relative path returned by that endpoint — not a full URL.

---

## Approach

Use ACR's `listBuildSourceUploadUrl` ARM endpoint, which is what `az acr build` uses internally.

### Flow

```
1. createTarball(folder)                         — tarball.ts, unchanged (uses tar)
2. listBuildSourceUploadUrl(armToken)            — ARM POST → { uploadUrl, relativePath }
3. uploadToAzureFiles(uploadUrl, buffer)         — 2-step Azure Files REST:
     PUT {url}              → create empty file
     PUT {url}?comp=range   → write bytes in 4MB chunks
4. scheduleAcrBuild(armToken, imageTag, relativePath)  — existing, sourceLocation = relativePath
5. pollAcrBuild(armToken, runId)                 — existing, unchanged
```

---

## File Changes

### `src/azure/acr.ts`

- **Delete** `acrBuildFromDir()` — the `az` CLI wrapper
- **Add** `listBuildSourceUploadUrl(token)` — ARM POST to get upload URL and relative path
- **Add** `uploadToAzureFiles(uploadUrl, buffer)` — 2-step Azure Files REST upload
- **Rename** `sasUrl` parameter → `sourceLocation` in `scheduleAcrBuild()` (cosmetic, no logic change)

### `src/tools/container-deploy.ts`

- Replace single `acrBuildFromDir(folder, imageTag)` call with the 4-step sequence above
- Add import of `createTarball` from `../deploy/tarball.js`
- Add import of `listBuildSourceUploadUrl`, `uploadToAzureFiles` from `../azure/acr.js`

### Unchanged

- `src/deploy/tarball.ts` — untouched
- `src/azure/acr.ts` — `pollAcrBuild()` untouched
- `src/azure/blob.ts` — separate concern, not addressed here

---

## Azure Files Upload Detail

`listBuildSourceUploadUrl` returns a pre-authenticated Azure Files SAS URL. No additional auth headers needed.

**Step 1 — Create empty file:**
```
PUT {uploadUrl}
Headers:
  x-ms-type: file
  x-ms-content-length: {byteLength}
  x-ms-version: 2024-11-04
Body: (empty)
```

**Step 2 — Write content in chunks:**
```
PUT {uploadUrl}&comp=range
Headers:
  x-ms-write: update
  x-ms-range: bytes={start}-{end}
  Content-Length: {chunkSize}
  x-ms-version: 2024-11-04
Body: chunk bytes
```

Max chunk size: 4MB (4,194,304 bytes). Loop until all bytes written.

---

## ARM Endpoint

```
POST https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/
     providers/Microsoft.ContainerRegistry/registries/{name}/
     listBuildSourceUploadUrl?api-version=2019-06-01-preview

Response: { "relativePath": "source/runs/...", "uploadUrl": "https://..." }
```

---

## Constraints

- No local Docker required — build runs entirely in ACR Tasks (Azure cloud)
- No `az` CLI required after this change
- `tar` (standard Unix utility) remains a dependency via `tarball.ts`
- Tarballs of any size supported via chunked range writes
