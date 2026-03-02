import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { generateLoginHtml } from "../../src/deploy/login.js";

describe("generateLoginHtml", () => {
  test("returns valid HTML", () => assert.ok(generateLoginHtml().includes("<!DOCTYPE html>")));
  test("includes AAD login URL", () => assert.ok(generateLoginHtml().includes("/.auth/login/aad")));
  test("reads document.referrer", () => assert.ok(generateLoginHtml().includes("document.referrer")));
  test("uses location.replace", () => assert.ok(generateLoginHtml().includes("location.replace")));
  test("same-origin guard", () => assert.ok(generateLoginHtml().includes("refUrl.origin === ORIGIN")));
  test("loop guard for /login", () => assert.ok(generateLoginHtml().includes('startsWith("/login")')));
  test("encodes redirect URI", () => assert.ok(generateLoginHtml().includes("encodeURIComponent")));
  test("noscript fallback", () => assert.ok(generateLoginHtml().includes("<noscript>")));
  test("no literal </script> in script block", () => {
    const html = generateLoginHtml();
    const m = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(m && !m[1].includes("</script>"));
  });
});
