import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installMockFetch, restoreFetch, mockFetch } from "../helpers/mock-fetch.js";
import { handler } from "../../src/tools/app-list.js";

let tokenDir: string;

function mockTokens(overrides: Partial<{ expires_at: number }> = {}) {
  const exp = overrides.expires_at ?? Date.now() + 3600_000;
  return {
    access_token: "test-token",
    storage_access_token: "test-storage-token",
    refresh_token: "test-refresh",
    expires_at: exp,
    storage_expires_at: exp,
  };
}

async function setupTokenDir(tokens?: object): Promise<void> {
  tokenDir = await mkdtemp(join(tmpdir(), "token-"));
  process.env.DEPLOY_AGENT_TOKEN_DIR = tokenDir;
  if (tokens) {
    await writeFile(join(tokenDir, "tokens.json"), JSON.stringify(tokens));
  }
}

function mockRegistry(apps: Array<{ slug: string; name: string; description: string; deployedAt: string; deployedBy: string }>) {
  mockFetch((url, init) => {
    if (url.includes("registry.json") && (!init?.method || init.method === "GET")) {
      return { status: 200, body: { apps } };
    }
    return undefined;
  });
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
    await setupTokenDir();
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

  it("returns empty list when no apps in registry", async () => {
    await setupTokenDir(mockTokens());
    mockRegistry([]);

    const result = await handler({});
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0].text);
    assert.deepEqual(parsed.apps, []);
  });

  it("lists apps with path-based URLs", async () => {
    await setupTokenDir(mockTokens());
    mockRegistry([
      { slug: "another-app", name: "Another App", description: "Another cool app", deployedAt: "2026-02-01T00:00:00.000Z", deployedBy: "u" },
      { slug: "my-app", name: "My App", description: "A cool app", deployedAt: "2026-01-01T00:00:00.000Z", deployedBy: "u" },
    ]);

    const result = await handler({});
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.apps.length, 2);
    assert.equal(parsed.apps[0].slug, "another-app");
    assert.equal(parsed.apps[0].name, "Another App");
    assert.equal(parsed.apps[0].url, "https://ai-apps.env.fidoo.cloud/another-app/");
    assert.equal(parsed.apps[1].slug, "my-app");
    assert.equal(parsed.apps[1].name, "My App");
    assert.equal(parsed.apps[1].url, "https://ai-apps.env.fidoo.cloud/my-app/");
  });

  it("returns empty list when registry.json does not exist", async () => {
    await setupTokenDir(mockTokens());
    mockFetch(() => ({ status: 404, body: null }));

    const result = await handler({});
    assert.ok(!result.isError);
    const parsed = JSON.parse(result.content[0].text);
    assert.deepEqual(parsed.apps, []);
  });

  it("propagates errors from blob storage", async () => {
    await setupTokenDir(mockTokens());
    mockFetch((url) => {
      if (url.includes("registry.json")) {
        return { status: 403, body: "Forbidden" };
      }
      return undefined;
    });

    const result = await handler({});
    assert.ok(result.isError);
  });
});
