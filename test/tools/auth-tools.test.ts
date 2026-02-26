import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  installMockFetch,
  restoreFetch,
  mockFetch,
} from "../helpers/mock-fetch.js";
import { saveTokens, type StoredTokens } from "../../src/auth/token-store.js";

// Import tool handlers directly
import { handler as authStatusHandler } from "../../src/tools/auth-status.js";
import { handler as authLoginHandler } from "../../src/tools/auth-login.js";
import { handler as authPollHandler } from "../../src/tools/auth-poll.js";

let tmpDir: string;

function setTokenDir(dir: string): void {
  process.env.DEPLOY_AGENT_TOKEN_DIR = dir;
}

function clearTokenDir(): void {
  delete process.env.DEPLOY_AGENT_TOKEN_DIR;
}

describe("auth_status tool", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-agent-test-"));
    setTokenDir(tmpDir);
  });

  afterEach(() => {
    clearTokenDir();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns not_authenticated when no tokens stored", async () => {
    const result = await authStatusHandler({});
    const text = result.content[0].text;
    const parsed = JSON.parse(text);

    assert.equal(parsed.status, "not_authenticated");
  });

  it("returns authenticated with expiry for valid token", async () => {
    const tokens: StoredTokens = {
      access_token: "access123",
      refresh_token: "refresh456",
      expires_at: Date.now() + 60 * 60 * 1000, // 1 hour from now
    };
    await saveTokens(tokens, tmpDir);

    const result = await authStatusHandler({});
    const text = result.content[0].text;
    const parsed = JSON.parse(text);

    assert.equal(parsed.status, "authenticated");
    assert.ok(parsed.expires_at);
  });

  it("returns expired when token is past expiry (with safety margin)", async () => {
    const tokens: StoredTokens = {
      access_token: "access123",
      refresh_token: "refresh456",
      expires_at: Date.now() + 2 * 60 * 1000, // 2 minutes — within 5-min safety margin
    };
    await saveTokens(tokens, tmpDir);

    const result = await authStatusHandler({});
    const text = result.content[0].text;
    const parsed = JSON.parse(text);

    assert.equal(parsed.status, "expired");
  });
});

describe("auth_login tool", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("starts device code flow and returns user instructions", async () => {
    mockFetch((url) => {
      if (url.includes("/devicecode")) {
        return {
          status: 200,
          body: {
            device_code: "DEV123",
            user_code: "ABCD-1234",
            verification_uri: "https://microsoft.com/devicelogin",
            expires_in: 900,
            interval: 5,
            message: "To sign in, open https://microsoft.com/devicelogin and enter code ABCD-1234",
          },
        };
      }
      return undefined;
    });

    const result = await authLoginHandler({});
    const text = result.content[0].text;
    const parsed = JSON.parse(text);

    assert.equal(parsed.user_code, "ABCD-1234");
    assert.equal(parsed.verification_uri, "https://microsoft.com/devicelogin");
    assert.equal(parsed.device_code, "DEV123");
    assert.ok(parsed.message);
    assert.equal(result.isError, undefined);
  });

  it("returns error on device code failure", async () => {
    mockFetch((url) => {
      if (url.includes("/devicecode")) {
        return {
          status: 400,
          body: { error: "unauthorized_client", error_description: "Not allowed" },
        };
      }
      return undefined;
    });

    const result = await authLoginHandler({});

    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes("unauthorized_client"));
  });
});

describe("auth_poll tool", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-agent-test-"));
    setTokenDir(tmpDir);
    installMockFetch();
  });

  afterEach(() => {
    restoreFetch();
    clearTokenDir();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("polls for token, saves it, and returns success", async () => {
    mockFetch((url) => {
      if (url.includes("/token")) {
        return {
          status: 200,
          body: {
            access_token: "access-new",
            refresh_token: "refresh-new",
            expires_in: 3600,
            token_type: "Bearer",
          },
        };
      }
      return undefined;
    });

    const result = await authPollHandler({ device_code: "DEV123" });
    const text = result.content[0].text;
    const parsed = JSON.parse(text);

    assert.equal(parsed.status, "authenticated");
    assert.ok(parsed.expires_at);

    // Verify tokens were saved to disk
    const storedRaw = fs.readFileSync(path.join(tmpDir, "tokens.json"), "utf-8");
    const stored = JSON.parse(storedRaw);
    assert.equal(stored.access_token, "access-new");
    assert.equal(stored.refresh_token, "refresh-new");
  });

  it("returns error when device_code is missing", async () => {
    const result = await authPollHandler({});

    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes("device_code"));
  });

  it("returns error on token polling failure", async () => {
    mockFetch((url) => {
      if (url.includes("/token")) {
        return {
          status: 400,
          body: { error: "expired_token" },
        };
      }
      return undefined;
    });

    const result = await authPollHandler({ device_code: "DEV123" });

    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes("expired"));
  });
});
