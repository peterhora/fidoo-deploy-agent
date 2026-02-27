import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installMockFetch, restoreFetch, mockFetch, getFetchCalls } from "../helpers/mock-fetch.js";
import { uploadBlob, downloadBlob, deleteBlob, listBlobs, deleteBlobsByPrefix } from "../../src/azure/blob.js";

describe("blob client", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  test("uploadBlob sends PUT with content", async () => {
    mockFetch((url, init) => {
      if (url.includes("/app-content/my-app/index.html") && init?.method === "PUT") {
        return { status: 201, body: null };
      }
      return undefined;
    });
    await uploadBlob("tok", "my-app/index.html", Buffer.from("<h1>hi</h1>"));
    const calls = getFetchCalls();
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes("my-app/index.html"));
    assert.equal(calls[0].init?.method, "PUT");
    assert.equal((calls[0].init?.headers as Record<string, string>)?.["x-ms-blob-type"], "BlockBlob");
  });

  test("downloadBlob returns buffer", async () => {
    mockFetch((url) => {
      if (url.includes("/app-content/my-app/index.html")) {
        return { status: 200, body: "<h1>hi</h1>", headers: { "content-type": "application/octet-stream" } };
      }
      return undefined;
    });
    const result = await downloadBlob("tok", "my-app/index.html");
    assert.ok(Buffer.isBuffer(result));
  });

  test("downloadBlob returns null for 404", async () => {
    mockFetch(() => ({ status: 404, body: null }));
    const result = await downloadBlob("tok", "missing/file.html");
    assert.equal(result, null);
  });

  test("deleteBlob sends DELETE", async () => {
    mockFetch((url, init) => {
      if (init?.method === "DELETE") return { status: 202, body: null };
      return undefined;
    });
    await deleteBlob("tok", "my-app/index.html");
    const calls = getFetchCalls();
    assert.equal(calls[0].init?.method, "DELETE");
  });

  test("listBlobs returns blob names", async () => {
    mockFetch((url) => {
      if (url.includes("comp=list")) {
        return {
          status: 200,
          body: `<?xml version="1.0" encoding="utf-8"?>
            <EnumerationResults>
              <Blobs>
                <Blob><Name>my-app/index.html</Name></Blob>
                <Blob><Name>my-app/style.css</Name></Blob>
              </Blobs>
            </EnumerationResults>`,
          headers: { "content-type": "application/xml" },
        };
      }
      return undefined;
    });
    const names = await listBlobs("tok", "my-app/");
    assert.deepEqual(names, ["my-app/index.html", "my-app/style.css"]);
  });

  test("listBlobs returns empty array when no blobs", async () => {
    mockFetch(() => ({
      status: 200,
      body: `<?xml version="1.0" encoding="utf-8"?><EnumerationResults><Blobs></Blobs></EnumerationResults>`,
      headers: { "content-type": "application/xml" },
    }));
    const names = await listBlobs("tok");
    assert.deepEqual(names, []);
  });

  test("deleteBlobsByPrefix deletes all matching blobs", async () => {
    let deletedPaths: string[] = [];
    mockFetch((url, init) => {
      if (url.includes("comp=list")) {
        return {
          status: 200,
          body: `<?xml version="1.0" encoding="utf-8"?>
            <EnumerationResults>
              <Blobs>
                <Blob><Name>my-app/index.html</Name></Blob>
                <Blob><Name>my-app/style.css</Name></Blob>
              </Blobs>
            </EnumerationResults>`,
        };
      }
      if (init?.method === "DELETE") {
        deletedPaths.push(url);
        return { status: 202, body: null };
      }
      return undefined;
    });
    await deleteBlobsByPrefix("tok", "my-app/");
    assert.equal(deletedPaths.length, 2);
  });
});
