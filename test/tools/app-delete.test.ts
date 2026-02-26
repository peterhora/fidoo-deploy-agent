import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  installMockFetch,
  restoreFetch,
  mockFetch,
  getFetchCalls,
} from "../helpers/mock-fetch.js";
import { handler } from "../../src/tools/app-delete.js";

let tokenDir: string;

function mockTokens(overrides: Partial<{ expires_at: number }> = {}) {
  return {
    access_token: "test-token",
    refresh_token: "test-refresh",
    expires_at: overrides.expires_at ?? Date.now() + 3600_000,
  };
}

async function setupTokenDir(tokens?: object): Promise<void> {
  tokenDir = await mkdtemp(join(tmpdir(), "token-"));
  process.env.DEPLOY_AGENT_TOKEN_DIR = tokenDir;
  if (tokens) {
    await writeFile(join(tokenDir, "tokens.json"), JSON.stringify(tokens));
  }
}

function makeSwa(name: string) {
  return {
    id: `/subscriptions/x/resourceGroups/rg/providers/Microsoft.Web/staticSites/${name}`,
    name,
    location: "westeurope",
    properties: { defaultHostname: `${name}.azurestaticapps.net` },
    tags: {},
  };
}

function mockDeleteFlow(slug: string) {
  // deleteStaticWebApp — returns 204
  mockFetch((url, init) => {
    if (url.includes(`/staticSites/${slug}`) && init?.method === "DELETE") {
      return { status: 204, body: null };
    }
    return undefined;
  });

  // deleteCnameRecord — returns 204
  mockFetch((url, init) => {
    if (url.includes(`/CNAME/${slug}`) && init?.method === "DELETE") {
      return { status: 204, body: null };
    }
    return undefined;
  });

  // Dashboard rebuild mocks
  // listStaticWebApps
  mockFetch((url) => {
    if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
      return { status: 200, body: { value: [makeSwa("apps")] } };
    }
    return undefined;
  });

  // getDeploymentToken
  mockFetch((url, init) => {
    if (url.includes("/listSecrets") && init?.method === "POST") {
      return { status: 200, body: { properties: { apiKey: "deploy-key" } } };
    }
    return undefined;
  });

  // getStaticWebApp for dashboard
  mockFetch((url, init) => {
    if (
      url.includes("/staticSites/apps") &&
      (!init?.method || init.method === "GET") &&
      !url.includes("/listSecrets")
    ) {
      return { status: 200, body: makeSwa("apps") };
    }
    return undefined;
  });

  // zipdeploy
  mockFetch((url, init) => {
    if (url.includes("zipdeploy") && init?.method === "POST") {
      return { status: 200, body: {} };
    }
    return undefined;
  });
}

describe("app_delete", () => {
  beforeEach(() => {
    installMockFetch();
  });

  afterEach(async () => {
    restoreFetch();
    delete process.env.DEPLOY_AGENT_TOKEN_DIR;
    if (tokenDir) await rm(tokenDir, { recursive: true, force: true });
  });

  it("returns error when not authenticated", async () => {
    await setupTokenDir();
    const result = await handler({ app_slug: "my-app" });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes("Not authenticated"));
  });

  it("returns error when token is expired", async () => {
    await setupTokenDir(mockTokens({ expires_at: Date.now() - 1000 }));
    const result = await handler({ app_slug: "my-app" });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.toLowerCase().includes("expired"));
  });

  it("returns error when app_slug is missing", async () => {
    await setupTokenDir(mockTokens());
    const result = await handler({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes("app_slug"));
  });

  it("prevents deleting the dashboard SWA", async () => {
    await setupTokenDir(mockTokens());
    const result = await handler({ app_slug: "apps" });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.toLowerCase().includes("dashboard"));
  });

  it("deletes SWA, CNAME, and rebuilds dashboard", async () => {
    await setupTokenDir(mockTokens());
    mockDeleteFlow("my-app");

    const result = await handler({ app_slug: "my-app" });
    assert.ok(!result.isError, `Expected success but got: ${result.content[0].text}`);

    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.status, "ok");
    assert.ok(parsed.message.includes("my-app"));

    // Verify SWA was deleted
    const calls = getFetchCalls();
    const deleteSwaCalls = calls.filter(
      (c) => c.url.includes("/staticSites/my-app") && c.init?.method === "DELETE",
    );
    assert.equal(deleteSwaCalls.length, 1);

    // Verify CNAME was deleted
    const deleteCnameCalls = calls.filter(
      (c) => c.url.includes("/CNAME/my-app") && c.init?.method === "DELETE",
    );
    assert.equal(deleteCnameCalls.length, 1);

    // Verify dashboard was rebuilt (zipdeploy called)
    const zipCalls = calls.filter((c) => c.url.includes("zipdeploy"));
    assert.equal(zipCalls.length, 1);
  });

  it("propagates Azure API errors on SWA delete", async () => {
    await setupTokenDir(mockTokens());
    mockFetch((url, init) => {
      if (url.includes("/staticSites/my-app") && init?.method === "DELETE") {
        return {
          status: 404,
          body: { error: { code: "ResourceNotFound", message: "Not found" } },
        };
      }
      return undefined;
    });

    const result = await handler({ app_slug: "my-app" });
    assert.ok(result.isError);
  });
});
