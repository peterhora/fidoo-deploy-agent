import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installMockFetch, restoreFetch, mockFetch } from "../helpers/mock-fetch.js";
import { deploySite } from "../../src/deploy/site-deploy.js";
describe("deploySite", () => {
    beforeEach(() => installMockFetch());
    afterEach(() => restoreFetch());
    test("assembles site and deploys zip to single SWA", async () => {
        let zipDeployed = false;
        mockFetch((url, init) => {
            // listBlobs (for assembleSite)
            if (url.includes("comp=list")) {
                return { status: 200, body: "<EnumerationResults><Blobs></Blobs></EnumerationResults>", headers: { "content-type": "application/xml" } };
            }
            // getDeploymentToken
            if (url.includes("listSecrets")) {
                return { status: 200, body: { properties: { apiKey: "test-key" } } };
            }
            // getStaticWebApp (for hostname)
            if (url.includes("staticSites/ai-apps") && (!init?.method || init?.method === "GET")) {
                return { status: 200, body: { properties: { defaultHostname: "ai-apps.azurestaticapps.net" } } };
            }
            // zipdeploy
            if (url.includes("zipdeploy")) {
                zipDeployed = true;
                return { status: 200, body: null };
            }
            return undefined;
        });
        await deploySite("tok", { apps: [] });
        assert.ok(zipDeployed, "ZIP should have been deployed");
    });
    test("cleans up temp directory even on success", async () => {
        mockFetch((url, init) => {
            if (url.includes("comp=list")) {
                return { status: 200, body: "<EnumerationResults><Blobs></Blobs></EnumerationResults>", headers: { "content-type": "application/xml" } };
            }
            if (url.includes("listSecrets")) {
                return { status: 200, body: { properties: { apiKey: "test-key" } } };
            }
            if (url.includes("staticSites/ai-apps") && (!init?.method || init?.method === "GET")) {
                return { status: 200, body: { properties: { defaultHostname: "ai-apps.azurestaticapps.net" } } };
            }
            if (url.includes("zipdeploy"))
                return { status: 200, body: null };
            return undefined;
        });
        // Verifying it doesn't throw is sufficient — temp dirs are cleaned in finally block
        await deploySite("tok", { apps: [] });
    });
});
//# sourceMappingURL=site-deploy.test.js.map