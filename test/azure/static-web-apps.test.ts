import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  installMockFetch,
  restoreFetch,
  mockFetch,
  getFetchCalls,
} from "../helpers/mock-fetch.js";
import {
  createStaticWebApp,
  getStaticWebApp,
  deleteStaticWebApp,
  listStaticWebApps,
  getDeploymentToken,
  updateTags,
  configureAuth,
  deploySwaZip,
} from "../../src/azure/static-web-apps.js";

const TOKEN = "test-access-token";

const RESOURCE_ID =
  "/subscriptions/PLACEHOLDER_SUBSCRIPTION_ID/resourceGroups/rg-published-apps/providers/Microsoft.Web/staticSites/my-app";

describe("createStaticWebApp", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("PUTs to ARM staticSites endpoint with location and sku", async () => {
    mockFetch((url, init) => {
      if (url.includes("/staticSites/my-app") && init?.method === "PUT") {
        return {
          status: 200,
          body: { id: RESOURCE_ID, name: "my-app", location: "westeurope" },
        };
      }
      return undefined;
    });

    const result = await createStaticWebApp(TOKEN, "my-app", {
      appName: "My App",
      appDescription: "A test app",
    });

    assert.equal(result.name, "my-app");

    const calls = getFetchCalls();
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes("/staticSites/my-app"));
    assert.ok(calls[0].url.includes("api-version="));
    assert.equal(calls[0].init?.method, "PUT");

    const body = JSON.parse(calls[0].init?.body as string);
    assert.equal(body.location, "westeurope");
    assert.equal(body.sku.name, "Free");
    assert.equal(body.sku.tier, "Free");
    assert.equal(body.tags.appName, "My App");
    assert.equal(body.tags.appDescription, "A test app");
  });
});

describe("getStaticWebApp", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("GETs the staticSites resource by slug", async () => {
    mockFetch((url, init) => {
      if (url.includes("/staticSites/my-app") && (!init?.method || init.method === "GET")) {
        return {
          status: 200,
          body: {
            id: RESOURCE_ID,
            name: "my-app",
            properties: { defaultHostname: "my-app.azurestaticapps.net" },
            tags: { appName: "My App" },
          },
        };
      }
      return undefined;
    });

    const result = await getStaticWebApp(TOKEN, "my-app");

    assert.equal(result.name, "my-app");
    assert.equal(result.tags.appName, "My App");

    const calls = getFetchCalls();
    assert.equal(calls[0].init?.method, "GET");
  });
});

describe("deleteStaticWebApp", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("DELETEs the staticSites resource", async () => {
    mockFetch((url, init) => {
      if (url.includes("/staticSites/my-app") && init?.method === "DELETE") {
        return { status: 204, body: null };
      }
      return undefined;
    });

    await deleteStaticWebApp(TOKEN, "my-app");

    const calls = getFetchCalls();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init?.method, "DELETE");
    assert.ok(calls[0].url.includes("/staticSites/my-app"));
  });
});

describe("listStaticWebApps", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("GETs all staticSites in the resource group", async () => {
    mockFetch((url) => {
      if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
        return {
          status: 200,
          body: {
            value: [
              { name: "app-one", tags: { appName: "App One" } },
              { name: "app-two", tags: { appName: "App Two" } },
            ],
          },
        };
      }
      return undefined;
    });

    const result = await listStaticWebApps(TOKEN);

    assert.equal(result.length, 2);
    assert.equal(result[0].name, "app-one");
    assert.equal(result[1].name, "app-two");
  });

  it("returns empty array when no apps exist", async () => {
    mockFetch(() => ({
      status: 200,
      body: { value: [] },
    }));

    const result = await listStaticWebApps(TOKEN);

    assert.deepEqual(result, []);
  });
});

describe("getDeploymentToken", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("POSTs to listSecrets and returns deployment token", async () => {
    mockFetch((url, init) => {
      if (url.includes("/listSecrets") && init?.method === "POST") {
        return {
          status: 200,
          body: { properties: { apiKey: "deploy-token-123" } },
        };
      }
      return undefined;
    });

    const token = await getDeploymentToken(TOKEN, "my-app");

    assert.equal(token, "deploy-token-123");

    const calls = getFetchCalls();
    assert.equal(calls[0].init?.method, "POST");
    assert.ok(calls[0].url.includes("/staticSites/my-app/listSecrets"));
  });
});

describe("updateTags", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("PATCHes tags on the resource", async () => {
    mockFetch((url, init) => {
      if (url.includes("/staticSites/my-app") && init?.method === "PATCH") {
        return {
          status: 200,
          body: { name: "my-app", tags: { appName: "New Name" } },
        };
      }
      return undefined;
    });

    const result = await updateTags(TOKEN, "my-app", {
      appName: "New Name",
      appDescription: "New desc",
    });

    assert.equal(result.tags.appName, "New Name");

    const calls = getFetchCalls();
    const body = JSON.parse(calls[0].init?.body as string);
    assert.deepEqual(body.tags, { appName: "New Name", appDescription: "New desc" });
  });
});

describe("configureAuth", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("PUTs auth settings for Entra ID", async () => {
    mockFetch((url, init) => {
      if (url.includes("/config/authsettingsV2") && init?.method === "PUT") {
        return { status: 200, body: { properties: {} } };
      }
      return undefined;
    });

    await configureAuth(TOKEN, "my-app");

    const calls = getFetchCalls();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init?.method, "PUT");
    assert.ok(calls[0].url.includes("/staticSites/my-app/config/authsettingsV2"));

    const body = JSON.parse(calls[0].init?.body as string);
    assert.ok(body.properties.identityProviders.azureActiveDirectory);
    assert.equal(
      body.properties.identityProviders.azureActiveDirectory.registration.clientIdSettingName,
      "AZURE_CLIENT_ID",
    );
  });
});

describe("deploySwaZip", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("gets deployment token and POSTs ZIP buffer", async () => {
    // Mock listSecrets (getDeploymentToken)
    mockFetch((url, init) => {
      if (url.includes("/listSecrets") && init?.method === "POST") {
        return {
          status: 200,
          body: { properties: { apiKey: "deploy-key-abc" } },
        };
      }
      return undefined;
    });

    // Mock getStaticWebApp (for defaultHostname)
    mockFetch((url, init) => {
      if (
        url.includes("/staticSites/my-app") &&
        !url.includes("/listSecrets") &&
        (!init?.method || init.method === "GET")
      ) {
        return {
          status: 200,
          body: {
            id: RESOURCE_ID,
            name: "my-app",
            properties: { defaultHostname: "my-app.azurestaticapps.net" },
            tags: {},
          },
        };
      }
      return undefined;
    });

    // Mock zipdeploy POST
    mockFetch((url, init) => {
      if (url.includes("zipdeploy") && init?.method === "POST") {
        return { status: 200, body: {} };
      }
      return undefined;
    });

    const zipBuffer = Buffer.from("fake-zip-content");
    await deploySwaZip(TOKEN, "my-app", zipBuffer);

    const calls = getFetchCalls();
    // Should have 3 calls: listSecrets, getStaticWebApp, zipdeploy
    assert.equal(calls.length, 3);

    // Verify zipdeploy call
    const zipCall = calls.find((c) => c.url.includes("zipdeploy"))!;
    assert.ok(zipCall, "Should have a zipdeploy call");
    assert.equal(zipCall.init?.method, "POST");
    assert.ok(
      zipCall.url.includes("my-app.azurestaticapps.net"),
      "URL should contain the SWA hostname",
    );

    // Verify Authorization header is raw token (not Bearer)
    const headers = zipCall.init?.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "deploy-key-abc");
    assert.equal(headers["Content-Type"], "application/octet-stream");

    // Verify body is the zip buffer
    assert.equal(zipCall.init?.body, zipBuffer);
  });

  it("throws on deployment failure", async () => {
    // Mock listSecrets
    mockFetch((url, init) => {
      if (url.includes("/listSecrets") && init?.method === "POST") {
        return {
          status: 200,
          body: { properties: { apiKey: "deploy-key-abc" } },
        };
      }
      return undefined;
    });

    // Mock getStaticWebApp
    mockFetch((url, init) => {
      if (
        url.includes("/staticSites/my-app") &&
        !url.includes("/listSecrets") &&
        (!init?.method || init.method === "GET")
      ) {
        return {
          status: 200,
          body: {
            id: RESOURCE_ID,
            name: "my-app",
            properties: { defaultHostname: "my-app.azurestaticapps.net" },
            tags: {},
          },
        };
      }
      return undefined;
    });

    // Mock zipdeploy POST returning 400
    mockFetch((url, init) => {
      if (url.includes("zipdeploy") && init?.method === "POST") {
        return { status: 400, body: { error: "Bad Request" } };
      }
      return undefined;
    });

    const zipBuffer = Buffer.from("bad-zip");
    await assert.rejects(() => deploySwaZip(TOKEN, "my-app", zipBuffer), {
      message: /deploy.*fail/i,
    });
  });
});
