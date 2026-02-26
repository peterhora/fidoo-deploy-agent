import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateRawSync, crc32 } from "node:zlib";

/**
 * Create a ZIP buffer from a list of relative file paths under rootDir.
 * Uses deflateRawSync for compression. Manual ZIP format:
 *   [local file header + data] × N + [central directory entry] × N + EOCD
 */
export async function createZipBuffer(rootDir: string, files: string[]): Promise<Buffer> {
  const entries: Array<{
    name: Buffer;
    compressed: Buffer;
    uncompressedSize: number;
    compressedSize: number;
    crc: number;
    localHeaderOffset: number;
  }> = [];

  // Build local file headers + data
  const localParts: Buffer[] = [];
  let offset = 0;

  for (const filePath of files) {
    const normalized = filePath.replace(/\\/g, "/");
    const nameBytes = Buffer.from(normalized, "utf8");
    const content = await readFile(join(rootDir, filePath));
    const checksum = crc32(content);
    const compressed = content.length > 0 ? deflateRawSync(content) : Buffer.alloc(0);

    const entry = {
      name: nameBytes,
      compressed,
      uncompressedSize: content.length,
      compressedSize: compressed.length,
      crc: checksum,
      localHeaderOffset: offset,
    };
    entries.push(entry);

    // Local file header: 30 bytes fixed + name + data
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);  // signature
    header.writeUInt16LE(20, 4);           // version needed (2.0)
    header.writeUInt16LE(0, 6);            // general purpose flags
    header.writeUInt16LE(8, 8);            // compression method (deflate)
    header.writeUInt16LE(0, 10);           // mod time
    header.writeUInt16LE(0, 12);           // mod date
    header.writeUInt32LE(checksum >>> 0, 14); // crc-32
    header.writeUInt32LE(compressed.length, 18); // compressed size
    header.writeUInt32LE(content.length, 22);    // uncompressed size
    header.writeUInt16LE(nameBytes.length, 26);  // file name length
    header.writeUInt16LE(0, 28);                 // extra field length

    localParts.push(header, nameBytes, compressed);
    offset += 30 + nameBytes.length + compressed.length;
  }

  // Build central directory
  const centralDirOffset = offset;
  const centralParts: Buffer[] = [];
  let centralSize = 0;

  for (const entry of entries) {
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0);  // signature
    cdHeader.writeUInt16LE(20, 4);           // version made by
    cdHeader.writeUInt16LE(20, 6);           // version needed
    cdHeader.writeUInt16LE(0, 8);            // flags
    cdHeader.writeUInt16LE(8, 10);           // compression method
    cdHeader.writeUInt16LE(0, 12);           // mod time
    cdHeader.writeUInt16LE(0, 14);           // mod date
    cdHeader.writeUInt32LE(entry.crc >>> 0, 16);
    cdHeader.writeUInt32LE(entry.compressedSize, 20);
    cdHeader.writeUInt32LE(entry.uncompressedSize, 24);
    cdHeader.writeUInt16LE(entry.name.length, 28);  // file name length
    cdHeader.writeUInt16LE(0, 30);  // extra field length
    cdHeader.writeUInt16LE(0, 32);  // comment length
    cdHeader.writeUInt16LE(0, 34);  // disk number start
    cdHeader.writeUInt16LE(0, 36);  // internal file attributes
    cdHeader.writeUInt32LE(0, 38);  // external file attributes
    cdHeader.writeUInt32LE(entry.localHeaderOffset, 42); // relative offset

    centralParts.push(cdHeader, entry.name);
    centralSize += 46 + entry.name.length;
  }

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);            // signature
  eocd.writeUInt16LE(0, 4);                      // disk number
  eocd.writeUInt16LE(0, 6);                      // disk with central dir
  eocd.writeUInt16LE(entries.length, 8);          // entries on this disk
  eocd.writeUInt16LE(entries.length, 10);         // total entries
  eocd.writeUInt32LE(centralSize, 12);            // central dir size
  eocd.writeUInt32LE(centralDirOffset, 16);       // central dir offset
  eocd.writeUInt16LE(0, 20);                      // comment length

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}
