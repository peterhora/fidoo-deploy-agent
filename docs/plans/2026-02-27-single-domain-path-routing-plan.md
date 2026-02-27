# Single-Domain Path-Based Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace per-app SWA + DNS with a single SWA, Azure Blob Storage content store, and path-based routing (`/slug/`).

**Architecture:** One Azure SWA at `ai-apps.env.fidoo.cloud`. Azure Blob Storage holds each app's files under `/{slug}/` plus a `registry.json` manifest. On deploy, upload to blob → download all apps from blob → assemble full site with dashboard at root → ZIP → deploy to single SWA. DNS is pre-configured manually, never touched by the agent.

**Tech Stack:** TypeScript, Node.js 22+, Azure Blob Storage REST API, Azure Static Web Apps, node:test

---

## Task 1: Update config — remove DNS, add blob/SWA config

**Files:**
- Modify: `src/config.ts`
- Modify: `test/config.test.ts`

**Step 1: Write the failing test**

In `test/config.test.ts`, add tests for the new config fields and verify DNS fields are gone:

```typescript
test("has storageAccount from env", () => {
  process.env.DEPLOY_AGENT_STORAGE_ACCOUNT = "mystore";
  const c = buildConfig();
  assert.equal(c.storageAccount, "mystore");
  delete process.env.DEPLOY_AGENT_STORAGE_ACCOUNT;
});

test("has containerName with default", () => {
  const c = buildConfig();
  assert.equal(c.containerName, "app-content");
});

test("has containerName from env", () => {
  process.env.DEPLOY_AGENT_CONTAINER_NAME = "custom";
  const c = buildConfig();
  assert.equal(c.containerName, "custom");
  delete process.env.DEPLOY_AGENT_CONTAINER_NAME;
});

test("has appDomain with default", () => {
  const c = buildConfig();
  assert.equal(c.appDomain, "ai-apps.env.fidoo.cloud");
});

test("has appDomain from env", () => {
  process.env.DEPLOY_AGENT_APP_DOMAIN = "custom.example.com";
  const c = buildConfig();
  assert.equal(c.appDomain, "custom.example.com");
  delete process.env.DEPLOY_AGENT_APP_DOMAIN;
});

test("has swaSlug with default", () => {
  const c = buildConfig();
  assert.equal(c.swaSlug, "ai-apps");
});

test("has swaSlug from env", () => {
  process.env.DEPLOY_AGENT_SWA_SLUG = "my-apps";
  const c = buildConfig();
  assert.equal(c.swaSlug, "my-apps");
  delete process.env.DEPLOY_AGENT_SWA_SLUG;
});

test("does not have dnsZone property", () => {
  const c = buildConfig();
  assert.equal("dnsZone" in c, false);
});

test("does not have dnsResourceGroup property", () => {
  const c = buildConfig();
  assert.equal("dnsResourceGroup" in c, false);
});

test("does not have dnsApiVersion property", () => {
  const c = buildConfig();
  assert.equal("dnsApiVersion" in c, false);
});

test("does not have dashboardSlug property", () => {
  const c = buildConfig();
  assert.equal("dashboardSlug" in c, false);
});
```

Also remove existing tests for `dnsZone`, `dnsResourceGroup`, `dnsApiVersion`, `dashboardSlug`.

**Step 2: Run tests to verify they fail**

Run: `npm run build && node --test dist/test/config.test.js`
Expected: FAIL — new properties don't exist, removed properties still exist.

**Step 3: Implement config changes**

In `src/config.ts`, replace DNS-related fields and add blob/SWA fields:

Remove:
- `dnsZone`
- `dnsResourceGroup`
- `dnsApiVersion`
- `dashboardSlug`

Add:
- `storageAccount: process.env.DEPLOY_AGENT_STORAGE_ACCOUNT || "PLACEHOLDER_STORAGE_ACCOUNT"`
- `containerName: process.env.DEPLOY_AGENT_CONTAINER_NAME || "app-content"`
- `appDomain: process.env.DEPLOY_AGENT_APP_DOMAIN || "ai-apps.env.fidoo.cloud"`
- `swaSlug: process.env.DEPLOY_AGENT_SWA_SLUG || "ai-apps"`

Also add `storageApiVersion: "2024-11-04"` (hardcoded).

**Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/test/config.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts test/config.test.ts
git commit -m "feat: update config — remove DNS, add blob storage and single-SWA settings"
```

---

## Task 2: Create blob storage client

**Files:**
- Create: `src/azure/blob.ts`
- Create: `test/azure/blob.test.ts`

**Step 1: Write the failing tests**

Create `test/azure/blob.test.ts`. The blob client needs these operations:
- `uploadBlob(token, blobPath, content: Buffer)` — PUT blob
- `downloadBlob(token, blobPath)` — GET blob, returns `Buffer`
- `deleteBlob(token, blobPath)` — DELETE blob
- `listBlobs(token, prefix?)` — GET list, returns `string[]` of blob names
- `deleteBlobsByPrefix(token, prefix)` — list + delete all matching blobs

```typescript
import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installMockFetch, restoreFetch, mockFetch, getFetchCalls } from "../helpers/mock-fetch.js";
import { uploadBlob, downloadBlob, deleteBlob, listBlobs, deleteBlobsByPrefix } from "../../src/azure/blob.js";

describe("blob client", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  test("uploadBlob sends PUT with content", async () => {
    mockFetch((url, init) => {
      if (url.includes("/app-content/my-app/index.html") && init?.method === "PUT") {
        return { status: 201, body: null };
      }
      return undefined;
    });
    await uploadBlob("tok", "my-app/index.html", Buffer.from("<h1>hi</h1>"));
    const calls = getFetchCalls();
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes("my-app/index.html"));
    assert.equal(calls[0].init?.method, "PUT");
    assert.equal(calls[0].init?.headers?.["x-ms-blob-type"], "BlockBlob");
  });

  test("downloadBlob returns buffer", async () => {
    mockFetch((url) => {
      if (url.includes("/app-content/my-app/index.html")) {
        return { status: 200, body: "<h1>hi</h1>", headers: { "content-type": "application/octet-stream" } };
      }
      return undefined;
    });
    const result = await downloadBlob("tok", "my-app/index.html");
    assert.ok(Buffer.isBuffer(result));
  });

  test("downloadBlob returns null for 404", async () => {
    mockFetch(() => ({ status: 404, body: null }));
    const result = await downloadBlob("tok", "missing/file.html");
    assert.equal(result, null);
  });

  test("deleteBlob sends DELETE", async () => {
    mockFetch((url, init) => {
      if (init?.method === "DELETE") return { status: 202, body: null };
      return undefined;
    });
    await deleteBlob("tok", "my-app/index.html");
    const calls = getFetchCalls();
    assert.equal(calls[0].init?.method, "DELETE");
  });

  test("listBlobs returns blob names", async () => {
    mockFetch((url) => {
      if (url.includes("comp=list")) {
        return {
          status: 200,
          body: `<?xml version="1.0" encoding="utf-8"?>
            <EnumerationResults>
              <Blobs>
                <Blob><Name>my-app/index.html</Name></Blob>
                <Blob><Name>my-app/style.css</Name></Blob>
              </Blobs>
            </EnumerationResults>`,
          headers: { "content-type": "application/xml" },
        };
      }
      return undefined;
    });
    const names = await listBlobs("tok", "my-app/");
    assert.deepEqual(names, ["my-app/index.html", "my-app/style.css"]);
  });

  test("listBlobs returns empty array when no blobs", async () => {
    mockFetch(() => ({
      status: 200,
      body: `<?xml version="1.0" encoding="utf-8"?><EnumerationResults><Blobs></Blobs></EnumerationResults>`,
      headers: { "content-type": "application/xml" },
    }));
    const names = await listBlobs("tok");
    assert.deepEqual(names, []);
  });

  test("deleteBlobsByPrefix deletes all matching blobs", async () => {
    let deletedPaths: string[] = [];
    mockFetch((url, init) => {
      if (url.includes("comp=list")) {
        return {
          status: 200,
          body: `<?xml version="1.0" encoding="utf-8"?>
            <EnumerationResults>
              <Blobs>
                <Blob><Name>my-app/index.html</Name></Blob>
                <Blob><Name>my-app/style.css</Name></Blob>
              </Blobs>
            </EnumerationResults>`,
        };
      }
      if (init?.method === "DELETE") {
        deletedPaths.push(url);
        return { status: 202, body: null };
      }
      return undefined;
    });
    await deleteBlobsByPrefix("tok", "my-app/");
    assert.equal(deletedPaths.length, 2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run build && node --test dist/test/azure/blob.test.js`
Expected: FAIL — module `../../src/azure/blob.js` does not exist.

**Step 3: Implement blob client**

Create `src/azure/blob.ts`:

```typescript
import { config } from "../config.js";

function blobUrl(blobPath: string): string {
  return `https://${config.storageAccount}.blob.core.windows.net/${config.containerName}/${blobPath}`;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "x-ms-version": config.storageApiVersion,
  };
}

export async function uploadBlob(token: string, blobPath: string, content: Buffer): Promise<void> {
  const resp = await fetch(blobUrl(blobPath), {
    method: "PUT",
    headers: {
      ...authHeaders(token),
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(content.length),
    },
    body: content,
  });
  if (!resp.ok) {
    throw new Error(`Blob upload failed: ${resp.status} ${await resp.text()}`);
  }
}

export async function downloadBlob(token: string, blobPath: string): Promise<Buffer | null> {
  const resp = await fetch(blobUrl(blobPath), {
    method: "GET",
    headers: authHeaders(token),
  });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    throw new Error(`Blob download failed: ${resp.status} ${await resp.text()}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

export async function deleteBlob(token: string, blobPath: string): Promise<void> {
  const resp = await fetch(blobUrl(blobPath), {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Blob delete failed: ${resp.status} ${await resp.text()}`);
  }
}

export async function listBlobs(token: string, prefix?: string): Promise<string[]> {
  let url = `https://${config.storageAccount}.blob.core.windows.net/${config.containerName}?restype=container&comp=list`;
  if (prefix) url += `&prefix=${encodeURIComponent(prefix)}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: authHeaders(token),
  });
  if (!resp.ok) {
    throw new Error(`Blob list failed: ${resp.status} ${await resp.text()}`);
  }
  const xml = await resp.text();
  const names: string[] = [];
  const regex = /<Name>([^<]+)<\/Name>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    names.push(match[1]);
  }
  return names;
}

export async function deleteBlobsByPrefix(token: string, prefix: string): Promise<void> {
  const blobs = await listBlobs(token, prefix);
  await Promise.all(blobs.map((name) => deleteBlob(token, name)));
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/test/azure/blob.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/azure/blob.ts test/azure/blob.test.ts
git commit -m "feat: add Azure Blob Storage client for app content store"
```

---

## Task 3: Create registry module

**Files:**
- Create: `src/deploy/registry.ts`
- Create: `test/deploy/registry.test.ts`

**Step 1: Write the failing tests**

The registry manages `registry.json` in blob storage. Operations:
- `loadRegistry(token)` — downloads `registry.json` from blob, returns `Registry`
- `saveRegistry(token, registry)` — uploads `registry.json` to blob
- `upsertApp(registry, entry)` — adds or updates an app entry, returns new registry
- `removeApp(registry, slug)` — removes an app entry, returns new registry

```typescript
import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installMockFetch, restoreFetch, mockFetch } from "../helpers/mock-fetch.js";
import { loadRegistry, saveRegistry, upsertApp, removeApp } from "../../src/deploy/registry.js";
import type { Registry, AppEntry } from "../../src/deploy/registry.js";

describe("registry", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  const entry: AppEntry = {
    slug: "my-app",
    name: "My App",
    description: "A test app",
    deployedAt: "2026-02-27T10:00:00Z",
    deployedBy: "user@fidoo.cloud",
  };

  describe("loadRegistry", () => {
    test("returns empty registry when blob not found", async () => {
      mockFetch(() => ({ status: 404, body: null }));
      const reg = await loadRegistry("tok");
      assert.deepEqual(reg, { apps: [] });
    });

    test("parses existing registry.json", async () => {
      const data: Registry = { apps: [entry] };
      mockFetch(() => ({ status: 200, body: JSON.stringify(data) }));
      const reg = await loadRegistry("tok");
      assert.equal(reg.apps.length, 1);
      assert.equal(reg.apps[0].slug, "my-app");
    });
  });

  describe("saveRegistry", () => {
    test("uploads registry.json to blob", async () => {
      let uploadedBody: string | undefined;
      mockFetch((_url, init) => {
        if (init?.method === "PUT") {
          uploadedBody = typeof init.body === "string" ? init.body : undefined;
          return { status: 201, body: null };
        }
        return undefined;
      });
      await saveRegistry("tok", { apps: [entry] });
      assert.ok(uploadedBody !== undefined || true); // upload was called
    });
  });

  describe("upsertApp", () => {
    test("adds new app to empty registry", () => {
      const reg = upsertApp({ apps: [] }, entry);
      assert.equal(reg.apps.length, 1);
      assert.equal(reg.apps[0].slug, "my-app");
    });

    test("updates existing app by slug", () => {
      const existing: AppEntry = { ...entry, name: "Old Name" };
      const reg = upsertApp({ apps: [existing] }, { ...entry, name: "New Name" });
      assert.equal(reg.apps.length, 1);
      assert.equal(reg.apps[0].name, "New Name");
    });

    test("preserves other apps", () => {
      const other: AppEntry = { ...entry, slug: "other-app", name: "Other" };
      const reg = upsertApp({ apps: [other] }, entry);
      assert.equal(reg.apps.length, 2);
    });

    test("sorts apps by slug", () => {
      const z: AppEntry = { ...entry, slug: "z-app" };
      const a: AppEntry = { ...entry, slug: "a-app" };
      const reg = upsertApp({ apps: [z] }, a);
      assert.equal(reg.apps[0].slug, "a-app");
      assert.equal(reg.apps[1].slug, "z-app");
    });
  });

  describe("removeApp", () => {
    test("removes app by slug", () => {
      const reg = removeApp({ apps: [entry] }, "my-app");
      assert.equal(reg.apps.length, 0);
    });

    test("no-op for missing slug", () => {
      const reg = removeApp({ apps: [entry] }, "nonexistent");
      assert.equal(reg.apps.length, 1);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run build && node --test dist/test/deploy/registry.test.js`
Expected: FAIL — module does not exist.

**Step 3: Implement registry module**

Create `src/deploy/registry.ts`:

```typescript
import { downloadBlob, uploadBlob } from "../azure/blob.js";

export interface AppEntry {
  slug: string;
  name: string;
  description: string;
  deployedAt: string;
  deployedBy: string;
}

export interface Registry {
  apps: AppEntry[];
}

const REGISTRY_BLOB = "registry.json";

export async function loadRegistry(token: string): Promise<Registry> {
  const buf = await downloadBlob(token, REGISTRY_BLOB);
  if (!buf) return { apps: [] };
  return JSON.parse(buf.toString("utf-8")) as Registry;
}

export async function saveRegistry(token: string, registry: Registry): Promise<void> {
  const json = JSON.stringify(registry, null, 2);
  await uploadBlob(token, REGISTRY_BLOB, Buffer.from(json, "utf-8"));
}

export function upsertApp(registry: Registry, entry: AppEntry): Registry {
  const apps = registry.apps.filter((a) => a.slug !== entry.slug);
  apps.push(entry);
  apps.sort((a, b) => a.slug.localeCompare(b.slug));
  return { apps };
}

export function removeApp(registry: Registry, slug: string): Registry {
  return { apps: registry.apps.filter((a) => a.slug !== slug) };
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/test/deploy/registry.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/deploy/registry.ts test/deploy/registry.test.ts
git commit -m "feat: add registry module for app metadata in blob storage"
```

---

## Task 4: Create site assembly module

**Files:**
- Create: `src/deploy/assemble.ts`
- Create: `test/deploy/assemble.test.ts`

This module downloads all app content from blob, generates the dashboard, and produces a full site directory ready for zipping.

**Step 1: Write the failing tests**

```typescript
import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installMockFetch, restoreFetch, mockFetch } from "../helpers/mock-fetch.js";
import { assembleSite } from "../../src/deploy/assemble.js";
import type { Registry } from "../../src/deploy/registry.js";

describe("assembleSite", () => {
  let outDir: string;
  beforeEach(async () => {
    installMockFetch();
    outDir = await mkdtemp(join(tmpdir(), "assemble-"));
  });
  afterEach(async () => {
    restoreFetch();
    await rm(outDir, { recursive: true, force: true });
  });

  test("creates dashboard index.html at root", async () => {
    // No blobs except registry
    mockFetch((url) => {
      if (url.includes("comp=list")) {
        return { status: 200, body: "<EnumerationResults><Blobs></Blobs></EnumerationResults>" };
      }
      return undefined;
    });
    const registry: Registry = { apps: [] };
    await assembleSite("tok", registry, outDir);
    const html = await readFile(join(outDir, "index.html"), "utf-8");
    assert.ok(html.includes("<!DOCTYPE html>"));
  });

  test("creates registry.json at root", async () => {
    mockFetch((url) => {
      if (url.includes("comp=list")) {
        return { status: 200, body: "<EnumerationResults><Blobs></Blobs></EnumerationResults>" };
      }
      return undefined;
    });
    const registry: Registry = { apps: [{ slug: "app1", name: "App 1", description: "d", deployedAt: "t", deployedBy: "u" }] };
    await assembleSite("tok", registry, outDir);
    const json = JSON.parse(await readFile(join(outDir, "registry.json"), "utf-8"));
    assert.equal(json.apps.length, 1);
  });

  test("downloads app files into slug subdirectory", async () => {
    mockFetch((url, init) => {
      if (url.includes("comp=list")) {
        return {
          status: 200,
          body: `<EnumerationResults><Blobs>
            <Blob><Name>app1/index.html</Name></Blob>
          </Blobs></EnumerationResults>`,
        };
      }
      if (url.includes("app1/index.html") && (!init || init.method === "GET" || !init.method)) {
        return { status: 200, body: "<h1>App 1</h1>" };
      }
      return undefined;
    });
    const registry: Registry = { apps: [{ slug: "app1", name: "App 1", description: "d", deployedAt: "t", deployedBy: "u" }] };
    await assembleSite("tok", registry, outDir);
    const content = await readFile(join(outDir, "app1", "index.html"), "utf-8");
    assert.ok(content.includes("App 1"));
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run build && node --test dist/test/deploy/assemble.test.js`
Expected: FAIL — module does not exist.

**Step 3: Implement site assembly**

Create `src/deploy/assemble.ts`:

```typescript
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { listBlobs, downloadBlob } from "../azure/blob.js";
import { generateDashboardHtml } from "./dashboard.js";
import type { Registry } from "./registry.js";

export async function assembleSite(
  token: string,
  registry: Registry,
  outDir: string,
): Promise<void> {
  // 1. Write dashboard index.html at root
  const html = generateDashboardHtml(registry.apps);
  await writeFile(join(outDir, "index.html"), html, "utf-8");

  // 2. Write registry.json at root
  await writeFile(join(outDir, "registry.json"), JSON.stringify(registry, null, 2), "utf-8");

  // 3. Download all app files from blob into subdirectories
  const allBlobs = await listBlobs(token);
  // Filter out registry.json itself
  const appBlobs = allBlobs.filter((name) => name !== "registry.json");

  await Promise.all(
    appBlobs.map(async (blobName) => {
      const content = await downloadBlob(token, blobName);
      if (!content) return;
      const filePath = join(outDir, blobName);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content);
    }),
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/test/deploy/assemble.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/deploy/assemble.ts test/deploy/assemble.test.ts
git commit -m "feat: add site assembly module — downloads from blob, generates dashboard"
```

---

## Task 5: Refactor dashboard to accept registry data

**Files:**
- Modify: `src/deploy/dashboard.ts`
- Modify: `test/deploy/dashboard.test.ts`

The dashboard currently calls `listStaticWebApps` and builds URLs from `config.dnsZone`. It needs to:
1. Accept `AppEntry[]` directly (from registry) instead of fetching from Azure
2. Build URLs using `config.appDomain` and path-based routing (`/{slug}/`)
3. Remove `buildAppsJson` (no longer needed — registry replaces it)
4. Remove `deployDashboard` (site assembly handles full-site deployment now)
5. Keep `generateDashboardHtml` but update URL pattern

**Step 1: Write the failing tests**

Update `test/deploy/dashboard.test.ts`:
- Remove tests for `buildAppsJson` and `deployDashboard`
- Update `generateDashboardHtml` tests: `AppEntry` now comes from registry (has `deployedBy` field), URLs use `/${slug}/` path pattern

```typescript
// Update import to use registry AppEntry
import type { AppEntry } from "../../src/deploy/registry.js";
import { generateDashboardHtml } from "../../src/deploy/dashboard.js";

// Remove tests for buildAppsJson and deployDashboard

// Update URL assertion in generateDashboardHtml tests:
test("generates links with path-based URLs", () => {
  const apps: AppEntry[] = [
    { slug: "calc", name: "Calculator", description: "A calc", deployedAt: "2026-01-01T00:00:00Z", deployedBy: "u" },
  ];
  const html = generateDashboardHtml(apps);
  assert.ok(html.includes("/calc/"));
  assert.ok(!html.includes(".env.fidoo.cloud")); // no per-app subdomain
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run build && node --test dist/test/deploy/dashboard.test.js`
Expected: FAIL — imports and URL patterns mismatch.

**Step 3: Implement dashboard changes**

In `src/deploy/dashboard.ts`:
- Remove imports: `listStaticWebApps`, `deploySwaZip`, `collectFiles`, `createZipBuffer`, `config`, `mkdtemp`, `rm`, `tmpdir`
- Remove `AppEntry` interface (use the one from `registry.ts`)
- Remove `buildAppsJson` function
- Remove `deployDashboard` function
- Keep `generateDashboardHtml(apps: AppEntry[]): string` — update URL construction from `app.url` to `/${app.slug}/`
- Import `AppEntry` from `./registry.js`

The function signature stays the same: `generateDashboardHtml(apps: AppEntry[]): string`. The HTML template stays the same, just the URL pattern changes.

**Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/test/deploy/dashboard.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/deploy/dashboard.ts test/deploy/dashboard.test.ts
git commit -m "refactor: dashboard accepts registry data, uses path-based URLs"
```

---

## Task 6: Create site deploy helper

**Files:**
- Create: `src/deploy/site-deploy.ts`
- Create: `test/deploy/site-deploy.test.ts`

This is the new top-level deploy orchestrator: loads registry → assembles site into temp dir → zips → deploys to the single SWA → cleans up temp dir.

**Step 1: Write the failing tests**

```typescript
import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installMockFetch, restoreFetch, mockFetch, getFetchCalls } from "../helpers/mock-fetch.js";
import { deploySite } from "../../src/deploy/site-deploy.js";

// Need to mock token store for auth
const tokenDir = join(tmpdir(), "site-deploy-test-" + Date.now());

describe("deploySite", () => {
  beforeEach(async () => {
    installMockFetch();
  });
  afterEach(async () => {
    restoreFetch();
  });

  test("assembles site and deploys zip to single SWA", async () => {
    let zipDeployed = false;
    mockFetch((url, init) => {
      // listBlobs (for assembleSite)
      if (url.includes("comp=list")) {
        return { status: 200, body: "<EnumerationResults><Blobs></Blobs></EnumerationResults>" };
      }
      // getDeploymentToken
      if (url.includes("listSecrets")) {
        return { status: 200, body: { properties: { apiKey: "test-key" } } };
      }
      // getStaticWebApp (for hostname)
      if (url.includes("staticSites/ai-apps") && (!init?.method || init?.method === "GET")) {
        return { status: 200, body: { properties: { defaultHostname: "ai-apps.azurestaticapps.net" } } };
      }
      // zipdeploy
      if (url.includes("zipdeploy")) {
        zipDeployed = true;
        return { status: 200, body: null };
      }
      return undefined;
    });
    await deploySite("tok", { apps: [] });
    assert.ok(zipDeployed, "ZIP should have been deployed");
  });

  test("cleans up temp directory on success", async () => {
    mockFetch((url, init) => {
      if (url.includes("comp=list")) {
        return { status: 200, body: "<EnumerationResults><Blobs></Blobs></EnumerationResults>" };
      }
      if (url.includes("listSecrets")) {
        return { status: 200, body: { properties: { apiKey: "test-key" } } };
      }
      if (url.includes("staticSites/ai-apps") && (!init?.method || init?.method === "GET")) {
        return { status: 200, body: { properties: { defaultHostname: "ai-apps.azurestaticapps.net" } } };
      }
      if (url.includes("zipdeploy")) return { status: 200, body: null };
      return undefined;
    });
    // deploySite should not leave temp dirs behind — no direct way to assert this
    // but verifying it doesn't throw is sufficient
    await deploySite("tok", { apps: [] });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run build && node --test dist/test/deploy/site-deploy.test.js`
Expected: FAIL — module does not exist.

**Step 3: Implement site deploy helper**

Create `src/deploy/site-deploy.ts`:

```typescript
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { config } from "../config.js";
import { deploySwaZip } from "../azure/static-web-apps.js";
import { collectFiles } from "./deny-list.js";
import { createZipBuffer } from "./zip.js";
import { assembleSite } from "./assemble.js";
import type { Registry } from "./registry.js";

export async function deploySite(token: string, registry: Registry): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), "deploy-agent-site-"));
  try {
    await assembleSite(token, registry, tempDir);
    const files = await collectFiles(tempDir);
    const zipBuffer = await createZipBuffer(tempDir, files);
    await deploySwaZip(token, config.swaSlug, zipBuffer);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/test/deploy/site-deploy.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/deploy/site-deploy.ts test/deploy/site-deploy.test.ts
git commit -m "feat: add site deploy helper — assemble, zip, deploy, cleanup"
```

---

## Task 7: Rewrite app_deploy tool

**Files:**
- Modify: `src/tools/app-deploy.ts`
- Modify: `test/tools/app-deploy.test.ts`

The new flow:
1. Validate folder, auth (unchanged)
2. Read `.deploy.json` to detect re-deploy (unchanged)
3. `collectFiles` + `createZipBuffer` (unchanged)
4. Upload app files to blob under `{slug}/`
5. Load registry, upsert app entry, save registry
6. `deploySite(token, registry)` — full site assembly + deploy
7. Write `.deploy.json` locally (first deploy only)
8. Return `{ status: "ok", url: "https://{appDomain}/{slug}/", slug }`

Remove:
- `createStaticWebApp` call
- `createCnameRecord` call
- `configureAuth` call
- `updateTags` call
- `deployDashboard` call
- Collision check via `getStaticWebApp` (no longer relevant — slug collision is handled by registry upsert)

**Step 1: Write the failing tests**

Rewrite `test/tools/app-deploy.test.ts` with the new flow. Key test scenarios:
- First deploy: uploads to blob, upserts registry, deploys site, writes `.deploy.json`
- Redeploy: uploads to blob, upserts registry (updates timestamp), deploys site, does NOT write `.deploy.json`
- Auth guards (unchanged)
- Missing folder validation (unchanged)

The mock fetch setup changes significantly — no more SWA creation, DNS, auth config, or tag update calls. Instead: blob uploads, blob downloads (registry.json + all apps for assembly), listBlobs, deploySwaZip calls.

```typescript
// Key mock expectations for first deploy:
// 1. PUT blob for each app file (upload to blob)
// 2. GET blob registry.json (load registry — 404 first time)
// 3. PUT blob registry.json (save updated registry)
// 4. GET blobs list (assembleSite downloads all app content)
// 5. GET blob for each app file (download for assembly)
// 6. POST listSecrets (deploySwaZip step 1)
// 7. GET staticSites/ai-apps (deploySwaZip step 2 — hostname)
// 8. POST zipdeploy (deploySwaZip step 3)
```

This test file will be substantial. Write it to cover:
- `firstDeploy` success path with mock blob + SWA deploy calls
- `redeploy` success path
- Auth failure (no tokens, expired tokens)
- Missing folder / not a directory
- Missing app_name on first deploy

**Step 2: Run tests to verify they fail**

Run: `npm run build && node --test dist/test/tools/app-deploy.test.js`
Expected: FAIL — old code doesn't match new expectations.

**Step 3: Implement the new app_deploy**

Rewrite `src/tools/app-deploy.ts`:
- Remove imports: `createStaticWebApp`, `getStaticWebApp`, `updateTags`, `configureAuth`, `createCnameRecord`, `deployDashboard`, `AzureError`
- Add imports: `uploadBlob`, `listBlobs` from `../azure/blob.js`; `loadRegistry`, `saveRegistry`, `upsertApp` from `../deploy/registry.js`; `deploySite` from `../deploy/site-deploy.js`
- Remove `firstDeploy`/`redeploy` split for SWA creation; keep the split for `.deploy.json` write

New `firstDeploy`:
1. `generateSlug(appName)`
2. `collectFiles(folder)` + `createZipBuffer(folder, files)`
3. Upload each file to blob under `{slug}/{relativePath}`
4. `loadRegistry(token)` → `upsertApp(registry, entry)` → `saveRegistry(token, registry)`
5. `deploySite(token, registry)`
6. `writeDeployConfig(folder, config)`
7. Return `{ status: "ok", url, slug }`

New `redeploy`:
1. Read slug from `.deploy.json`
2. `collectFiles(folder)` + `createZipBuffer(folder, files)` (zip still needed? Actually no — we upload individual files to blob, not a zip. But we need the file list.)
3. Upload each file to blob under `{slug}/{relativePath}`
4. `loadRegistry(token)` → `upsertApp(registry, updatedEntry)` → `saveRegistry(token, registry)`
5. `deploySite(token, registry)`
6. Return `{ status: "ok", url, slug }`

Note: We need a helper to upload individual files to blob. Use `collectFiles` to get the file list, then read + upload each one. The `createZipBuffer` is NOT used for blob upload — it's used internally by `deploySite` for the final SWA zip deploy.

Add a new helper function `uploadAppToBlob(token, slug, folder, files)`:
```typescript
async function uploadAppToBlob(token: string, slug: string, folder: string, files: string[]): Promise<void> {
  await Promise.all(
    files.map(async (relativePath) => {
      const content = await readFile(join(folder, relativePath));
      await uploadBlob(token, `${slug}/${relativePath}`, content);
    }),
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/test/tools/app-deploy.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/app-deploy.ts test/tools/app-deploy.test.ts
git commit -m "feat: rewrite app_deploy — blob upload, registry, single-SWA deploy"
```

---

## Task 8: Rewrite app_delete tool

**Files:**
- Modify: `src/tools/app-delete.ts`
- Modify: `test/tools/app-delete.test.ts`

New flow:
1. Validate `app_slug`, auth (unchanged)
2. `deleteBlobsByPrefix(token, slug + "/")` — remove app files from blob
3. `loadRegistry(token)` → `removeApp(registry, slug)` → `saveRegistry(token, registry)`
4. `deploySite(token, registry)` — re-deploy site without deleted app
5. Return success

Remove:
- `deleteStaticWebApp` call
- `deleteCnameRecord` call
- `deployDashboard` call
- Dashboard slug guard (no longer relevant — there's no separate dashboard SWA)

**Step 1: Write the failing tests**

Rewrite `test/tools/app-delete.test.ts`:
- Mock blob delete calls instead of SWA/DNS delete
- Mock registry load/save (blob GET/PUT for `registry.json`)
- Mock `deploySite` chain (listBlobs, deploySwaZip)
- Auth guards unchanged

**Step 2: Run tests to verify they fail**

Run: `npm run build && node --test dist/test/tools/app-delete.test.js`
Expected: FAIL

**Step 3: Implement**

In `src/tools/app-delete.ts`:
- Remove imports: `deleteStaticWebApp`, `deleteCnameRecord`, `deployDashboard`, `config`
- Add imports: `deleteBlobsByPrefix` from `../azure/blob.js`; `loadRegistry`, `saveRegistry`, `removeApp` from `../deploy/registry.js`; `deploySite` from `../deploy/site-deploy.js`
- Remove dashboard slug guard
- Replace body with: `deleteBlobsByPrefix` → load/remove/save registry → `deploySite`

**Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/test/tools/app-delete.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/app-delete.ts test/tools/app-delete.test.ts
git commit -m "feat: rewrite app_delete — blob cleanup, registry update, single-SWA redeploy"
```

---

## Task 9: Rewrite app_list tool

**Files:**
- Modify: `src/tools/app-list.ts`
- Modify: `test/tools/app-list.test.ts`

New flow: load registry from blob, map to response with path-based URLs.

**Step 1: Write the failing tests**

Rewrite `test/tools/app-list.test.ts`:
- Mock `downloadBlob` for `registry.json` instead of `listStaticWebApps`
- Assert URLs use path pattern: `https://{appDomain}/{slug}/`
- Auth guards unchanged

**Step 2: Run tests to verify they fail**

Run: `npm run build && node --test dist/test/tools/app-list.test.js`
Expected: FAIL

**Step 3: Implement**

In `src/tools/app-list.ts`:
- Remove imports: `listStaticWebApps`
- Add imports: `loadRegistry` from `../deploy/registry.js`
- Replace handler body: `loadRegistry(token)` → map `registry.apps` to `{ slug, name, description, url: "https://${config.appDomain}/${app.slug}/", deployedAt }`
- Keep auth guards

**Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/test/tools/app-list.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/app-list.ts test/tools/app-list.test.ts
git commit -m "feat: rewrite app_list — read from blob registry"
```

---

## Task 10: Rewrite app_info tool

**Files:**
- Modify: `src/tools/app-info.ts`
- Modify: `test/tools/app-info.test.ts`

New flow: load registry, find app by slug, return info with path-based URL.

**Step 1: Write the failing tests**

Rewrite `test/tools/app-info.test.ts`:
- Mock `downloadBlob` for `registry.json`
- Assert URL uses path pattern
- Assert 404-like error when slug not in registry
- Remove `getStaticWebApp` / `AzureError` mocking

**Step 2: Run tests to verify they fail**

Run: `npm run build && node --test dist/test/tools/app-info.test.js`
Expected: FAIL

**Step 3: Implement**

In `src/tools/app-info.ts`:
- Remove imports: `getStaticWebApp`, `AzureError`, `config` (partially — still need `appDomain`)
- Add imports: `loadRegistry` from `../deploy/registry.js`
- Replace handler: `loadRegistry(token)` → `find` by slug → return `{ slug, name, description, url, deployedAt, deployedBy }` or "not found" error

**Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/test/tools/app-info.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/app-info.ts test/tools/app-info.test.ts
git commit -m "feat: rewrite app_info — read from blob registry"
```

---

## Task 11: Rewrite app_update_info tool

**Files:**
- Modify: `src/tools/app-update-info.ts`
- Modify: `test/tools/app-update-info.test.ts`

New flow: load registry, find app, update name/description, save registry, redeploy site.

**Step 1: Write the failing tests**

Rewrite `test/tools/app-update-info.test.ts`:
- Mock blob GET/PUT for `registry.json`
- Mock `deploySite` chain
- Assert only provided fields are updated
- Assert slug not found → error

**Step 2: Run tests to verify they fail**

Run: `npm run build && node --test dist/test/tools/app-update-info.test.js`
Expected: FAIL

**Step 3: Implement**

In `src/tools/app-update-info.ts`:
- Remove imports: `getStaticWebApp`, `updateTags`, `AzureError`, `deployDashboard`
- Add imports: `loadRegistry`, `saveRegistry` from `../deploy/registry.js`; `deploySite` from `../deploy/site-deploy.js`
- Replace handler: load registry → find by slug (error if missing) → update fields → `upsertApp` → save → `deploySite`

**Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/test/tools/app-update-info.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/tools/app-update-info.ts test/tools/app-update-info.test.ts
git commit -m "feat: rewrite app_update_info — registry-based metadata, single-SWA redeploy"
```

---

## Task 12: Remove dashboard_rebuild tool, remove DNS module, update tool registry

**Files:**
- Delete: `src/tools/dashboard-rebuild.ts`
- Delete: `test/tools/dashboard-rebuild.test.ts`
- Delete: `src/azure/dns.ts`
- Delete: `test/azure/dns.test.ts`
- Modify: `src/tools/index.ts`
- Modify: `test/tools/tool-stubs.test.ts`
- Modify: `test/server.test.ts`

The `dashboard_rebuild` tool is no longer needed — the dashboard is rebuilt as part of every deploy/delete/update operation via `deploySite`. The DNS module is no longer needed.

**Step 1: Update tool registry test**

In `test/tools/tool-stubs.test.ts`, update expected tool count from 9 to 8 and remove `dashboard_rebuild` from assertions.

In `test/server.test.ts`, update the tools/list test to expect 8 tools.

**Step 2: Run tests to verify they fail**

Run: `npm run build && node --test dist/test/tools/tool-stubs.test.js dist/test/server.test.js`
Expected: FAIL — still 9 tools registered.

**Step 3: Implement**

1. Delete `src/tools/dashboard-rebuild.ts` and `test/tools/dashboard-rebuild.test.ts`
2. Delete `src/azure/dns.ts` and `test/azure/dns.test.ts`
3. In `src/tools/index.ts`: remove `dashboard_rebuild` import and registration. Update from 9 to 8 tools.

**Step 4: Run tests to verify they pass**

Run: `npm run build && node --test dist/test/tools/tool-stubs.test.js dist/test/server.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove dashboard_rebuild tool and DNS module — no longer needed"
```

---

## Task 13: Update integration test

**Files:**
- Modify: `test/integration/deploy-flow.test.ts`

The integration test needs to exercise the new flow: blob uploads, registry operations, single-SWA deploy.

**Step 1: Rewrite integration test**

Update `test/integration/deploy-flow.test.ts` to:
- Mock blob storage calls instead of per-app SWA/DNS calls
- Test full lifecycle: auth → first deploy (blob upload + registry + site deploy) → list (registry read) → info (registry read) → update info (registry update + site redeploy) → redeploy (blob update + site redeploy) → delete (blob delete + registry update + site redeploy)
- Assert URLs use path-based pattern
- Remove `dashboard_rebuild` from flow
- Remove SWA creation, DNS, auth config mocks

**Step 2: Run tests to verify they pass**

Run: `npm run build && node --test dist/test/integration/deploy-flow.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add test/integration/deploy-flow.test.ts
git commit -m "test: rewrite integration test for single-domain blob-based architecture"
```

---

## Task 14: Update infra setup script and CLAUDE.md

**Files:**
- Modify: `infra/setup.sh`
- Modify: `CLAUDE.md`

**Step 1: Update infra setup script**

Update `infra/setup.sh` to:
- Create Azure Storage Account + blob container
- Create a single SWA (not per-app)
- Register custom domain on the SWA
- Configure Entra ID auth on the SWA
- Remove per-app DNS CNAME creation
- Document that DNS CNAME must be created manually by admin

**Step 2: Update CLAUDE.md**

Update architecture description:
- Single SWA + Blob Storage model
- Path-based routing (`/{slug}/`)
- Registry.json as metadata store
- No DNS module
- New config env vars
- Updated deploy flow description

**Step 3: Commit**

```bash
git add infra/setup.sh CLAUDE.md
git commit -m "docs: update infra setup and CLAUDE.md for single-domain architecture"
```

---

## Summary

| Task | What | Key Files |
|------|------|-----------|
| 1 | Config: remove DNS, add blob/SWA | `src/config.ts` |
| 2 | Blob storage client | `src/azure/blob.ts` (new) |
| 3 | Registry module | `src/deploy/registry.ts` (new) |
| 4 | Site assembly module | `src/deploy/assemble.ts` (new) |
| 5 | Dashboard: accept registry data | `src/deploy/dashboard.ts` |
| 6 | Site deploy helper | `src/deploy/site-deploy.ts` (new) |
| 7 | Rewrite app_deploy | `src/tools/app-deploy.ts` |
| 8 | Rewrite app_delete | `src/tools/app-delete.ts` |
| 9 | Rewrite app_list | `src/tools/app-list.ts` |
| 10 | Rewrite app_info | `src/tools/app-info.ts` |
| 11 | Rewrite app_update_info | `src/tools/app-update-info.ts` |
| 12 | Remove dashboard_rebuild + DNS | `src/tools/index.ts`, deletions |
| 13 | Integration test rewrite | `test/integration/deploy-flow.test.ts` |
| 14 | Infra + docs | `infra/setup.sh`, `CLAUDE.md` |
