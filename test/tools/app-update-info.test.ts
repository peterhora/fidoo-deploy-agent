import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  installMockFetch,
  restoreFetch,
  mockFetch,
  getFetchCalls,
} from "../helpers/mock-fetch.js";
import { handler } from "../../src/tools/app-update-info.js";

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

function makeSwa(name: string, tags: Record<string, string> = {}) {
  return {
    id: `/subscriptions/x/resourceGroups/rg/providers/Microsoft.Web/staticSites/${name}`,
    name,
    location: "westeurope",
    properties: { defaultHostname: `${name}.azurestaticapps.net` },
    tags,
  };
}

function mockUpdateFlow(slug: string) {
  // getStaticWebApp — needed to verify app exists
  mockFetch((url, init) => {
    if (
      url.includes(`/staticSites/${slug}`) &&
      (!init?.method || init.method === "GET") &&
      !url.includes("/listSecrets")
    ) {
      return {
        status: 200,
        body: makeSwa(slug, { appName: "Old Name", appDescription: "Old desc" }),
      };
    }
    return undefined;
  });

  // updateTags (PATCH)
  mockFetch((url, init) => {
    if (url.includes(`/staticSites/${slug}`) && init?.method === "PATCH") {
      return { status: 200, body: makeSwa(slug) };
    }
    return undefined;
  });

  // Dashboard rebuild mocks
  mockFetch((url) => {
    if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
      return { status: 200, body: { value: [makeSwa("apps")] } };
    }
    return undefined;
  });

  mockFetch((url, init) => {
    if (url.includes("/listSecrets") && init?.method === "POST") {
      return { status: 200, body: { properties: { apiKey: "deploy-key" } } };
    }
    return undefined;
  });

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

  mockFetch((url, init) => {
    if (url.includes("zipdeploy") && init?.method === "POST") {
      return { status: 200, body: {} };
    }
    return undefined;
  });
}

describe("app_update_info", () => {
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
    const result = await handler({ app_slug: "my-app", app_name: "New" });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes("Not authenticated"));
  });

  it("returns error when token is expired", async () => {
    await setupTokenDir(mockTokens({ expires_at: Date.now() - 1000 }));
    const result = await handler({ app_slug: "my-app", app_name: "New" });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.toLowerCase().includes("expired"));
  });

  it("returns error when app_slug is missing", async () => {
    await setupTokenDir(mockTokens());
    const result = await handler({ app_name: "New" });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes("app_slug"));
  });

  it("returns error when neither app_name nor app_description provided", async () => {
    await setupTokenDir(mockTokens());
    const result = await handler({ app_slug: "my-app" });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes("app_name") || result.content[0].text.includes("app_description"));
  });

  it("updates tags with new name and rebuilds dashboard", async () => {
    await setupTokenDir(mockTokens());
    mockUpdateFlow("my-app");

    const result = await handler({ app_slug: "my-app", app_name: "New Name" });
    assert.ok(!result.isError, `Expected success but got: ${result.content[0].text}`);

    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.status, "ok");

    // Verify PATCH was called with the new name
    const calls = getFetchCalls();
    const patchCalls = calls.filter(
      (c) => c.url.includes("/staticSites/my-app") && c.init?.method === "PATCH",
    );
    assert.equal(patchCalls.length, 1);
    const patchBody = JSON.parse(patchCalls[0].init!.body as string);
    assert.equal(patchBody.tags.appName, "New Name");
    assert.equal(patchBody.tags.appDescription, undefined);
  });

  it("updates tags with new description and rebuilds dashboard", async () => {
    await setupTokenDir(mockTokens());
    mockUpdateFlow("my-app");

    const result = await handler({ app_slug: "my-app", app_description: "New desc" });
    assert.ok(!result.isError);

    const calls = getFetchCalls();
    const patchCalls = calls.filter(
      (c) => c.url.includes("/staticSites/my-app") && c.init?.method === "PATCH",
    );
    assert.equal(patchCalls.length, 1);
    const patchBody = JSON.parse(patchCalls[0].init!.body as string);
    assert.equal(patchBody.tags.appDescription, "New desc");
    assert.equal(patchBody.tags.appName, undefined);
  });

  it("updates tags with both name and description", async () => {
    await setupTokenDir(mockTokens());
    mockUpdateFlow("my-app");

    const result = await handler({
      app_slug: "my-app",
      app_name: "New Name",
      app_description: "New desc",
    });
    assert.ok(!result.isError);

    const calls = getFetchCalls();
    const patchCalls = calls.filter(
      (c) => c.url.includes("/staticSites/my-app") && c.init?.method === "PATCH",
    );
    const patchBody = JSON.parse(patchCalls[0].init!.body as string);
    assert.equal(patchBody.tags.appName, "New Name");
    assert.equal(patchBody.tags.appDescription, "New desc");

    // Dashboard was rebuilt (zipdeploy called)
    const zipCalls = calls.filter((c) => c.url.includes("zipdeploy"));
    assert.equal(zipCalls.length, 1);
  });

  it("returns error when app not found", async () => {
    await setupTokenDir(mockTokens());
    mockFetch((url, init) => {
      if (
        url.includes("/staticSites/no-such-app") &&
        (!init?.method || init.method === "GET")
      ) {
        return {
          status: 404,
          body: { error: { code: "ResourceNotFound", message: "Not found" } },
        };
      }
      return undefined;
    });

    const result = await handler({ app_slug: "no-such-app", app_name: "New" });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes("not found") || result.content[0].text.includes("Not found"));
  });
});
