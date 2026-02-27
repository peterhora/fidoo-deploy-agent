import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installMockFetch, restoreFetch, mockFetch, getFetchCalls, } from "../helpers/mock-fetch.js";
import { azureFetch } from "../../src/azure/rest-client.js";
const TOKEN = "test-access-token";
describe("azureFetch", () => {
    beforeEach(() => installMockFetch());
    afterEach(() => restoreFetch());
    it("prepends ARM base URL and adds Bearer header", async () => {
        mockFetch((url, init) => {
            if (url.includes("management.azure.com")) {
                return { status: 200, body: { id: "resource-1" } };
            }
            return undefined;
        });
        const result = await azureFetch("/subscriptions/sub-1/resourceGroups/rg-1", {
            token: TOKEN,
        });
        assert.deepEqual(result, { id: "resource-1" });
        const calls = getFetchCalls();
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, "https://management.azure.com/subscriptions/sub-1/resourceGroups/rg-1");
        const headers = calls[0].init?.headers;
        assert.equal(headers["Authorization"], `Bearer ${TOKEN}`);
    });
    it("appends api-version query parameter", async () => {
        mockFetch(() => ({ status: 200, body: {} }));
        await azureFetch("/subscriptions/sub-1", {
            token: TOKEN,
            apiVersion: "2022-09-01",
        });
        const calls = getFetchCalls();
        assert.equal(calls[0].url, "https://management.azure.com/subscriptions/sub-1?api-version=2022-09-01");
    });
    it("defaults to GET method", async () => {
        mockFetch(() => ({ status: 200, body: {} }));
        await azureFetch("/test", { token: TOKEN });
        const calls = getFetchCalls();
        assert.equal(calls[0].init?.method, "GET");
    });
    it("sends JSON body with Content-Type header for PUT/POST", async () => {
        mockFetch(() => ({ status: 200, body: {} }));
        await azureFetch("/test", {
            token: TOKEN,
            method: "PUT",
            body: { location: "westeurope" },
        });
        const calls = getFetchCalls();
        assert.equal(calls[0].init?.method, "PUT");
        const headers = calls[0].init?.headers;
        assert.equal(headers["Content-Type"], "application/json");
        assert.equal(calls[0].init?.body, JSON.stringify({ location: "westeurope" }));
    });
    it("does not send Content-Type for GET/DELETE without body", async () => {
        mockFetch(() => ({ status: 200, body: {} }));
        await azureFetch("/test", { token: TOKEN, method: "DELETE" });
        const calls = getFetchCalls();
        const headers = calls[0].init?.headers;
        assert.equal(headers["Content-Type"], undefined);
    });
    it("returns parsed JSON body on success", async () => {
        mockFetch(() => ({
            status: 200,
            body: { name: "my-app", location: "westeurope" },
        }));
        const result = await azureFetch("/test", { token: TOKEN });
        assert.deepEqual(result, { name: "my-app", location: "westeurope" });
    });
    it("returns null on 204 No Content", async () => {
        mockFetch(() => ({ status: 204, body: null }));
        const result = await azureFetch("/test", { token: TOKEN, method: "DELETE" });
        assert.equal(result, null);
    });
    it("throws AzureError with status and body on 4xx", async () => {
        mockFetch(() => ({
            status: 404,
            body: { error: { code: "ResourceNotFound", message: "Not found" } },
        }));
        await assert.rejects(() => azureFetch("/test", { token: TOKEN }), (err) => {
            assert.equal(err.name, "AzureError");
            assert.equal(err.status, 404);
            assert.equal(err.code, "ResourceNotFound");
            assert.ok(err.message.includes("Not found"));
            return true;
        });
    });
    it("throws AzureError on 401 Unauthorized", async () => {
        mockFetch(() => ({
            status: 401,
            body: { error: { code: "AuthenticationFailed", message: "Token expired" } },
        }));
        await assert.rejects(() => azureFetch("/test", { token: TOKEN }), (err) => {
            assert.equal(err.name, "AzureError");
            assert.equal(err.status, 401);
            assert.equal(err.code, "AuthenticationFailed");
            return true;
        });
    });
    it("throws AzureError on 5xx", async () => {
        mockFetch(() => ({
            status: 500,
            body: { error: { code: "InternalServerError", message: "Server error" } },
        }));
        await assert.rejects(() => azureFetch("/test", { token: TOKEN }), (err) => {
            assert.equal(err.name, "AzureError");
            assert.equal(err.status, 500);
            return true;
        });
    });
    it("throws AzureError on 429 Too Many Requests", async () => {
        mockFetch(() => ({
            status: 429,
            body: { error: { code: "TooManyRequests", message: "Rate limited" } },
        }));
        await assert.rejects(() => azureFetch("/test", { token: TOKEN }), (err) => {
            assert.equal(err.name, "AzureError");
            assert.equal(err.status, 429);
            assert.equal(err.code, "TooManyRequests");
            return true;
        });
    });
    it("handles error responses without standard Azure error envelope", async () => {
        mockFetch(() => ({
            status: 403,
            body: { message: "Forbidden" },
        }));
        await assert.rejects(() => azureFetch("/test", { token: TOKEN }), (err) => {
            assert.equal(err.name, "AzureError");
            assert.equal(err.status, 403);
            assert.equal(err.code, "UnknownError");
            return true;
        });
    });
});
//# sourceMappingURL=rest-client.test.js.map