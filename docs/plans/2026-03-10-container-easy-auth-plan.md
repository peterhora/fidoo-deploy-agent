# Container Easy Auth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically configure Entra ID Easy Auth on every deployed container app, including
automated redirect URI registration via a dedicated Graph service principal.

**Architecture:** Three new pieces wire together — a Graph token module (client credentials flow),
redirect URI helpers (Graph PATCH), and a `removeEasyAuth()` cleanup function. They slot into the
existing `configureEasyAuth()` (called from `container_deploy`) and a new `removeEasyAuth()` call
in `container_delete`. A dedicated Graph SP with `Application.ReadWrite.OwnedBy` keeps the user's
device-code token unprivileged.

**Tech Stack:** TypeScript ESM, Node.js 22, `node:crypto` for HMAC, `node:test` + `node:assert/strict`
for tests. Zero new runtime deps. All HTTP via global `fetch`.

---

## Prerequisites

This plan builds on the merged `feat/container-easy-auth` PR. All tasks below assume those files
are on the working branch. Verify before starting:

```bash
ls src/azure/container-apps.ts src/tools/container-delete.ts src/tools/container-deploy.ts
```

Expected: all three files exist.

---

## Task 1: Add config fields

**Files:**
- Modify: `src/config.ts`
- Modify: `test/config.test.ts`

### Step 1: Write failing tests

Add to `test/config.test.ts`:

```typescript
it("portalObjectId defaults to empty string", () => {
  delete process.env.DEPLOY_AGENT_PORTAL_OBJECT_ID;
  const c = buildConfig();
  assert.equal(c.portalObjectId, "");
});

it("graphSpClientId defaults to empty string", () => {
  delete process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_ID;
  const c = buildConfig();
  assert.equal(c.graphSpClientId, "");
});

it("graphSpClientSecret defaults to empty string", () => {
  delete process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET;
  const c = buildConfig();
  assert.equal(c.graphSpClientSecret, "");
});

it("reads portalObjectId from env", () => {
  process.env.DEPLOY_AGENT_PORTAL_OBJECT_ID = "obj-123";
  const c = buildConfig();
  assert.equal(c.portalObjectId, "obj-123");
  delete process.env.DEPLOY_AGENT_PORTAL_OBJECT_ID;
});
```

### Step 2: Run tests — verify they fail

```bash
npm run build && node --test dist/test/config.test.js
```

Expected: `TypeError: c.portalObjectId is not defined` (or similar property access error).

### Step 3: Add fields to `src/config.ts`

In the `buildConfig()` return object, after the `portalClientSecret` line:

```typescript
portalObjectId:     process.env.DEPLOY_AGENT_PORTAL_OBJECT_ID       ?? "",
graphSpClientId:    process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_ID      ?? "",
graphSpClientSecret: process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET ?? "",
```

### Step 4: Run tests — verify they pass

```bash
npm run build && node --test dist/test/config.test.js
```

Expected: all pass.

### Step 5: Update CLAUDE.md config table

Add three rows to the config table in `CLAUDE.md`:

```
| `DEPLOY_AGENT_PORTAL_OBJECT_ID` | Deploy Portal AAD app object ID (for Graph PATCH) | (required for Easy Auth) |
| `DEPLOY_AGENT_GRAPH_SP_CLIENT_ID` | Graph SP client ID | (required for Easy Auth) |
| `DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET` | Graph SP client secret | (required for Easy Auth) |
```

### Step 6: Commit

```bash
git add src/config.ts test/config.test.ts CLAUDE.md
git commit -m "feat(config): add portalObjectId and Graph SP credentials"
```

---

## Task 2: Graph token module

Acquires a Microsoft Graph access token using the Graph SP's client credentials. This is a simple
`client_credentials` POST — no user interaction.

**Files:**
- Create: `src/auth/graph-token.ts`
- Create: `test/auth/graph-token.test.ts`

### Step 1: Write failing tests

Create `test/auth/graph-token.test.ts`:

```typescript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installMockFetch, restoreFetch, getFetchCalls, mockFetchOnce } from "../helpers/mock-fetch.js";
import { acquireGraphToken } from "../../src/auth/graph-token.js";

describe("acquireGraphToken", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("POSTs to the tenant token endpoint", async () => {
    process.env.DEPLOY_AGENT_TENANT_ID      = "tenant-abc";
    process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_ID     = "sp-client-id";
    process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET = "sp-secret";

    mockFetchOnce({ status: 200, body: { access_token: "graph-token-xyz" } });

    await acquireGraphToken();

    const [call] = getFetchCalls();
    assert.ok(call.url.includes("tenant-abc"));
    assert.ok(call.url.includes("oauth2/v2.0/token"));
    assert.equal((call.init as RequestInit).method, "POST");

    delete process.env.DEPLOY_AGENT_TENANT_ID;
    delete process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_ID;
    delete process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET;
  });

  it("sends correct client_credentials form body", async () => {
    process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_ID     = "my-sp-id";
    process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET = "my-sp-secret";

    mockFetchOnce({ status: 200, body: { access_token: "tok" } });

    await acquireGraphToken();

    const [call] = getFetchCalls();
    const body = (call.init as RequestInit).body as string;
    assert.ok(body.includes("grant_type=client_credentials"));
    assert.ok(body.includes("my-sp-id"));
    assert.ok(body.includes("my-sp-secret"));
    assert.ok(body.includes(encodeURIComponent("https://graph.microsoft.com/.default")));

    delete process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_ID;
    delete process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET;
  });

  it("returns the access_token string", async () => {
    process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_ID     = "id";
    process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET = "secret";

    mockFetchOnce({ status: 200, body: { access_token: "returned-token" } });

    const token = await acquireGraphToken();
    assert.equal(token, "returned-token");

    delete process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_ID;
    delete process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET;
  });

  it("throws on non-200 response", async () => {
    process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_ID     = "id";
    process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET = "secret";

    mockFetchOnce({ status: 400, body: { error: "invalid_client" } });

    await assert.rejects(acquireGraphToken(), /Graph token/);

    delete process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_ID;
    delete process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET;
  });
});
```

### Step 2: Run tests — verify they fail

```bash
npm run build 2>&1 | grep -i error; node --test dist/test/auth/graph-token.test.js
```

Expected: compile error — `acquireGraphToken` not found.

### Step 3: Implement `src/auth/graph-token.ts`

```typescript
import { config } from "../config.js";

/**
 * Acquire a Microsoft Graph access token for the Graph SP using
 * client credentials flow. No user interaction required.
 */
export async function acquireGraphToken(): Promise<string> {
  const url = `${config.entraBaseUrl}/${config.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.graphSpClientId,
    client_secret: config.graphSpClientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Graph token acquisition failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as { access_token: string };
  return data.access_token;
}
```

### Step 4: Run tests — verify they pass

```bash
npm run build && node --test dist/test/auth/graph-token.test.js
```

Expected: 4 passing.

### Step 5: Commit

```bash
git add src/auth/graph-token.ts test/auth/graph-token.test.ts
git commit -m "feat(auth): add Graph SP client credentials token acquisition"
```

---

## Task 3: Redirect URI helpers

Two functions that read and patch the Deploy Portal app registration's redirect URI list.

**Files:**
- Modify: `src/azure/container-apps.ts` (add `addRedirectUri` and `removeRedirectUri`)
- Create: `test/azure/container-apps.test.ts`

The redirect URI for a given slug is always:
`https://{slug}.{config.containerDomain}/.auth/login/aad/callback`

Both functions:
1. GET `https://graph.microsoft.com/v1.0/applications/{portalObjectId}` to read current list
2. PATCH same URL with updated list

### Step 1: Write failing tests

Create `test/azure/container-apps.test.ts`:

```typescript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  installMockFetch,
  restoreFetch,
  getFetchCalls,
  mockFetch,
} from "../helpers/mock-fetch.js";
import { addRedirectUri, removeRedirectUri } from "../../src/azure/container-apps.js";

const GRAPH_APP_URL = "https://graph.microsoft.com/v1.0/applications/portal-obj-id";

function setupEnv() {
  process.env.DEPLOY_AGENT_PORTAL_OBJECT_ID = "portal-obj-id";
  process.env.DEPLOY_AGENT_CONTAINER_DOMAIN = "api.env.fidoo.cloud";
}

function cleanEnv() {
  delete process.env.DEPLOY_AGENT_PORTAL_OBJECT_ID;
  delete process.env.DEPLOY_AGENT_CONTAINER_DOMAIN;
}

describe("addRedirectUri", () => {
  beforeEach(() => { installMockFetch(); setupEnv(); });
  afterEach(() => { restoreFetch(); cleanEnv(); });

  it("GETs existing URIs then PATCHes with new URI appended", async () => {
    const existing = ["https://existing.example.com/.auth/login/aad/callback"];
    mockFetch((url, init) => {
      if (url.includes("portal-obj-id") && (!init?.method || init.method === "GET"))
        return { status: 200, body: { web: { redirectUris: existing } } };
      if (url.includes("portal-obj-id") && init?.method === "PATCH")
        return { status: 200, body: {} };
      return undefined;
    });

    await addRedirectUri("graph-token", "my-app");

    const calls = getFetchCalls();
    const patch = calls.find((c) => c.init?.method === "PATCH");
    assert.ok(patch, "PATCH call expected");
    const body = JSON.parse(patch!.init!.body as string);
    assert.ok(
      body.web.redirectUris.includes(
        "https://my-app.api.env.fidoo.cloud/.auth/login/aad/callback",
      ),
    );
    assert.ok(body.web.redirectUris.includes("https://existing.example.com/.auth/login/aad/callback"));
  });

  it("does not duplicate an existing redirect URI", async () => {
    const uri = "https://my-app.api.env.fidoo.cloud/.auth/login/aad/callback";
    mockFetch((url, init) => {
      if (url.includes("portal-obj-id") && (!init?.method || init.method === "GET"))
        return { status: 200, body: { web: { redirectUris: [uri] } } };
      if (url.includes("portal-obj-id") && init?.method === "PATCH")
        return { status: 200, body: {} };
      return undefined;
    });

    await addRedirectUri("graph-token", "my-app");

    const calls = getFetchCalls();
    const patch = calls.find((c) => c.init?.method === "PATCH");
    assert.ok(patch);
    const body = JSON.parse(patch!.init!.body as string);
    assert.equal(body.web.redirectUris.filter((u: string) => u === uri).length, 1);
  });

  it("uses Bearer token in Authorization header", async () => {
    mockFetch((url, init) => {
      if (url.includes("portal-obj-id") && (!init?.method || init.method === "GET"))
        return { status: 200, body: { web: { redirectUris: [] } } };
      if (url.includes("portal-obj-id") && init?.method === "PATCH")
        return { status: 200, body: {} };
      return undefined;
    });

    await addRedirectUri("my-graph-token", "slug");

    const calls = getFetchCalls();
    for (const call of calls) {
      const auth = (call.init?.headers as Record<string, string>)?.["Authorization"];
      assert.ok(auth?.includes("my-graph-token"), "Bearer token must be used");
    }
  });
});

describe("removeRedirectUri", () => {
  beforeEach(() => { installMockFetch(); setupEnv(); });
  afterEach(() => { restoreFetch(); cleanEnv(); });

  it("removes the target URI and PATCHes the remaining list", async () => {
    const target = "https://my-app.api.env.fidoo.cloud/.auth/login/aad/callback";
    const other  = "https://other.api.env.fidoo.cloud/.auth/login/aad/callback";
    mockFetch((url, init) => {
      if (url.includes("portal-obj-id") && (!init?.method || init.method === "GET"))
        return { status: 200, body: { web: { redirectUris: [target, other] } } };
      if (url.includes("portal-obj-id") && init?.method === "PATCH")
        return { status: 200, body: {} };
      return undefined;
    });

    await removeRedirectUri("graph-token", "my-app");

    const patch = getFetchCalls().find((c) => c.init?.method === "PATCH");
    assert.ok(patch);
    const body = JSON.parse(patch!.init!.body as string);
    assert.ok(!body.web.redirectUris.includes(target), "target URI must be removed");
    assert.ok(body.web.redirectUris.includes(other), "other URIs must remain");
  });

  it("is a no-op when the URI is not in the list", async () => {
    mockFetch((url, init) => {
      if (url.includes("portal-obj-id") && (!init?.method || init.method === "GET"))
        return { status: 200, body: { web: { redirectUris: [] } } };
      if (url.includes("portal-obj-id") && init?.method === "PATCH")
        return { status: 200, body: {} };
      return undefined;
    });

    // Should not throw
    await removeRedirectUri("graph-token", "nonexistent-app");
  });
});
```

### Step 2: Run tests — verify they fail

```bash
npm run build 2>&1 | grep error; node --test dist/test/azure/container-apps.test.js
```

Expected: compile error — `addRedirectUri` and `removeRedirectUri` not exported.

### Step 3: Add helpers to `src/azure/container-apps.ts`

Add these two exported functions at the bottom of the file, before `deleteContainerApp`:

```typescript
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

function graphHeaders(graphToken: string): Record<string, string> {
  return { Authorization: `Bearer ${graphToken}`, "Content-Type": "application/json" };
}

function redirectUri(slug: string): string {
  return `https://${slug}.${config.containerDomain}/.auth/login/aad/callback`;
}

async function getRedirectUris(graphToken: string): Promise<string[]> {
  const url = `${GRAPH_BASE}/applications/${config.portalObjectId}`;
  const res = await fetch(url, { headers: graphHeaders(graphToken) });
  if (!res.ok) throw new Error(`Graph GET app failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { web: { redirectUris: string[] } };
  return data.web?.redirectUris ?? [];
}

async function patchRedirectUris(graphToken: string, uris: string[]): Promise<void> {
  const url = `${GRAPH_BASE}/applications/${config.portalObjectId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: graphHeaders(graphToken),
    body: JSON.stringify({ web: { redirectUris: uris } }),
  });
  if (!res.ok) throw new Error(`Graph PATCH redirectUris failed: ${res.status} ${await res.text()}`);
}

export async function addRedirectUri(graphToken: string, slug: string): Promise<void> {
  const uri = redirectUri(slug);
  const existing = await getRedirectUris(graphToken);
  if (existing.includes(uri)) return; // idempotent
  await patchRedirectUris(graphToken, [...existing, uri]);
}

export async function removeRedirectUri(graphToken: string, slug: string): Promise<void> {
  const uri = redirectUri(slug);
  const existing = await getRedirectUris(graphToken);
  if (!existing.includes(uri)) return; // nothing to remove
  await patchRedirectUris(graphToken, existing.filter((u) => u !== uri));
}
```

### Step 4: Run tests — verify they pass

```bash
npm run build && node --test dist/test/azure/container-apps.test.js
```

Expected: all tests pass.

### Step 5: Commit

```bash
git add src/azure/container-apps.ts test/azure/container-apps.test.ts
git commit -m "feat(azure): add Graph redirect URI helpers for Easy Auth"
```

---

## Task 4: Wire `configureEasyAuth` and add `removeEasyAuth`

Update `configureEasyAuth()` to call `addRedirectUri()` before the ARM authConfigs step.
Add new `removeEasyAuth()` exported function for the delete flow.

**Files:**
- Modify: `src/azure/container-apps.ts`
- Modify: `src/auth/graph-token.ts` (import side — no change)
- Modify: `test/azure/container-apps.test.ts` (add new test suite)

### Step 1: Write failing tests

Add to `test/azure/container-apps.test.ts`:

```typescript
import { acquireGraphToken } from "../../src/auth/graph-token.js";
// Note: acquireGraphToken is called internally — we mock the token endpoint.

describe("configureEasyAuth", () => {
  beforeEach(() => { installMockFetch(); setupEnv(); });
  afterEach(() => { restoreFetch(); cleanEnv(); });

  it("is skipped when portalClientId is not set", async () => {
    delete process.env.DEPLOY_AGENT_PORTAL_CLIENT_ID;
    const { configureEasyAuth } = await import("../../src/azure/container-apps.js");
    await configureEasyAuth("arm-token", "my-app");
    assert.equal(getFetchCalls().length, 0, "no fetch calls when not configured");
  });

  it("calls Graph token endpoint, adds redirect URI, patches app secret, puts authConfigs", async () => {
    process.env.DEPLOY_AGENT_PORTAL_CLIENT_ID     = "portal-client";
    process.env.DEPLOY_AGENT_PORTAL_CLIENT_SECRET = "portal-secret";
    process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_ID     = "graph-sp-id";
    process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET = "graph-sp-secret";
    process.env.DEPLOY_AGENT_PORTAL_OBJECT_ID = "portal-obj-id";

    mockFetch((url, init) => {
      // 1. Graph token endpoint
      if (url.includes("oauth2/v2.0/token"))
        return { status: 200, body: { access_token: "graph-tok" } };
      // 2. Graph GET app (redirect URIs)
      if (url.includes("graph.microsoft.com") && (!init?.method || init.method === "GET"))
        return { status: 200, body: { web: { redirectUris: [] } } };
      // 3. Graph PATCH (redirect URIs)
      if (url.includes("graph.microsoft.com") && init?.method === "PATCH")
        return { status: 200, body: {} };
      // 4. ARM GET Container App (secrets)
      if (url.includes("containerApps") && (!init?.method || init.method === "GET"))
        return { status: 200, body: { properties: { configuration: { secrets: [] } } } };
      // 5. ARM PATCH Container App (add secret)
      if (url.includes("containerApps") && init?.method === "PATCH")
        return { status: 200, body: {} };
      // 6. ARM PUT authConfigs
      if (url.includes("authConfigs") && init?.method === "PUT")
        return { status: 200, body: {} };
      return undefined;
    });

    const { configureEasyAuth } = await import("../../src/azure/container-apps.js");
    await configureEasyAuth("arm-token", "my-app");

    const calls = getFetchCalls();
    const urls = calls.map((c) => c.url);
    assert.ok(urls.some((u) => u.includes("oauth2/v2.0/token")), "Graph token call expected");
    assert.ok(urls.some((u) => u.includes("graph.microsoft.com")), "Graph redirect URI call expected");
    assert.ok(urls.some((u) => u.includes("authConfigs")), "authConfigs PUT expected");

    delete process.env.DEPLOY_AGENT_PORTAL_CLIENT_ID;
    delete process.env.DEPLOY_AGENT_PORTAL_CLIENT_SECRET;
    delete process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_ID;
    delete process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET;
    delete process.env.DEPLOY_AGENT_PORTAL_OBJECT_ID;
  });
});

describe("removeEasyAuth", () => {
  beforeEach(() => { installMockFetch(); setupEnv(); });
  afterEach(() => { restoreFetch(); cleanEnv(); });

  it("is skipped when graphSpClientId is not set", async () => {
    delete process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_ID;
    const { removeEasyAuth } = await import("../../src/azure/container-apps.js");
    await removeEasyAuth("my-app");
    assert.equal(getFetchCalls().length, 0);
  });

  it("acquires Graph token and removes redirect URI", async () => {
    process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_ID     = "graph-sp-id";
    process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET = "graph-sp-secret";
    process.env.DEPLOY_AGENT_PORTAL_OBJECT_ID = "portal-obj-id";
    const uri = "https://my-app.api.env.fidoo.cloud/.auth/login/aad/callback";

    mockFetch((url, init) => {
      if (url.includes("oauth2/v2.0/token"))
        return { status: 200, body: { access_token: "graph-tok" } };
      if (url.includes("graph.microsoft.com") && (!init?.method || init.method === "GET"))
        return { status: 200, body: { web: { redirectUris: [uri] } } };
      if (url.includes("graph.microsoft.com") && init?.method === "PATCH")
        return { status: 200, body: {} };
      return undefined;
    });

    const { removeEasyAuth } = await import("../../src/azure/container-apps.js");
    await removeEasyAuth("my-app");

    const patch = getFetchCalls().find((c) => c.init?.method === "PATCH");
    assert.ok(patch, "PATCH call expected");
    const body = JSON.parse(patch!.init!.body as string);
    assert.ok(!body.web.redirectUris.includes(uri), "redirect URI must be removed");

    delete process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_ID;
    delete process.env.DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET;
    delete process.env.DEPLOY_AGENT_PORTAL_OBJECT_ID;
  });
});
```

### Step 2: Run tests — verify they fail

```bash
npm run build 2>&1 | grep error; node --test dist/test/azure/container-apps.test.js
```

Expected: `removeEasyAuth` not exported; `configureEasyAuth` test fails (no Graph calls).

### Step 3: Update `configureEasyAuth` and add `removeEasyAuth`

At the top of `src/azure/container-apps.ts` add the import:

```typescript
import { acquireGraphToken } from "../auth/graph-token.js";
```

Replace the existing `configureEasyAuth` function body — add the Graph steps before the existing ARM secret injection:

```typescript
export async function configureEasyAuth(token: string, slug: string): Promise<void> {
  if (!config.portalClientId || !config.portalClientSecret) return;
  if (!config.graphSpClientId || !config.portalObjectId) return;

  // 1. Acquire Graph token via client credentials
  const graphToken = await acquireGraphToken();

  // 2. Register redirect URI on Deploy Portal app registration
  await addRedirectUri(graphToken, slug);

  // 3. Inject portal client secret into Container App secrets
  const appUrl = `${config.armBaseUrl}/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.App/containerApps/${slug}?api-version=${CA_API}`;
  const appRes = await fetch(appUrl, { headers: h(token) });
  if (!appRes.ok) {
    throw new Error(`Easy Auth: failed to read Container App: ${appRes.status} ${await appRes.text()}`);
  }
  const appData = await appRes.json() as {
    properties: { configuration: { secrets: { name: string; value: string }[] } };
  };
  const existingSecrets = appData.properties.configuration.secrets ?? [];
  if (!existingSecrets.some((s: { name: string }) => s.name === "portal-client-secret")) {
    existingSecrets.push({ name: "portal-client-secret", value: config.portalClientSecret });
    await fetch(appUrl, {
      method: "PATCH",
      headers: h(token),
      body: JSON.stringify({
        properties: { configuration: { secrets: existingSecrets } },
      }),
    });
  }

  // 4. Configure authConfigs/current
  const authUrl = `${config.armBaseUrl}/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.App/containerApps/${slug}/authConfigs/current?api-version=${CA_API}`;
  const body = {
    properties: {
      platform: { enabled: true },
      globalValidation: {
        unauthenticatedClientAction: "RedirectToLoginPage",
        redirectToProvider: "azureactivedirectory",
      },
      identityProviders: {
        azureActiveDirectory: {
          registration: {
            openIdIssuerUrl: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
            clientId: config.portalClientId,
            clientSecretSettingName: "portal-client-secret",
          },
          validation: {
            allowedAudiences: [config.portalClientId],
          },
        },
      },
    },
  };

  const res = await fetch(authUrl, {
    method: "PUT",
    headers: h(token),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Easy Auth configuration failed: ${res.status} ${await res.text()}`);
  }
}
```

Add `removeEasyAuth` after `configureEasyAuth`:

```typescript
export async function removeEasyAuth(slug: string): Promise<void> {
  if (!config.graphSpClientId || !config.portalObjectId) return;
  const graphToken = await acquireGraphToken();
  await removeRedirectUri(graphToken, slug);
}
```

### Step 4: Update `container-delete.ts` to call `removeEasyAuth`

Add import at top of `src/tools/container-delete.ts`:

```typescript
import { deleteContainerApp, removeEasyAuth } from "../azure/container-apps.js";
```

Replace the existing `import { deleteContainerApp }` line.

Then, before `await deleteContainerApp(armToken, slug)`, add:

```typescript
// Remove Easy Auth redirect URI from Deploy Portal app registration (skipped if not configured)
try { await removeEasyAuth(slug); } catch { /* graph credentials not configured */ }
```

### Step 5: Run all tests — verify they pass

```bash
npm run build && node --test dist/test/azure/container-apps.test.js
```

Expected: all tests pass.

### Step 6: Run full suite — verify nothing broken

```bash
npm test
```

Expected: all existing tests still pass.

### Step 7: Commit

```bash
git add src/azure/container-apps.ts src/tools/container-delete.ts test/azure/container-apps.test.ts
git commit -m "feat: wire Easy Auth with Graph redirect URI management

configureEasyAuth() now acquires a Graph token via client credentials
and registers the redirect URI on the Deploy Portal app registration
before configuring authConfigs. removeEasyAuth() cleans up on delete."
```

---

## Task 5: Update `setup.sh`

One-time admin provisioning for the Graph SP and Container Apps Environment custom domain.

**Files:**
- Modify: `infra/setup.sh`

No tests — this is infrastructure script, verified by running it.

### Step 1: Read current `infra/setup.sh`

Check what variables are already set and where to insert the new sections.

### Step 2: Add Graph SP provisioning block

After the Deploy Portal app registration section, add:

```bash
echo "--- Provisioning Graph SP ---"

GRAPH_SP_APP_ID=$(az ad app create \
  --display-name "Deploy Agent Graph SP" \
  --query appId -o tsv)

az ad sp create --id "$GRAPH_SP_APP_ID" --output none

GRAPH_SP_CLIENT_SECRET=$(az ad app credential reset \
  --id "$GRAPH_SP_APP_ID" \
  --query password -o tsv)

# Grant Application.ReadWrite.OwnedBy on Microsoft Graph
# 18a4783c-866b-4cc7-a460-3d5e5662c884 = Application.ReadWrite.OwnedBy (Graph)
az ad app permission add \
  --id "$GRAPH_SP_APP_ID" \
  --api 00000003-0000-0000-c000-000000000000 \
  --api-permissions 18a4783c-866b-4cc7-a460-3d5e5662c884=Role

az ad app permission admin-consent --id "$GRAPH_SP_APP_ID"

# Add Graph SP as owner of Deploy Portal app so OwnedBy scope works
PORTAL_OBJECT_ID=$(az ad app show --id "$PORTAL_CLIENT_ID" --query id -o tsv)
GRAPH_SP_OBJECT_ID=$(az ad sp show --id "$GRAPH_SP_APP_ID" --query id -o tsv)
az ad app owner add --id "$PORTAL_OBJECT_ID" --owner-object-id "$GRAPH_SP_OBJECT_ID"

echo "DEPLOY_AGENT_PORTAL_OBJECT_ID=$PORTAL_OBJECT_ID"
echo "DEPLOY_AGENT_GRAPH_SP_CLIENT_ID=$GRAPH_SP_APP_ID"
echo "DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET=$GRAPH_SP_CLIENT_SECRET"
echo "Add the above to your .mcp.json env block."
```

### Step 3: Add Container Apps Environment custom domain block

After the Container Apps Environment provisioning section, add:

```bash
echo "--- Container Apps Environment custom domain ---"
echo "Manual steps required before running the az command below:"
echo "  1. Obtain wildcard TLS cert for *.api.env.fidoo.cloud (PFX format)"
echo "  2. Add DNS: *.api CNAME ${CONTAINER_ENV_NAME}.${LOCATION}.azurecontainerapps.io"
echo "  3. Then run:"
echo "     az containerapp env update \\"
echo "       --name ${CONTAINER_ENV_NAME} \\"
echo "       --resource-group ${RESOURCE_GROUP} \\"
echo "       --custom-domain-dnssuffix api.env.fidoo.cloud \\"
echo "       --custom-domain-certificate-file ./wildcard-api-cert.pfx \\"
echo "       --custom-domain-certificate-password \"\""
```

### Step 4: Commit

```bash
git add infra/setup.sh
git commit -m "feat(infra): add Graph SP provisioning and container domain setup to setup.sh"
```

---

## Task 6: Smoke test against real Azure (manual)

No automated test — this requires real Azure credentials and the Graph SP set up.

### Step 1: Ensure env vars are set in `.mcp.json`

```json
{
  "DEPLOY_AGENT_PORTAL_CLIENT_ID": "...",
  "DEPLOY_AGENT_PORTAL_CLIENT_SECRET": "...",
  "DEPLOY_AGENT_PORTAL_OBJECT_ID": "...",
  "DEPLOY_AGENT_GRAPH_SP_CLIENT_ID": "...",
  "DEPLOY_AGENT_GRAPH_SP_CLIENT_SECRET": "..."
}
```

### Step 2: Deploy a container app

```
container_deploy folder=/path/to/test-app app_name="Auth Test" app_description="Easy Auth smoke test"
```

Expected output includes `Deployed! https://auth-test.api.env.fidoo.cloud`.

### Step 3: Verify redirect URI was added

```bash
az ad app show --id $DEPLOY_AGENT_PORTAL_OBJECT_ID \
  --query "web.redirectUris" -o json | grep auth-test
```

Expected: `"https://auth-test.api.env.fidoo.cloud/.auth/login/aad/callback"` present.

### Step 4: Verify Easy Auth is active on the container app

```bash
az containerapp auth show \
  --name auth-test \
  --resource-group $DEPLOY_AGENT_RESOURCE_GROUP \
  --query "properties.platform.enabled"
```

Expected: `true`

### Step 5: Open the app in a browser

Navigate to `https://auth-test.api.env.fidoo.cloud`. Expected: redirect to Entra ID login.

### Step 6: Delete and verify cleanup

```
container_delete slug=auth-test
```

```bash
az ad app show --id $DEPLOY_AGENT_PORTAL_OBJECT_ID \
  --query "web.redirectUris" -o json | grep auth-test
```

Expected: URI no longer present.
