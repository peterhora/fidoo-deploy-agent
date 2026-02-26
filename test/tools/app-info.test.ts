import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  installMockFetch,
  restoreFetch,
  mockFetch,
} from "../helpers/mock-fetch.js";
import { handler } from "../../src/tools/app-info.js";

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
    properties: {
      defaultHostname: `${name}.azurestaticapps.net`,
      status: "Ready",
    },
    tags,
  };
}

describe("app_info", () => {
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

  it("returns app details with tags", async () => {
    await setupTokenDir(mockTokens());
    const swa = makeSwa("my-app", {
      appName: "My App",
      appDescription: "A cool app",
      deployedAt: "2026-01-15T10:30:00.000Z",
    });

    mockFetch((url, init) => {
      if (
        url.includes("/staticSites/my-app") &&
        (!init?.method || init.method === "GET")
      ) {
        return { status: 200, body: swa };
      }
      return undefined;
    });

    const result = await handler({ app_slug: "my-app" });
    assert.ok(!result.isError, `Expected success but got: ${result.content[0].text}`);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.slug, "my-app");
    assert.equal(parsed.name, "My App");
    assert.equal(parsed.description, "A cool app");
    assert.equal(parsed.url, "https://my-app.env.fidoo.cloud");
    assert.equal(parsed.status, "Ready");
    assert.equal(parsed.deployedAt, "2026-01-15T10:30:00.000Z");
    assert.ok(parsed.defaultHostname);
  });

  it("returns 404 error when app not found", async () => {
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

    const result = await handler({ app_slug: "no-such-app" });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes("not found") || result.content[0].text.includes("Not found"));
  });

  it("uses fallback values when tags are missing", async () => {
    await setupTokenDir(mockTokens());
    mockFetch((url, init) => {
      if (
        url.includes("/staticSites/bare-app") &&
        (!init?.method || init.method === "GET")
      ) {
        return { status: 200, body: makeSwa("bare-app") };
      }
      return undefined;
    });

    const result = await handler({ app_slug: "bare-app" });
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.name, "bare-app");
    assert.equal(parsed.description, "");
  });
});
