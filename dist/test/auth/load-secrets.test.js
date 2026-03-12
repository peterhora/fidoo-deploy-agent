import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installMockFetch, restoreFetch, mockFetch, getFetchCalls } from "../helpers/mock-fetch.js";
import { config, loadSecrets, resetSecretsLoaded } from "../../src/config.js";
describe("loadSecrets", () => {
    const saved = {};
    beforeEach(() => {
        installMockFetch();
        resetSecretsLoaded();
        for (const f of ["storageKey", "acrAdminPassword", "portalClientSecret", "graphSpClientSecret", "keyVaultName"]) {
            saved[f] = config[f];
        }
    });
    afterEach(() => {
        restoreFetch();
        for (const [k, v] of Object.entries(saved)) {
            config[k] = v;
        }
    });
    it("is a no-op when keyVaultName is empty", async () => {
        config.keyVaultName = "";
        await loadSecrets("some-token");
        assert.equal(getFetchCalls().length, 0);
    });
    it("fetches all 4 secrets in parallel and populates config", async () => {
        config.keyVaultName = "test-vault";
        config.storageKey = "";
        config.acrAdminPassword = "";
        config.portalClientSecret = "";
        config.graphSpClientSecret = "";
        mockFetch((url) => {
            if (url.includes("deploy-storage-key"))
                return { status: 200, body: { value: "sk-val" } };
            if (url.includes("deploy-acr-admin-password"))
                return { status: 200, body: { value: "acr-val" } };
            if (url.includes("deploy-portal-client-secret"))
                return { status: 200, body: { value: "portal-val" } };
            if (url.includes("deploy-graph-sp-client-secret"))
                return { status: 200, body: { value: "graph-val" } };
            return undefined;
        });
        await loadSecrets("vault-token");
        assert.equal(config.storageKey, "sk-val");
        assert.equal(config.acrAdminPassword, "acr-val");
        assert.equal(config.portalClientSecret, "portal-val");
        assert.equal(config.graphSpClientSecret, "graph-val");
        assert.equal(getFetchCalls().length, 4);
    });
    it("is idempotent — second call is a no-op", async () => {
        config.keyVaultName = "test-vault";
        config.storageKey = "";
        config.acrAdminPassword = "";
        config.portalClientSecret = "";
        config.graphSpClientSecret = "";
        mockFetch(() => ({ status: 200, body: { value: "val" } }));
        await loadSecrets("tok");
        const callsAfterFirst = getFetchCalls().length;
        await loadSecrets("tok");
        assert.equal(getFetchCalls().length, callsAfterFirst);
    });
    it("skips fields already populated via env vars", async () => {
        config.keyVaultName = "test-vault";
        config.storageKey = "env-sk";
        config.acrAdminPassword = "env-ap";
        config.portalClientSecret = "env-pc";
        config.graphSpClientSecret = "env-gs";
        mockFetch(() => { throw new Error("Should not fetch"); });
        await loadSecrets("some-token");
        assert.equal(getFetchCalls().length, 0);
    });
    it("fetches only missing secrets (partial env var override)", async () => {
        config.keyVaultName = "test-vault";
        config.storageKey = "env-sk";
        config.acrAdminPassword = "";
        config.portalClientSecret = "";
        config.graphSpClientSecret = "env-gs";
        mockFetch((url) => {
            if (url.includes("deploy-acr-admin-password"))
                return { status: 200, body: { value: "acr-val" } };
            if (url.includes("deploy-portal-client-secret"))
                return { status: 200, body: { value: "portal-val" } };
            return undefined;
        });
        await loadSecrets("tok");
        assert.equal(config.storageKey, "env-sk");
        assert.equal(config.acrAdminPassword, "acr-val");
        assert.equal(config.portalClientSecret, "portal-val");
        assert.equal(config.graphSpClientSecret, "env-gs");
        assert.equal(getFetchCalls().length, 2);
    });
    it("propagates error when one secret fetch fails (secretsLoaded stays false)", async () => {
        config.keyVaultName = "test-vault";
        config.storageKey = "";
        config.acrAdminPassword = "";
        config.portalClientSecret = "";
        config.graphSpClientSecret = "";
        mockFetch((url) => {
            if (url.includes("deploy-storage-key"))
                return { status: 200, body: { value: "ok" } };
            if (url.includes("deploy-acr-admin-password"))
                return { status: 403, body: { error: "Forbidden" } };
            return { status: 200, body: { value: "ok" } };
        });
        await assert.rejects(() => loadSecrets("tok"), (err) => {
            assert.ok(err.message.includes("403"));
            return true;
        });
        // secretsLoaded should still be false — next call should retry
        config.storageKey = "";
        config.acrAdminPassword = "";
        config.portalClientSecret = "";
        config.graphSpClientSecret = "";
        mockFetch(() => ({ status: 200, body: { value: "retry-ok" } }));
        await loadSecrets("tok");
        assert.equal(config.storageKey, "retry-ok");
    });
});
//# sourceMappingURL=load-secrets.test.js.map