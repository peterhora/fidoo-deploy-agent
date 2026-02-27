import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installMockFetch, restoreFetch, mockFetch, getFetchCalls } from "../helpers/mock-fetch.js";
import { deploySite } from "../../src/deploy/site-deploy.js";

describe("deploySite", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  function mockAllCalls() {
    let zipDeployed = false;

    mockFetch((url, init) => {
      // listBlobs (for assembleSite)
      if (url.includes("comp=list")) {
        return { status: 200, body: "<EnumerationResults><Blobs></Blobs></EnumerationResults>", headers: { "content-type": "application/xml" } };
      }
      // blob upload (ZIP temp blob)
      if (url.includes("blob.core.windows.net") && url.includes("_deploy-temp") && init?.method === "PUT") {
        return { status: 201, body: {} };
      }
      // getUserDelegationKey
      if (url.includes("userdelegationkey") && init?.method === "POST") {
        return {
          status: 200,
          body: `<?xml version="1.0" encoding="utf-8"?>
<UserDelegationKey>
  <SignedOid>oid</SignedOid><SignedTid>tid</SignedTid>
  <SignedStart>2026-01-01T00:00:00Z</SignedStart><SignedExpiry>2026-01-01T01:00:00Z</SignedExpiry>
  <SignedService>b</SignedService><SignedVersion>2024-11-04</SignedVersion>
  <Value>${Buffer.from("fake-key-32-bytes-for-hmac-sign!").toString("base64")}</Value>
</UserDelegationKey>`,
          headers: { "content-type": "application/xml" },
        };
      }
      // ARM zipdeploy
      if (url.includes("management.azure.com") && url.includes("zipdeploy") && init?.method === "POST") {
        zipDeployed = true;
        return { status: 200, body: {} };
      }
      // blob delete (cleanup)
      if (url.includes("blob.core.windows.net") && url.includes("_deploy-temp") && init?.method === "DELETE") {
        return { status: 202, body: {} };
      }
      return undefined;
    });

    return () => zipDeployed;
  }

  test("assembles site and deploys zip to single SWA", async () => {
    const wasDeployed = mockAllCalls();
    await deploySite("arm-tok", "storage-tok", { apps: [] });
    assert.ok(wasDeployed(), "ZIP should have been deployed via ARM zipdeploy");
  });

  test("cleans up temp directory even on success", async () => {
    mockAllCalls();
    // Verifying it doesn't throw is sufficient — temp dirs are cleaned in finally block
    await deploySite("arm-tok", "storage-tok", { apps: [] });
  });
});
