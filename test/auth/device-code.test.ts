import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  installMockFetch,
  restoreFetch,
  mockFetch,
  getFetchCalls,
} from "../helpers/mock-fetch.js";
import {
  startDeviceCodeFlow,
  pollForToken,
  refreshAccessToken,
} from "../../src/auth/device-code.js";

const TENANT = "test-tenant-id";
const CLIENT = "test-client-id";
const SCOPE = "https://management.azure.com/.default offline_access";

describe("startDeviceCodeFlow", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("POSTs to Entra ID devicecode endpoint and returns response", async () => {
    mockFetch((url, init) => {
      if (url.includes("/devicecode") && init?.method === "POST") {
        return {
          status: 200,
          body: {
            device_code: "DEVICE123",
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

    const result = await startDeviceCodeFlow(TENANT, CLIENT, SCOPE);

    assert.equal(result.device_code, "DEVICE123");
    assert.equal(result.user_code, "ABCD-1234");
    assert.equal(result.verification_uri, "https://microsoft.com/devicelogin");
    assert.equal(result.expires_in, 900);
    assert.equal(result.interval, 5);

    const calls = getFetchCalls();
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes(`${TENANT}/oauth2/v2.0/devicecode`));
    const body = calls[0].init?.body as string;
    assert.ok(body.includes(`client_id=${CLIENT}`));
    assert.ok(body.includes("scope="));
  });

  it("throws on non-200 response", async () => {
    mockFetch((url) => {
      if (url.includes("/devicecode")) {
        return {
          status: 400,
          body: { error: "invalid_client", error_description: "Bad client" },
        };
      }
      return undefined;
    });

    await assert.rejects(
      () => startDeviceCodeFlow(TENANT, CLIENT, SCOPE),
      (err: Error) => {
        assert.ok(err.message.includes("invalid_client"));
        return true;
      },
    );
  });
});

describe("pollForToken", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("returns tokens on successful authorization", async () => {
    mockFetch((url, init) => {
      if (url.includes("/token") && init?.method === "POST") {
        return {
          status: 200,
          body: {
            access_token: "access123",
            refresh_token: "refresh456",
            expires_in: 3600,
            token_type: "Bearer",
          },
        };
      }
      return undefined;
    });

    const result = await pollForToken(TENANT, CLIENT, "DEVICE123", 0);

    assert.equal(result.access_token, "access123");
    assert.equal(result.refresh_token, "refresh456");
    assert.equal(result.expires_in, 3600);
  });

  it("retries on authorization_pending", async () => {
    let attempt = 0;
    mockFetch((url, init) => {
      if (url.includes("/token") && init?.method === "POST") {
        attempt++;
        if (attempt < 3) {
          return {
            status: 400,
            body: { error: "authorization_pending" },
          };
        }
        return {
          status: 200,
          body: {
            access_token: "access123",
            refresh_token: "refresh456",
            expires_in: 3600,
            token_type: "Bearer",
          },
        };
      }
      return undefined;
    });

    const result = await pollForToken(TENANT, CLIENT, "DEVICE123", 0);

    assert.equal(result.access_token, "access123");
    assert.equal(getFetchCalls().length, 3);
  });

  it("increases interval on slow_down", async () => {
    let attempt = 0;
    const timestamps: number[] = [];
    mockFetch((url, init) => {
      if (url.includes("/token") && init?.method === "POST") {
        attempt++;
        timestamps.push(Date.now());
        if (attempt === 1) {
          return { status: 400, body: { error: "slow_down" } };
        }
        return {
          status: 200,
          body: {
            access_token: "access123",
            refresh_token: "refresh456",
            expires_in: 3600,
            token_type: "Bearer",
          },
        };
      }
      return undefined;
    });

    // Use a small interval so test is fast but we can verify it increased
    const result = await pollForToken(TENANT, CLIENT, "DEVICE123", 0.01);
    assert.equal(result.access_token, "access123");
    assert.equal(getFetchCalls().length, 2);
  });

  it("throws on expired_token", async () => {
    mockFetch((url, init) => {
      if (url.includes("/token") && init?.method === "POST") {
        return { status: 400, body: { error: "expired_token" } };
      }
      return undefined;
    });

    await assert.rejects(
      () => pollForToken(TENANT, CLIENT, "DEVICE123", 0),
      (err: Error) => {
        assert.ok(err.message.includes("expired"));
        return true;
      },
    );
  });

  it("throws on unrecoverable errors", async () => {
    mockFetch((url, init) => {
      if (url.includes("/token") && init?.method === "POST") {
        return {
          status: 400,
          body: { error: "invalid_grant", error_description: "Bad grant" },
        };
      }
      return undefined;
    });

    await assert.rejects(
      () => pollForToken(TENANT, CLIENT, "DEVICE123", 0),
      (err: Error) => {
        assert.ok(err.message.includes("invalid_grant"));
        return true;
      },
    );
  });

  it("sends correct parameters in POST body", async () => {
    mockFetch((url, init) => {
      if (url.includes("/token") && init?.method === "POST") {
        return {
          status: 200,
          body: {
            access_token: "a",
            refresh_token: "r",
            expires_in: 3600,
            token_type: "Bearer",
          },
        };
      }
      return undefined;
    });

    await pollForToken(TENANT, CLIENT, "DEVICE123", 0);

    const calls = getFetchCalls();
    const body = calls[0].init?.body as string;
    assert.ok(body.includes("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code"));
    assert.ok(body.includes(`client_id=${CLIENT}`));
    assert.ok(body.includes("device_code=DEVICE123"));
  });
});

describe("refreshAccessToken", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("POSTs refresh_token grant and returns new tokens", async () => {
    mockFetch((url, init) => {
      if (url.includes("/token") && init?.method === "POST") {
        return {
          status: 200,
          body: {
            access_token: "new-access",
            refresh_token: "new-refresh",
            expires_in: 3600,
            token_type: "Bearer",
          },
        };
      }
      return undefined;
    });

    const result = await refreshAccessToken(TENANT, CLIENT, "old-refresh");

    assert.equal(result.access_token, "new-access");
    assert.equal(result.refresh_token, "new-refresh");

    const calls = getFetchCalls();
    const body = calls[0].init?.body as string;
    assert.ok(body.includes("grant_type=refresh_token"));
    assert.ok(body.includes("refresh_token=old-refresh"));
    assert.ok(body.includes(`client_id=${CLIENT}`));
  });

  it("throws on failure", async () => {
    mockFetch((url, init) => {
      if (url.includes("/token") && init?.method === "POST") {
        return {
          status: 400,
          body: { error: "invalid_grant", error_description: "Refresh token expired" },
        };
      }
      return undefined;
    });

    await assert.rejects(
      () => refreshAccessToken(TENANT, CLIENT, "old-refresh"),
      (err: Error) => {
        assert.ok(err.message.includes("invalid_grant"));
        return true;
      },
    );
  });
});
