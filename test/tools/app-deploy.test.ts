import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  installMockFetch,
  restoreFetch,
  mockFetch,
} from "../helpers/mock-fetch.js";
import { handler } from "../../src/tools/app-deploy.js";

let tokenDir: string;
let appDir: string;

function makeTestJwt(upn: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ upn, sub: "test-sub" })).toString("base64url");
  return `${header}.${payload}.fake-signature`;
}

function mockTokens() {
  return {
    access_token: makeTestJwt("deployer@fidoo.cloud"),
    refresh_token: "test-refresh",
    expires_at: Date.now() + 3600_000,
  };
}

async function setupTokenDir(tokens?: object): Promise<void> {
  tokenDir = await mkdtemp(join(tmpdir(), "token-"));
  process.env.DEPLOY_AGENT_TOKEN_DIR = tokenDir;
  if (tokens) {
    await writeFile(join(tokenDir, "tokens.json"), JSON.stringify(tokens));
  }
}

async function setupAppDir(files: Record<string, string> = { "index.html": "<h1>Hello</h1>" }): Promise<void> {
  appDir = await mkdtemp(join(tmpdir(), "app-"));
  for (const [name, content] of Object.entries(files)) {
    const dir = join(appDir, name.includes("/") ? name.substring(0, name.lastIndexOf("/")) : "");
    if (name.includes("/")) await mkdir(dir, { recursive: true });
    await writeFile(join(appDir, name), content);
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

function mockAzureForFirstDeploy(slug: string) {
  // getStaticWebApp returns 404 (slug available) — azureFetch throws AzureError
  mockFetch((url, init) => {
    if (
      url.includes(`/staticSites/${slug}?`) &&
      (!init?.method || init.method === "GET") &&
      !url.includes("/listSecrets") &&
      !url.includes("/config/")
    ) {
      return {
        status: 404,
        body: { error: { code: "ResourceNotFound", message: "Not found" } },
      };
    }
    return undefined;
  });

  // createStaticWebApp
  mockFetch((url, init) => {
    if (url.includes(`/staticSites/${slug}`) && init?.method === "PUT" && !url.includes("/config/")) {
      return { status: 200, body: makeSwa(slug) };
    }
    return undefined;
  });

  // deploySwaZip: getDeploymentToken
  mockFetch((url, init) => {
    if (url.includes("/listSecrets") && init?.method === "POST") {
      return { status: 200, body: { properties: { apiKey: "deploy-key" } } };
    }
    return undefined;
  });

  // deploySwaZip: getStaticWebApp (for hostname)
  // This is the second GET for the slug — but since the first returns 404,
  // the mock is consumed. We need a fresh one for deploySwaZip.
  // Actually, the first mock is a persistent matcher. Let's adjust:
  // We'll use a counter to make the first GET return 404 and subsequent GETs return 200.
  // But the approach is simpler: matchers are checked in order, so we replace
  // the first one with one-shot logic.
}

function mockAzureForFullFirstDeploy(slug: string) {
  // Collision check: getStaticWebApp returns 404
  let collisionChecked = false;
  mockFetch((url, init) => {
    if (
      !collisionChecked &&
      url.includes(`/staticSites/${slug}?`) &&
      (!init?.method || init.method === "GET") &&
      !url.includes("/listSecrets") &&
      !url.includes("/config/")
    ) {
      collisionChecked = true;
      return {
        status: 404,
        body: { error: { code: "ResourceNotFound", message: "Not found" } },
      };
    }
    return undefined;
  });

  // createStaticWebApp (PUT without /config/)
  mockFetch((url, init) => {
    if (
      url.includes(`/staticSites/${slug}`) &&
      init?.method === "PUT" &&
      !url.includes("/config/")
    ) {
      return { status: 200, body: makeSwa(slug) };
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

  // getStaticWebApp for deploySwaZip (hostname lookup)
  mockFetch((url, init) => {
    if (
      url.includes(`/staticSites/${slug}?`) &&
      (!init?.method || init.method === "GET") &&
      !url.includes("/listSecrets") &&
      !url.includes("/config/")
    ) {
      return {
        status: 200,
        body: makeSwa(slug),
      };
    }
    return undefined;
  });

  // zipdeploy POST
  mockFetch((url, init) => {
    if (url.includes("zipdeploy") && init?.method === "POST") {
      return { status: 200, body: {} };
    }
    return undefined;
  });

  // createCnameRecord (PUT with /CNAME/)
  mockFetch((url, init) => {
    if (url.includes("/CNAME/") && init?.method === "PUT") {
      return { status: 200, body: { id: "cname-id" } };
    }
    return undefined;
  });

  // configureAuth (PUT with /authsettingsV2)
  mockFetch((url, init) => {
    if (url.includes("/authsettingsV2") && init?.method === "PUT") {
      return { status: 200, body: { properties: {} } };
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

  // Dashboard rebuild: listStaticWebApps
  mockFetch((url) => {
    if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
      return { status: 200, body: { value: [] } };
    }
    return undefined;
  });

  // Dashboard deploySwaZip: getStaticWebApp for "apps" (dashboard slug)
  mockFetch((url, init) => {
    if (
      url.includes("/staticSites/apps") &&
      (!init?.method || init.method === "GET") &&
      !url.includes("/listSecrets")
    ) {
      return {
        status: 200,
        body: makeSwa("apps"),
      };
    }
    return undefined;
  });
}

function mockAzureForRedeploy(slug: string) {
  // getDeploymentToken
  mockFetch((url, init) => {
    if (url.includes("/listSecrets") && init?.method === "POST") {
      return { status: 200, body: { properties: { apiKey: "deploy-key" } } };
    }
    return undefined;
  });

  // getStaticWebApp for deploySwaZip
  mockFetch((url, init) => {
    if (
      url.includes(`/staticSites/${slug}`) &&
      (!init?.method || init.method === "GET") &&
      !url.includes("/listSecrets") &&
      !url.includes("/config/")
    ) {
      return { status: 200, body: makeSwa(slug) };
    }
    return undefined;
  });

  // zipdeploy POST
  mockFetch((url, init) => {
    if (url.includes("zipdeploy") && init?.method === "POST") {
      return { status: 200, body: {} };
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

  // Dashboard rebuild: listStaticWebApps
  mockFetch((url) => {
    if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
      return { status: 200, body: { value: [] } };
    }
    return undefined;
  });

  // Dashboard deploySwaZip: getStaticWebApp for "apps"
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
}

describe("app_deploy — first deploy", () => {
  beforeEach(async () => {
    installMockFetch();
    await setupTokenDir(mockTokens());
    await setupAppDir();
  });

  afterEach(async () => {
    restoreFetch();
    delete process.env.DEPLOY_AGENT_TOKEN_DIR;
    await rm(tokenDir, { recursive: true, force: true });
    await rm(appDir, { recursive: true, force: true });
  });

  it("returns error when not authenticated", async () => {
    // Remove tokens file
    await rm(join(tokenDir, "tokens.json"), { force: true });

    const result = await handler({ folder: appDir, app_name: "My App", app_description: "Desc" });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes("not authenticated") || result.content[0].text.includes("Not authenticated"));
  });

  it("returns error when app_name is missing on first deploy", async () => {
    const result = await handler({ folder: appDir, app_description: "Desc" });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes("app_name"));
  });

  it("returns error when app_description is missing on first deploy", async () => {
    const result = await handler({ folder: appDir, app_name: "My App" });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes("app_description"));
  });

  it("returns error when folder does not exist", async () => {
    const result = await handler({
      folder: "/tmp/nonexistent-folder-xyz",
      app_name: "My App",
      app_description: "Desc",
    });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.toLowerCase().includes("folder"));
  });

  it("returns error when slug already exists (collision)", async () => {
    // Mock getStaticWebApp returning 200 (slug taken)
    mockFetch((url, init) => {
      if (
        url.includes("/staticSites/my-app?") &&
        (!init?.method || init.method === "GET") &&
        !url.includes("/listSecrets")
      ) {
        return { status: 200, body: makeSwa("my-app") };
      }
      return undefined;
    });

    const result = await handler({
      folder: appDir,
      app_name: "My App",
      app_description: "A test app",
    });
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes("already exists") || result.content[0].text.includes("slug"));
  });

  it("creates SWA, deploys ZIP, adds CNAME, configures auth, writes .deploy.json, rebuilds dashboard", async () => {
    mockAzureForFullFirstDeploy("my-app");

    const result = await handler({
      folder: appDir,
      app_name: "My App",
      app_description: "A test app",
    });

    assert.ok(!result.isError, `Expected success but got: ${result.content[0].text}`);
    assert.ok(result.content[0].text.includes("my-app.env.fidoo.cloud"));

    // Verify .deploy.json was written
    const deployJson = JSON.parse(await readFile(join(appDir, ".deploy.json"), "utf8"));
    assert.equal(deployJson.appSlug, "my-app");
    assert.equal(deployJson.appName, "My App");
    assert.equal(deployJson.appDescription, "A test app");
    assert.ok(deployJson.resourceId);
  });

  it("includes deployedBy tag from JWT UPN on first deploy", async () => {
    mockAzureForFullFirstDeploy("my-app");

    await handler({
      folder: appDir,
      app_name: "My App",
      app_description: "A test app",
    });

    const { getFetchCalls } = await import("../helpers/mock-fetch.js");
    const calls = getFetchCalls();
    const patchCall = calls.find((c) => c.init?.method === "PATCH");
    assert.ok(patchCall, "Should have a PATCH call for updateTags");

    const body = JSON.parse(patchCall.init?.body as string);
    assert.equal(body.tags.deployedBy, "deployer@fidoo.cloud");
  });

  it("generates correct slug from app_name", async () => {
    mockAzureForFullFirstDeploy("expense-tracker-2-0");

    const result = await handler({
      folder: appDir,
      app_name: "Expense Tracker 2.0",
      app_description: "Track expenses",
    });

    assert.ok(!result.isError, `Expected success but got: ${result.content[0].text}`);

    const deployJson = JSON.parse(await readFile(join(appDir, ".deploy.json"), "utf8"));
    assert.equal(deployJson.appSlug, "expense-tracker-2-0");
  });
});

describe("app_deploy — re-deploy", () => {
  beforeEach(async () => {
    installMockFetch();
    await setupTokenDir(mockTokens());
    await setupAppDir();
  });

  afterEach(async () => {
    restoreFetch();
    delete process.env.DEPLOY_AGENT_TOKEN_DIR;
    await rm(tokenDir, { recursive: true, force: true });
    await rm(appDir, { recursive: true, force: true });
  });

  it("reads .deploy.json and deploys without requiring app_name/app_description", async () => {
    // Write existing .deploy.json
    await writeFile(
      join(appDir, ".deploy.json"),
      JSON.stringify({
        appSlug: "existing-app",
        appName: "Existing App",
        appDescription: "Already deployed",
        resourceId: "/subscriptions/x/resourceGroups/rg/providers/Microsoft.Web/staticSites/existing-app",
      }),
    );

    mockAzureForRedeploy("existing-app");

    const result = await handler({ folder: appDir });

    assert.ok(!result.isError, `Expected success but got: ${result.content[0].text}`);
    assert.ok(result.content[0].text.includes("existing-app.env.fidoo.cloud"));
  });

  it("updates deployedAt tag on the SWA resource", async () => {
    await writeFile(
      join(appDir, ".deploy.json"),
      JSON.stringify({
        appSlug: "existing-app",
        appName: "Existing App",
        appDescription: "Already deployed",
        resourceId: "/subscriptions/x/resourceGroups/rg/providers/Microsoft.Web/staticSites/existing-app",
      }),
    );

    mockAzureForRedeploy("existing-app");

    await handler({ folder: appDir });

    // Find the PATCH call (updateTags)
    const { getFetchCalls } = await import("../helpers/mock-fetch.js");
    const calls = getFetchCalls();
    const patchCall = calls.find((c) => c.init?.method === "PATCH");
    assert.ok(patchCall, "Should have a PATCH call for updateTags");

    const body = JSON.parse(patchCall.init?.body as string);
    assert.ok(body.tags.deployedAt, "Should include deployedAt tag");
    // Verify it's a valid ISO date string
    assert.ok(!isNaN(Date.parse(body.tags.deployedAt)), "deployedAt should be valid ISO date");
  });

  it("includes deployedBy tag from JWT UPN on re-deploy", async () => {
    await writeFile(
      join(appDir, ".deploy.json"),
      JSON.stringify({
        appSlug: "existing-app",
        appName: "Existing App",
        appDescription: "Already deployed",
        resourceId: "/subscriptions/x/resourceGroups/rg/providers/Microsoft.Web/staticSites/existing-app",
      }),
    );

    mockAzureForRedeploy("existing-app");

    await handler({ folder: appDir });

    const { getFetchCalls } = await import("../helpers/mock-fetch.js");
    const calls = getFetchCalls();
    const patchCall = calls.find((c) => c.init?.method === "PATCH");
    assert.ok(patchCall, "Should have a PATCH call for updateTags");

    const body = JSON.parse(patchCall.init?.body as string);
    assert.equal(body.tags.deployedBy, "deployer@fidoo.cloud");
  });

  it("rebuilds the dashboard after deploy", async () => {
    await writeFile(
      join(appDir, ".deploy.json"),
      JSON.stringify({
        appSlug: "existing-app",
        appName: "Existing App",
        appDescription: "Already deployed",
        resourceId: "/subscriptions/x/resourceGroups/rg/providers/Microsoft.Web/staticSites/existing-app",
      }),
    );

    mockAzureForRedeploy("existing-app");

    await handler({ folder: appDir });

    const { getFetchCalls } = await import("../helpers/mock-fetch.js");
    const calls = getFetchCalls();
    // Should have a listStaticWebApps call (from dashboard rebuild)
    const listCall = calls.find(
      (c) => (c.url.includes("/staticSites?") || c.url.includes("/staticSites&")),
    );
    assert.ok(listCall, "Should rebuild dashboard (calls listStaticWebApps)");
  });

  it("ignores app_name/app_description args when .deploy.json exists", async () => {
    await writeFile(
      join(appDir, ".deploy.json"),
      JSON.stringify({
        appSlug: "existing-app",
        appName: "Existing App",
        appDescription: "Already deployed",
        resourceId: "/subscriptions/x/resourceGroups/rg/providers/Microsoft.Web/staticSites/existing-app",
      }),
    );

    mockAzureForRedeploy("existing-app");

    const result = await handler({
      folder: appDir,
      app_name: "Ignored Name",
      app_description: "Ignored Desc",
    });

    assert.ok(!result.isError, `Expected success but got: ${result.content[0].text}`);
    // Should still deploy to existing-app, not "ignored-name"
    assert.ok(result.content[0].text.includes("existing-app.env.fidoo.cloud"));
  });
});
