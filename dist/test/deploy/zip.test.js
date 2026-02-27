import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inflateRawSync } from "node:zlib";
import { createZipBuffer } from "../../src/deploy/zip.js";
// ZIP format constants
const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
function readUint32LE(buf, offset) {
    return buf.readUInt32LE(offset);
}
function readUint16LE(buf, offset) {
    return buf.readUInt16LE(offset);
}
describe("createZipBuffer", () => {
    let tmpDir;
    before(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), "zip-test-"));
        await writeFile(join(tmpDir, "index.html"), "<h1>Hello</h1>");
        await writeFile(join(tmpDir, "empty.txt"), "");
        await mkdir(join(tmpDir, "css"));
        await writeFile(join(tmpDir, "css", "style.css"), "body { color: red; }");
    });
    after(async () => {
        await rm(tmpDir, { recursive: true, force: true });
    });
    it("returns a Buffer", async () => {
        const buf = await createZipBuffer(tmpDir, ["index.html"]);
        assert.ok(Buffer.isBuffer(buf));
    });
    it("produces a valid ZIP with correct end-of-central-directory record", async () => {
        const buf = await createZipBuffer(tmpDir, ["index.html"]);
        // EOCD signature should appear near the end
        const eocdOffset = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
        assert.ok(eocdOffset >= 0, "EOCD signature not found");
        assert.equal(readUint32LE(buf, eocdOffset), EOCD_SIG);
        // Total entries on disk (offset +8)
        assert.equal(readUint16LE(buf, eocdOffset + 10), 1);
    });
    it("includes correct number of entries for multiple files", async () => {
        const files = ["index.html", "css/style.css", "empty.txt"];
        const buf = await createZipBuffer(tmpDir, files);
        const eocdOffset = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
        assert.equal(readUint16LE(buf, eocdOffset + 10), 3);
    });
    it("starts with a local file header signature", async () => {
        const buf = await createZipBuffer(tmpDir, ["index.html"]);
        assert.equal(readUint32LE(buf, 0), LOCAL_FILE_HEADER_SIG);
    });
    it("contains central directory entries", async () => {
        const buf = await createZipBuffer(tmpDir, ["index.html"]);
        // Find central directory signature
        const cdOffset = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
        assert.ok(cdOffset > 0, "Central directory signature not found");
        assert.equal(readUint32LE(buf, cdOffset), CENTRAL_DIR_SIG);
    });
    it("stores file names in local headers", async () => {
        const buf = await createZipBuffer(tmpDir, ["index.html", "css/style.css"]);
        // File names should appear in the buffer
        assert.ok(buf.includes(Buffer.from("index.html")));
        assert.ok(buf.includes(Buffer.from("css/style.css")));
    });
    it("compresses file data with deflate and can be decompressed", async () => {
        const content = "<h1>Hello</h1>";
        const buf = await createZipBuffer(tmpDir, ["index.html"]);
        // Parse local file header to find compressed data
        // offset 0: signature (4), version (2), flags (2), method (2), time (2), date (2), crc (4), compressed (4), uncompressed (4), name len (2), extra len (2)
        const nameLen = readUint16LE(buf, 26);
        const extraLen = readUint16LE(buf, 28);
        const compressedSize = readUint32LE(buf, 18);
        const dataOffset = 30 + nameLen + extraLen;
        const compressed = buf.subarray(dataOffset, dataOffset + compressedSize);
        const decompressed = inflateRawSync(compressed);
        assert.equal(decompressed.toString(), content);
    });
    it("stores uncompressed size correctly", async () => {
        const content = "<h1>Hello</h1>";
        const buf = await createZipBuffer(tmpDir, ["index.html"]);
        const uncompressedSize = readUint32LE(buf, 22);
        assert.equal(uncompressedSize, Buffer.byteLength(content));
    });
    it("handles empty files", async () => {
        const buf = await createZipBuffer(tmpDir, ["empty.txt"]);
        const eocdOffset = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
        assert.equal(readUint16LE(buf, eocdOffset + 10), 1);
        // Uncompressed size should be 0
        const uncompressedSize = readUint32LE(buf, 22);
        assert.equal(uncompressedSize, 0);
    });
    it("uses deflate compression method (8)", async () => {
        const buf = await createZipBuffer(tmpDir, ["index.html"]);
        // Compression method at offset 8 in local header
        const method = readUint16LE(buf, 8);
        assert.equal(method, 8);
    });
    it("uses forward slashes in stored paths", async () => {
        const buf = await createZipBuffer(tmpDir, ["css/style.css"]);
        assert.ok(buf.includes(Buffer.from("css/style.css")));
        assert.ok(!buf.includes(Buffer.from("css\\style.css")));
    });
});
//# sourceMappingURL=zip.test.js.map