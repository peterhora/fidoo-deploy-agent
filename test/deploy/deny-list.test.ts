import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Will be implemented in src/deploy/deny-list.ts
import { shouldExclude, collectFiles, DENIED_PATTERNS } from "../../src/deploy/deny-list.js";

describe("deny-list", () => {
  describe("DENIED_PATTERNS", () => {
    it("is a non-empty array of strings", () => {
      assert.ok(Array.isArray(DENIED_PATTERNS));
      assert.ok(DENIED_PATTERNS.length > 0);
      for (const p of DENIED_PATTERNS) {
        assert.equal(typeof p, "string");
      }
    });
  });

  describe("shouldExclude", () => {
    it("excludes .env file", () => {
      assert.equal(shouldExclude(".env"), true);
    });

    it("excludes .env.local and .env.production variants", () => {
      assert.equal(shouldExclude(".env.local"), true);
      assert.equal(shouldExclude(".env.production"), true);
      assert.equal(shouldExclude(".env.development"), true);
    });

    it("excludes .git directory entries", () => {
      assert.equal(shouldExclude(".git/config"), true);
      assert.equal(shouldExclude(".git/HEAD"), true);
    });

    it("excludes node_modules entries", () => {
      assert.equal(shouldExclude("node_modules/lodash/index.js"), true);
    });

    it("excludes .deploy.json", () => {
      assert.equal(shouldExclude(".deploy.json"), true);
    });

    it("excludes .claude directory entries", () => {
      assert.equal(shouldExclude(".claude/settings.json"), true);
    });

    it("excludes .pem files", () => {
      assert.equal(shouldExclude("cert.pem"), true);
      assert.equal(shouldExclude("keys/server.pem"), true);
    });

    it("excludes .key files", () => {
      assert.equal(shouldExclude("private.key"), true);
      assert.equal(shouldExclude("ssl/cert.key"), true);
    });

    it("excludes .DS_Store", () => {
      assert.equal(shouldExclude(".DS_Store"), true);
      assert.equal(shouldExclude("subdir/.DS_Store"), true);
    });

    it("does not exclude normal files", () => {
      assert.equal(shouldExclude("index.html"), false);
      assert.equal(shouldExclude("styles/main.css"), false);
      assert.equal(shouldExclude("js/app.js"), false);
      assert.equal(shouldExclude("images/logo.png"), false);
    });

    it("excludes .pfx certificate files", () => {
      assert.equal(shouldExclude("cert.pfx"), true);
      assert.equal(shouldExclude("certs/server.pfx"), true);
    });

    it("excludes .p12 certificate files", () => {
      assert.equal(shouldExclude("cert.p12"), true);
      assert.equal(shouldExclude("certs/client.p12"), true);
    });

    it("excludes .npmrc", () => {
      assert.equal(shouldExclude(".npmrc"), true);
      assert.equal(shouldExclude("subdir/.npmrc"), true);
    });

    it("excludes SSH key files", () => {
      assert.equal(shouldExclude("id_rsa"), true);
      assert.equal(shouldExclude(".ssh/id_rsa"), true);
      assert.equal(shouldExclude("id_ed25519"), true);
      assert.equal(shouldExclude(".ssh/id_ed25519"), true);
      assert.equal(shouldExclude("id_ecdsa"), true);
    });

    it("does not exclude files with similar but non-matching names", () => {
      assert.equal(shouldExclude("environment.ts"), false);
      assert.equal(shouldExclude("deploy.json"), false); // only .deploy.json excluded
      assert.equal(shouldExclude("keynote.pptx"), false);
    });
  });

  describe("collectFiles", () => {
    let tmpDir: string;

    before(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "deny-list-test-"));
      // Create a small file tree
      await writeFile(join(tmpDir, "index.html"), "<html></html>");
      await writeFile(join(tmpDir, "style.css"), "body{}");
      await writeFile(join(tmpDir, ".env"), "SECRET=123");
      await writeFile(join(tmpDir, ".deploy.json"), "{}");
      await writeFile(join(tmpDir, ".DS_Store"), "");
      await mkdir(join(tmpDir, "js"));
      await writeFile(join(tmpDir, "js", "app.js"), "console.log('hi')");
      await mkdir(join(tmpDir, ".git"));
      await writeFile(join(tmpDir, ".git", "HEAD"), "ref: refs/heads/main");
      await mkdir(join(tmpDir, "node_modules"));
      await writeFile(join(tmpDir, "node_modules", "pkg.js"), "module");
      await mkdir(join(tmpDir, "certs"));
      await writeFile(join(tmpDir, "certs", "server.pem"), "cert");
      await writeFile(join(tmpDir, "certs", "server.key"), "key");
    });

    after(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("returns relative paths of non-excluded files", async () => {
      const files = await collectFiles(tmpDir);
      assert.ok(files.includes("index.html"));
      assert.ok(files.includes("style.css"));
      assert.ok(files.includes("js/app.js"));
    });

    it("excludes denied files", async () => {
      const files = await collectFiles(tmpDir);
      assert.ok(!files.includes(".env"));
      assert.ok(!files.includes(".deploy.json"));
      assert.ok(!files.includes(".DS_Store"));
      assert.ok(!files.some((f) => f.startsWith(".git/")));
      assert.ok(!files.some((f) => f.startsWith("node_modules/")));
      assert.ok(!files.includes("certs/server.pem"));
      assert.ok(!files.includes("certs/server.key"));
    });

    it("returns only files, not directories", async () => {
      const files = await collectFiles(tmpDir);
      for (const f of files) {
        assert.ok(!f.endsWith("/"), `${f} looks like a directory`);
      }
    });

    it("uses forward slashes in paths", async () => {
      const files = await collectFiles(tmpDir);
      for (const f of files) {
        assert.ok(!f.includes("\\"), `${f} contains backslash`);
      }
    });

    it("returns sorted paths", async () => {
      const files = await collectFiles(tmpDir);
      const sorted = [...files].sort();
      assert.deepEqual(files, sorted);
    });

    it("throws on non-existent directory", async () => {
      await assert.rejects(
        () => collectFiles("/tmp/nonexistent-" + Date.now()),
        { code: "ENOENT" },
      );
    });
  });
});
