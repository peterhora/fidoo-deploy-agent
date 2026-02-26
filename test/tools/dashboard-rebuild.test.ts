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
import { handler } from "../../src/tools/dashboard-rebuild.js";

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

function mockAzureForDashboardRebuild() {
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

describe("dashboard_rebuild", () => {
  beforeEach(async () => {
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
    assert.ok(
      result.content[0].text.includes("not authenticated") ||
        result.content[0].text.includes("Not authenticated"),
    );
  });

  it("returns error when token is expired", async () => {
    await setupTokenDir(mockTokens({ expires_at: Date.now() - 1000 }));

    const result = await handler({});
    assert.ok(result.isError);
    assert.ok(
      result.content[0].text.toLowerCase().includes("expired"),
    );
  });

  it("rebuilds dashboard and returns success", async () => {
    await setupTokenDir(mockTokens());
    mockAzureForDashboardRebuild();

    const result = await handler({});
    assert.ok(!result.isError, `Expected success but got: ${result.content[0].text}`);

    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.status, "ok");
    assert.ok(parsed.message.includes("Dashboard"));
    assert.ok(parsed.url.includes("apps.env.fidoo.cloud"));
  });

  it("propagates Azure API errors", async () => {
    await setupTokenDir(mockTokens());

    // Mock listStaticWebApps to fail
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
