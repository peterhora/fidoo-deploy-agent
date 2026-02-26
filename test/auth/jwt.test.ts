import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractUpn } from "../../src/auth/jwt.js";

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.fake-signature`;
}

describe("extractUpn", () => {
  it("extracts upn claim from JWT", () => {
    const token = makeJwt({ upn: "alice@fidoo.cloud", sub: "abc" });
    assert.equal(extractUpn(token), "alice@fidoo.cloud");
  });

  it("falls back to preferred_username if upn is absent", () => {
    const token = makeJwt({ preferred_username: "bob@fidoo.cloud", sub: "abc" });
    assert.equal(extractUpn(token), "bob@fidoo.cloud");
  });

  it("prefers upn over preferred_username", () => {
    const token = makeJwt({
      upn: "alice@fidoo.cloud",
      preferred_username: "bob@fidoo.cloud",
    });
    assert.equal(extractUpn(token), "alice@fidoo.cloud");
  });

  it("returns undefined when neither claim exists", () => {
    const token = makeJwt({ sub: "abc", name: "Test User" });
    assert.equal(extractUpn(token), undefined);
  });

  it("returns undefined for malformed token (no dots)", () => {
    assert.equal(extractUpn("not-a-jwt"), undefined);
  });

  it("returns undefined for malformed payload (bad base64)", () => {
    assert.equal(extractUpn("header.!!!invalid!!!.signature"), undefined);
  });

  it("returns undefined for empty string", () => {
    assert.equal(extractUpn(""), undefined);
  });

  it("handles base64url padding correctly", () => {
    // Payload with a short email — may produce base64 without padding
    const token = makeJwt({ upn: "a@b.c" });
    assert.equal(extractUpn(token), "a@b.c");
  });
});
