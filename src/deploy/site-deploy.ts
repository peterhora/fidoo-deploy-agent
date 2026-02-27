import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { config } from "../config.js";
import { deploySwaZip } from "../azure/static-web-apps.js";
import { collectFiles } from "./deny-list.js";
import { createZipBuffer } from "./zip.js";
import { assembleSite } from "./assemble.js";
import type { Registry } from "./registry.js";

export async function deploySite(armToken: string, storageToken: string, registry: Registry): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), "deploy-agent-site-"));
  try {
    await assembleSite(storageToken, registry, tempDir);
    const files = await collectFiles(tempDir);
    const zipBuffer = await createZipBuffer(tempDir, files);
    await deploySwaZip(armToken, storageToken, config.swaSlug, zipBuffer);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
