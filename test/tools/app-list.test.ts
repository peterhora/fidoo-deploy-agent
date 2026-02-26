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
import { handler } from "../../src/tools/app-list.js";

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

describe("app_list", () => {
  beforeEach(() => {
    installMockFetch();
  });

  afterEach(async () => {
    restoreFetch();
    delete process.env.DEPLOY_AGENT_TOKEN_DIR;
    if (tokenDir) await rm(tokenDir, { recursive: true, force: true });
  });

  it("returns error when not authenticated", async () => {
    await setupTokenDir(); // No tokens
    const result = await handler({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes("Not authenticated"));
  });

  it("returns error when token is expired", async () => {
    await setupTokenDir(mockTokens({ expires_at: Date.now() - 1000 }));
    const result = await handler({});
    assert.ok(result.isError);
    assert.ok(result.content[0].text.toLowerCase().includes("expired"));
  });

  it("returns empty list when no apps deployed", async () => {
    await setupTokenDir(mockTokens());
    mockFetch((url) => {
      if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
        return { status: 200, body: { value: [makeSwa("apps")] } };
      }
      return undefined;
    });

    const result = await handler({});
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0].text);
    assert.deepEqual(parsed.apps, []);
  });

  it("lists apps excluding the dashboard SWA", async () => {
    await setupTokenDir(mockTokens());
    mockFetch((url) => {
      if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
        return {
          status: 200,
          body: {
            value: [
              makeSwa("apps"), // dashboard — should be excluded
              makeSwa("my-app", {
                appName: "My App",
                appDescription: "A cool app",
                deployedAt: "2026-01-01T00:00:00.000Z",
              }),
              makeSwa("another-app", {
                appName: "Another App",
                appDescription: "Another cool app",
                deployedAt: "2026-02-01T00:00:00.000Z",
              }),
            ],
          },
        };
      }
      return undefined;
    });

    const result = await handler({});
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.apps.length, 2);
    assert.equal(parsed.apps[0].slug, "another-app");
    assert.equal(parsed.apps[0].name, "Another App");
    assert.equal(parsed.apps[0].url, "https://another-app.env.fidoo.cloud");
    assert.equal(parsed.apps[1].slug, "my-app");
    assert.equal(parsed.apps[1].name, "My App");
  });

  it("uses slug as name fallback when tags are missing", async () => {
    await setupTokenDir(mockTokens());
    mockFetch((url) => {
      if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
        return {
          status: 200,
          body: { value: [makeSwa("apps"), makeSwa("no-tags")] },
        };
      }
      return undefined;
    });

    const result = await handler({});
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.apps.length, 1);
    assert.equal(parsed.apps[0].name, "no-tags");
    assert.equal(parsed.apps[0].description, "");
  });

  it("propagates Azure API errors", async () => {
    await setupTokenDir(mockTokens());
    mockFetch((url) => {
      if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
        return {
          status: 403,
          body: { error: { code: "AuthorizationFailed", message: "Forbidden" } },
        };
      }
      return undefined;
    });

    const result = await handler({});
    assert.ok(result.isError);
  });
});
