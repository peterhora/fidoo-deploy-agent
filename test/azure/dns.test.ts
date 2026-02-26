import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  installMockFetch,
  restoreFetch,
  mockFetch,
  getFetchCalls,
} from "../helpers/mock-fetch.js";
import {
  createCnameRecord,
  deleteCnameRecord,
  getCnameRecord,
} from "../../src/azure/dns.js";

const TOKEN = "test-access-token";

describe("createCnameRecord", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("PUTs a CNAME record in the DNS zone", async () => {
    mockFetch((url, init) => {
      if (url.includes("/CNAME/my-app") && init?.method === "PUT") {
        return {
          status: 200,
          body: {
            name: "my-app",
            properties: { CNAMERecord: { cname: "my-app.azurestaticapps.net" } },
          },
        };
      }
      return undefined;
    });

    const result = await createCnameRecord(TOKEN, "my-app", "my-app.azurestaticapps.net");

    assert.equal(result.name, "my-app");

    const calls = getFetchCalls();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init?.method, "PUT");
    assert.ok(calls[0].url.includes("/dnsZones/env.fidoo.cloud/CNAME/my-app"));
    assert.ok(calls[0].url.includes("api-version="));

    const body = JSON.parse(calls[0].init?.body as string);
    assert.equal(body.properties.TTL, 3600);
    assert.equal(body.properties.CNAMERecord.cname, "my-app.azurestaticapps.net");
  });
});

describe("deleteCnameRecord", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("DELETEs the CNAME record from the DNS zone", async () => {
    mockFetch((url, init) => {
      if (url.includes("/CNAME/my-app") && init?.method === "DELETE") {
        return { status: 204, body: null };
      }
      return undefined;
    });

    await deleteCnameRecord(TOKEN, "my-app");

    const calls = getFetchCalls();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init?.method, "DELETE");
    assert.ok(calls[0].url.includes("/dnsZones/env.fidoo.cloud/CNAME/my-app"));
  });
});

describe("getCnameRecord", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("GETs the CNAME record by name", async () => {
    mockFetch((url) => {
      if (url.includes("/CNAME/my-app")) {
        return {
          status: 200,
          body: {
            name: "my-app",
            properties: {
              TTL: 3600,
              CNAMERecord: { cname: "my-app.azurestaticapps.net" },
            },
          },
        };
      }
      return undefined;
    });

    const result = await getCnameRecord(TOKEN, "my-app");

    assert.equal(result.name, "my-app");
    assert.equal(result.properties.CNAMERecord.cname, "my-app.azurestaticapps.net");

    const calls = getFetchCalls();
    assert.equal(calls[0].init?.method, "GET");
  });
});
