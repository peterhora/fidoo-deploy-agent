import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseJsonRpcMessage, formatResponse, formatError, ErrorCodes, } from "../src/protocol.js";
describe("parseJsonRpcMessage", () => {
    it("parses a valid request", () => {
        const msg = parseJsonRpcMessage('{"jsonrpc":"2.0","id":1,"method":"test","params":{"a":1}}');
        assert.equal(msg.jsonrpc, "2.0");
        assert.equal(msg.id, 1);
        assert.equal(msg.method, "test");
        assert.deepEqual(msg.params, { a: 1 });
    });
    it("parses a request with string id", () => {
        const msg = parseJsonRpcMessage('{"jsonrpc":"2.0","id":"abc","method":"test"}');
        assert.equal(msg.id, "abc");
    });
    it("parses a request without params", () => {
        const msg = parseJsonRpcMessage('{"jsonrpc":"2.0","id":1,"method":"test"}');
        assert.equal(msg.method, "test");
        assert.equal(msg.params, undefined);
    });
    it("parses a notification (no id)", () => {
        const msg = parseJsonRpcMessage('{"jsonrpc":"2.0","method":"notifications/initialized"}');
        assert.equal(msg.method, "notifications/initialized");
        assert.equal("id" in msg, false);
    });
    it("rejects missing jsonrpc field", () => {
        assert.throws(() => parseJsonRpcMessage('{"id":1,"method":"test"}'), /jsonrpc/);
    });
    it("rejects wrong jsonrpc version", () => {
        assert.throws(() => parseJsonRpcMessage('{"jsonrpc":"1.0","id":1,"method":"test"}'), /jsonrpc/);
    });
    it("rejects missing method", () => {
        assert.throws(() => parseJsonRpcMessage('{"jsonrpc":"2.0","id":1}'), /method/);
    });
    it("throws on malformed JSON", () => {
        assert.throws(() => parseJsonRpcMessage("{not json}"), /Parse error/);
    });
    it("throws on non-object JSON", () => {
        assert.throws(() => parseJsonRpcMessage('"just a string"'), /object/);
    });
});
describe("formatResponse", () => {
    it("formats a success response", () => {
        const resp = formatResponse(1, { tools: [] });
        assert.deepEqual(resp, {
            jsonrpc: "2.0",
            id: 1,
            result: { tools: [] },
        });
    });
    it("formats a response with string id", () => {
        const resp = formatResponse("abc", "ok");
        assert.equal(resp.id, "abc");
        assert.equal(resp.result, "ok");
    });
});
describe("formatError", () => {
    it("formats an error response", () => {
        const resp = formatError(1, ErrorCodes.MethodNotFound, "Not found");
        assert.deepEqual(resp, {
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32601, message: "Not found" },
        });
    });
    it("formats an error with null id", () => {
        const resp = formatError(null, ErrorCodes.ParseError, "Parse error");
        assert.equal(resp.id, null);
        assert.equal(resp.error.code, -32700);
    });
    it("includes data when provided", () => {
        const resp = formatError(1, ErrorCodes.InternalError, "fail", {
            detail: "x",
        });
        assert.deepEqual(resp.error.data, { detail: "x" });
    });
});
//# sourceMappingURL=protocol.test.js.map