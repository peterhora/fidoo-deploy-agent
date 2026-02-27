import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installMockFetch, restoreFetch, mockFetch } from "../helpers/mock-fetch.js";
import { loadRegistry, saveRegistry, upsertApp, removeApp } from "../../src/deploy/registry.js";
import type { Registry, AppEntry } from "../../src/deploy/registry.js";

describe("registry", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  const entry: AppEntry = {
    slug: "my-app",
    name: "My App",
    description: "A test app",
    deployedAt: "2026-02-27T10:00:00Z",
    deployedBy: "user@fidoo.cloud",
  };

  describe("loadRegistry", () => {
    test("returns empty registry when blob not found", async () => {
      mockFetch(() => ({ status: 404, body: null }));
      const reg = await loadRegistry("tok");
      assert.deepEqual(reg, { apps: [] });
    });

    test("parses existing registry.json", async () => {
      const data: Registry = { apps: [entry] };
      mockFetch(() => ({ status: 200, body: JSON.stringify(data), headers: { "content-type": "application/octet-stream" } }));
      const reg = await loadRegistry("tok");
      assert.equal(reg.apps.length, 1);
      assert.equal(reg.apps[0].slug, "my-app");
    });
  });

  describe("saveRegistry", () => {
    test("uploads registry.json to blob", async () => {
      let uploadCalled = false;
      mockFetch((_url, init) => {
        if (init?.method === "PUT") {
          uploadCalled = true;
          return { status: 201, body: null };
        }
        return undefined;
      });
      await saveRegistry("tok", { apps: [entry] });
      assert.ok(uploadCalled);
    });
  });

  describe("upsertApp", () => {
    test("adds new app to empty registry", () => {
      const reg = upsertApp({ apps: [] }, entry);
      assert.equal(reg.apps.length, 1);
      assert.equal(reg.apps[0].slug, "my-app");
    });

    test("updates existing app by slug", () => {
      const existing: AppEntry = { ...entry, name: "Old Name" };
      const reg = upsertApp({ apps: [existing] }, { ...entry, name: "New Name" });
      assert.equal(reg.apps.length, 1);
      assert.equal(reg.apps[0].name, "New Name");
    });

    test("preserves other apps", () => {
      const other: AppEntry = { ...entry, slug: "other-app", name: "Other" };
      const reg = upsertApp({ apps: [other] }, entry);
      assert.equal(reg.apps.length, 2);
    });

    test("sorts apps by slug", () => {
      const z: AppEntry = { ...entry, slug: "z-app" };
      const a: AppEntry = { ...entry, slug: "a-app" };
      const reg = upsertApp({ apps: [z] }, a);
      assert.equal(reg.apps[0].slug, "a-app");
      assert.equal(reg.apps[1].slug, "z-app");
    });
  });

  describe("removeApp", () => {
    test("removes app by slug", () => {
      const reg = removeApp({ apps: [entry] }, "my-app");
      assert.equal(reg.apps.length, 0);
    });

    test("no-op for missing slug", () => {
      const reg = removeApp({ apps: [entry] }, "nonexistent");
      assert.equal(reg.apps.length, 1);
    });
  });
});
