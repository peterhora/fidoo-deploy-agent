/**
 * Create a ZIP buffer from a list of relative file paths under rootDir.
 * Uses deflateRawSync for compression. Manual ZIP format:
 *   [local file header + data] × N + [central directory entry] × N + EOCD
 */
export declare function createZipBuffer(rootDir: string, files: string[]): Promise<Buffer>;
