/**
 * Integration test: full deploy lifecycle through tool handlers.
 *
 * Simulates a realistic sequence:
 *   auth_status → auth_login → auth_poll → app_deploy (first) →
 *   app_list → app_info → app_update_info → app_deploy (re-deploy) →
 *   app_delete
 *
 * Uses mocked Azure APIs and temp directories for tokens and app files.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  installMockFetch,
  restoreFetch,
  mockFetch,
  getFetchCalls,
} from "../helpers/mock-fetch.js";
import { toolRegistry } from "../../src/tools/index.js";

let tokenDir: string;
let appDir: string;

const SLUG = "budget-tracker";

function makeTestJwt(upn: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ upn, sub: "test-sub", exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url");
  return `${header}.${payload}.fake-signature`;
}

const TEST_TOKEN = makeTestJwt("alice@fidoo.cloud");

function makeSwa(name: string, tags: Record<string, string> = {}) {
  return {
    id: `/subscriptions/x/resourceGroups/rg/providers/Microsoft.Web/staticSites/${name}`,
    name,
    location: "westeurope",
    properties: { defaultHostname: `${name}.azurestaticapps.net`, status: "Ready" },
    tags,
  };
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const tool = toolRegistry.get(name);
  assert.ok(tool, `Tool "${name}" not found in registry`);
  return tool.handler(args);
}

function parseResult(result: { content: Array<{ type: string; text: string }>; isError?: boolean }) {
  try {
    return JSON.parse(result.content[0].text);
  } catch {
    return result.content[0].text;
  }
}

describe("integration: full deploy lifecycle", () => {
  beforeEach(async () => {
    installMockFetch();

    // Set up token dir (empty — not authenticated yet)
    tokenDir = await mkdtemp(join(tmpdir(), "int-token-"));
    process.env.DEPLOY_AGENT_TOKEN_DIR = tokenDir;

    // Set up app dir with sample files
    appDir = await mkdtemp(join(tmpdir(), "int-app-"));
    await writeFile(join(appDir, "index.html"), "<!DOCTYPE html><html><body>Hello</body></html>");
    await mkdir(join(appDir, "css"));
    await writeFile(join(appDir, "css", "style.css"), "body { color: #333; }");
    // Add a file that should be excluded
    await writeFile(join(appDir, ".env"), "SECRET=value");
  });

  afterEach(async () => {
    restoreFetch();
    delete process.env.DEPLOY_AGENT_TOKEN_DIR;
    await rm(tokenDir, { recursive: true, force: true });
    await rm(appDir, { recursive: true, force: true });
  });

  it("completes full lifecycle: check auth → login → poll → deploy → list → info → update → redeploy → delete", async () => {
    // ---- Step 1: auth_status — should be not_authenticated ----
    const statusResult = await callTool("auth_status");
    const statusData = parseResult(statusResult);
    assert.equal(statusData.status, "not_authenticated");

    // ---- Step 2: auth_login — start device code flow ----
    mockFetch((url, init) => {
      if (url.includes("/devicecode") && init?.method === "POST") {
        return {
          status: 200,
          body: {
            device_code: "test-device-code",
            user_code: "ABCD-1234",
            verification_uri: "https://microsoft.com/devicelogin",
            expires_in: 900,
            interval: 5,
            message: "Go to https://microsoft.com/devicelogin and enter ABCD-1234",
          },
        };
      }
      return undefined;
    });

    const loginResult = await callTool("auth_login");
    assert.ok(!loginResult.isError, `auth_login failed: ${loginResult.content[0].text}`);
    const loginData = parseResult(loginResult);
    assert.equal(loginData.user_code, "ABCD-1234");
    assert.equal(loginData.device_code, "test-device-code");

    // ---- Step 3: auth_poll — poll for token ----
    mockFetch((url, init) => {
      if (url.includes("/token") && init?.method === "POST") {
        return {
          status: 200,
          body: {
            access_token: TEST_TOKEN,
            refresh_token: "test-refresh",
            expires_in: 3600,
            token_type: "Bearer",
          },
        };
      }
      return undefined;
    });

    const pollResult = await callTool("auth_poll", { device_code: "test-device-code" });
    assert.ok(!pollResult.isError, `auth_poll failed: ${pollResult.content[0].text}`);
    const pollData = parseResult(pollResult);
    assert.equal(pollData.status, "authenticated");

    // Verify auth_status now shows authenticated
    const statusResult2 = await callTool("auth_status");
    const statusData2 = parseResult(statusResult2);
    assert.equal(statusData2.status, "authenticated");

    // ---- Step 4: app_deploy — first deploy ----
    // Mock Azure APIs for first deploy
    let collisionChecked = false;
    mockFetch((url, init) => {
      if (
        !collisionChecked &&
        url.includes(`/staticSites/${SLUG}?`) &&
        (!init?.method || init.method === "GET") &&
        !url.includes("/listSecrets") &&
        !url.includes("/config/")
      ) {
        collisionChecked = true;
        return { status: 404, body: { error: { code: "ResourceNotFound", message: "Not found" } } };
      }
      return undefined;
    });

    mockFetch((url, init) => {
      if (url.includes(`/staticSites/${SLUG}`) && init?.method === "PUT" && !url.includes("/config/")) {
        return {
          status: 200,
          body: makeSwa(SLUG, { appName: "Budget Tracker", appDescription: "Track spending" }),
        };
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
        url.includes(`/staticSites/${SLUG}?`) &&
        (!init?.method || init.method === "GET") &&
        !url.includes("/listSecrets") &&
        !url.includes("/config/")
      ) {
        return {
          status: 200,
          body: makeSwa(SLUG, {
            appName: "Budget Tracker",
            appDescription: "Track spending",
            deployedAt: new Date().toISOString(),
          }),
        };
      }
      return undefined;
    });

    mockFetch((url, init) => {
      if (url.includes("zipdeploy") && init?.method === "POST") {
        return { status: 200, body: {} };
      }
      return undefined;
    });

    mockFetch((url, init) => {
      if (url.includes("/CNAME/") && init?.method === "PUT") {
        return { status: 200, body: { id: "cname-id" } };
      }
      return undefined;
    });

    mockFetch((url, init) => {
      if (url.includes("/authsettingsV2") && init?.method === "PUT") {
        return { status: 200, body: { properties: {} } };
      }
      return undefined;
    });

    mockFetch((url, init) => {
      if (url.includes(`/staticSites/${SLUG}`) && init?.method === "PATCH") {
        return { status: 200, body: makeSwa(SLUG) };
      }
      return undefined;
    });

    // Dashboard mocks
    mockFetch((url) => {
      if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
        return {
          status: 200,
          body: {
            value: [
              makeSwa(SLUG, { appName: "Budget Tracker", appDescription: "Track spending", deployedAt: new Date().toISOString() }),
            ],
          },
        };
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

    const deployResult = await callTool("app_deploy", {
      folder: appDir,
      app_name: "Budget Tracker",
      app_description: "Track spending",
    });
    assert.ok(!deployResult.isError, `app_deploy failed: ${deployResult.content[0].text}`);
    const deployData = parseResult(deployResult);
    assert.equal(deployData.slug, SLUG);
    assert.ok(deployData.url.includes(SLUG));

    // Verify .deploy.json was written
    const deployJson = JSON.parse(await readFile(join(appDir, ".deploy.json"), "utf8"));
    assert.equal(deployJson.appSlug, SLUG);

    // Verify deployedBy tag was sent
    const patchCalls = getFetchCalls().filter((c) => c.init?.method === "PATCH");
    assert.ok(patchCalls.length > 0, "Should have PATCH call for tags");
    const tagBody = JSON.parse(patchCalls[0].init?.body as string);
    assert.equal(tagBody.tags.deployedBy, "alice@fidoo.cloud");

    // ---- Step 5: app_list — verify app appears ----
    const listResult = await callTool("app_list");
    assert.ok(!listResult.isError, `app_list failed: ${listResult.content[0].text}`);
    const listData = parseResult(listResult);
    assert.ok(Array.isArray(listData.apps));
    assert.ok(listData.apps.length > 0);
    assert.equal(listData.apps[0].slug, SLUG);

    // ---- Step 6: app_info — get details ----
    // Uses the persistent getStaticWebApp mock from step 4 (returns with tags)
    const infoResult = await callTool("app_info", { app_slug: SLUG });
    assert.ok(!infoResult.isError, `app_info failed: ${infoResult.content[0].text}`);
    const infoData = parseResult(infoResult);
    assert.equal(infoData.slug, SLUG);
    assert.equal(infoData.name, "Budget Tracker");

    // ---- Step 7: app_update_info — change description ----
    mockFetch((url, init) => {
      if (url.includes(`/staticSites/${SLUG}`) && init?.method === "PATCH") {
        return { status: 200, body: makeSwa(SLUG) };
      }
      return undefined;
    });

    const updateResult = await callTool("app_update_info", {
      app_slug: SLUG,
      app_description: "Track expenses and budgets",
    });
    assert.ok(!updateResult.isError, `app_update_info failed: ${updateResult.content[0].text}`);

    // ---- Step 8: app_deploy — re-deploy ----
    // .deploy.json exists now, so it should re-deploy
    const redeployResult = await callTool("app_deploy", { folder: appDir });
    assert.ok(!redeployResult.isError, `re-deploy failed: ${redeployResult.content[0].text}`);
    const redeployData = parseResult(redeployResult);
    assert.equal(redeployData.slug, SLUG);

    // ---- Step 9: app_delete ----
    // Mock delete SWA
    mockFetch((url, init) => {
      if (url.includes(`/staticSites/${SLUG}`) && init?.method === "DELETE") {
        return { status: 204, body: null };
      }
      return undefined;
    });

    // Mock delete CNAME
    mockFetch((url, init) => {
      if (url.includes(`/CNAME/${SLUG}`) && init?.method === "DELETE") {
        return { status: 204, body: null };
      }
      return undefined;
    });

    const deleteResult = await callTool("app_delete", { app_slug: SLUG });
    assert.ok(!deleteResult.isError, `app_delete failed: ${deleteResult.content[0].text}`);
    const deleteData = parseResult(deleteResult);
    assert.ok(deleteData.message.includes("deleted"));
  });
});
