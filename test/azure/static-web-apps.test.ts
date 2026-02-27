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

  const STORAGE_TOKEN = "storage-token-xyz";

  // Helper: mock all calls the new deploySwaZip makes
  function mockDeploySwaZipCalls(zipDeployStatus = 200) {
    // Mock blob upload (PUT to blob storage)
    mockFetch((url, init) => {
      if (url.includes("blob.core.windows.net") && url.includes("_deploy-temp") && init?.method === "PUT") {
        return { status: 201, body: {} };
      }
      return undefined;
    });

    // Mock getUserDelegationKey (POST to blob service)
    mockFetch((url, init) => {
      if (url.includes("blob.core.windows.net") && url.includes("userdelegationkey") && init?.method === "POST") {
        return {
          status: 200,
          body: `<?xml version="1.0" encoding="utf-8"?>
<UserDelegationKey>
  <SignedOid>oid-123</SignedOid>
  <SignedTid>tid-456</SignedTid>
  <SignedStart>2026-01-01T00:00:00Z</SignedStart>
  <SignedExpiry>2026-01-01T01:00:00Z</SignedExpiry>
  <SignedService>b</SignedService>
  <SignedVersion>2024-11-04</SignedVersion>
  <Value>${Buffer.from("fake-key-32-bytes-for-hmac-sign!").toString("base64")}</Value>
</UserDelegationKey>`,
          headers: { "content-type": "application/xml" },
        };
      }
      return undefined;
    });

    // Mock ARM zipdeploy POST
    mockFetch((url, init) => {
      if (url.includes("management.azure.com") && url.includes("zipdeploy") && init?.method === "POST") {
        if (zipDeployStatus === 200 || zipDeployStatus === 202) {
          return { status: zipDeployStatus, body: {} };
        }
        return { status: zipDeployStatus, body: { error: { code: "DeployFailed", message: "Deployment failed" } } };
      }
      return undefined;
    });

    // Mock blob delete (DELETE to blob storage)
    mockFetch((url, init) => {
      if (url.includes("blob.core.windows.net") && url.includes("_deploy-temp") && init?.method === "DELETE") {
        return { status: 202, body: {} };
      }
      return undefined;
    });
  }

  it("uploads ZIP to blob, calls ARM zipdeploy with SAS URL, cleans up", async () => {
    mockDeploySwaZipCalls(200);

    const zipBuffer = Buffer.from("fake-zip-content");
    await deploySwaZip(TOKEN, STORAGE_TOKEN, "my-app", zipBuffer);

    const calls = getFetchCalls();

    // Verify blob upload
    const uploadCall = calls.find((c) => c.url.includes("_deploy-temp") && c.init?.method === "PUT")!;
    assert.ok(uploadCall, "Should upload ZIP to blob storage");

    // Verify ARM zipdeploy call
    const zipCall = calls.find((c) => c.url.includes("management.azure.com") && c.url.includes("zipdeploy"))!;
    assert.ok(zipCall, "Should call ARM zipdeploy API");
    assert.equal(zipCall.init?.method, "POST");
    const body = JSON.parse(zipCall.init?.body as string);
    assert.ok(body.properties.appZipUrl, "Should include appZipUrl");
    assert.ok(body.properties.appZipUrl.includes("sig="), "appZipUrl should contain SAS signature");

    // Verify cleanup
    const deleteCall = calls.find((c) => c.url.includes("_deploy-temp") && c.init?.method === "DELETE")!;
    assert.ok(deleteCall, "Should delete temp blob");
  });

  it("accepts 202 async response", async () => {
    mockDeploySwaZipCalls(202);

    const zipBuffer = Buffer.from("fake-zip-content");
    await deploySwaZip(TOKEN, STORAGE_TOKEN, "my-app", zipBuffer);
    // Should not throw
  });

  it("throws on deployment failure and still cleans up", async () => {
    mockDeploySwaZipCalls(400);

    const zipBuffer = Buffer.from("bad-zip");
    await assert.rejects(() => deploySwaZip(TOKEN, STORAGE_TOKEN, "my-app", zipBuffer));

    // Verify cleanup still happened
    const calls = getFetchCalls();
    const deleteCall = calls.find((c) => c.url.includes("_deploy-temp") && c.init?.method === "DELETE");
    assert.ok(deleteCall, "Should still clean up temp blob on failure");
  });
});
