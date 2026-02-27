import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readDeployConfig, writeDeployConfig, generateSlug, } from "../../src/deploy/deploy-json.js";
describe("generateSlug", () => {
    it("lowercases the name", () => {
        assert.equal(generateSlug("My App"), "my-app");
    });
    it("replaces spaces with hyphens", () => {
        assert.equal(generateSlug("expense tracker"), "expense-tracker");
    });
    it("strips special characters", () => {
        assert.equal(generateSlug("My App!@#$%"), "my-app");
    });
    it("collapses multiple hyphens", () => {
        assert.equal(generateSlug("my---app"), "my-app");
    });
    it("trims leading and trailing hyphens", () => {
        assert.equal(generateSlug("--my-app--"), "my-app");
    });
    it("truncates to 60 characters", () => {
        const long = "a".repeat(80);
        const slug = generateSlug(long);
        assert.ok(slug.length <= 60);
    });
    it("does not end with a hyphen after truncation", () => {
        // 59 a's + space + more = when truncated, should not end with hyphen
        const name = "a".repeat(59) + " b";
        const slug = generateSlug(name);
        assert.ok(!slug.endsWith("-"), `slug ends with hyphen: ${slug}`);
        assert.ok(slug.length <= 60);
    });
    it("handles unicode characters by stripping them", () => {
        assert.equal(generateSlug("Café App"), "caf-app");
    });
    it("handles empty string", () => {
        assert.equal(generateSlug(""), "");
    });
    it("handles numbers", () => {
        assert.equal(generateSlug("App 2.0"), "app-2-0");
    });
});
describe("readDeployConfig", () => {
    let tmpDir;
    before(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), "deploy-json-test-"));
    });
    after(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });
    it("returns null when .deploy.json does not exist", async () => {
        const result = await readDeployConfig(tmpDir);
        assert.equal(result, null);
    });
    it("reads and parses a valid .deploy.json", async () => {
        const config = {
            appSlug: "expense-tracker",
            appName: "Expense Tracker",
            appDescription: "Submit expenses",
            resourceId: "/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/staticSites/expense-tracker",
        };
        await writeFile(join(tmpDir, ".deploy.json"), JSON.stringify(config));
        const result = await readDeployConfig(tmpDir);
        assert.deepEqual(result, config);
    });
    it("returns null for invalid JSON", async () => {
        const badDir = await mkdtemp(join(tmpdir(), "deploy-json-bad-"));
        await writeFile(join(badDir, ".deploy.json"), "not json {{{");
        const result = await readDeployConfig(badDir);
        assert.equal(result, null);
        await rm(badDir, { recursive: true, force: true });
    });
});
describe("writeDeployConfig", () => {
    let tmpDir;
    before(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), "deploy-json-write-"));
    });
    after(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });
    it("writes .deploy.json with correct content", async () => {
        const config = {
            appSlug: "my-app",
            appName: "My App",
            appDescription: "A cool app",
            resourceId: "/subscriptions/sub-1/resourceGroups/rg/providers/Microsoft.Web/staticSites/my-app",
        };
        await writeDeployConfig(tmpDir, config);
        const raw = await readFile(join(tmpDir, ".deploy.json"), "utf8");
        const parsed = JSON.parse(raw);
        assert.deepEqual(parsed, config);
    });
    it("writes formatted JSON (2-space indent)", async () => {
        const config = {
            appSlug: "test",
            appName: "Test",
            appDescription: "",
            resourceId: "/subscriptions/x/resourceGroups/rg/providers/Microsoft.Web/staticSites/test",
        };
        await writeDeployConfig(tmpDir, config);
        const raw = await readFile(join(tmpDir, ".deploy.json"), "utf8");
        assert.ok(raw.includes("\n"), "should contain newlines (formatted)");
        // Should be valid JSON that re-parses
        assert.deepEqual(JSON.parse(raw), config);
    });
    it("overwrites existing .deploy.json", async () => {
        const config1 = {
            appSlug: "v1",
            appName: "V1",
            appDescription: "first",
            resourceId: "/subscriptions/x/resourceGroups/rg/providers/Microsoft.Web/staticSites/v1",
        };
        const config2 = {
            appSlug: "v1",
            appName: "V1 Updated",
            appDescription: "second",
            resourceId: "/subscriptions/x/resourceGroups/rg/providers/Microsoft.Web/staticSites/v1",
        };
        await writeDeployConfig(tmpDir, config1);
        await writeDeployConfig(tmpDir, config2);
        const result = await readDeployConfig(tmpDir);
        assert.deepEqual(result, config2);
    });
});
//# sourceMappingURL=deploy-json.test.js.map