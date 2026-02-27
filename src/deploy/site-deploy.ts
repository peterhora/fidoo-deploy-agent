import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { config } from "../config.js";
import { deploySwaDir } from "../azure/static-web-apps.js";
import { assembleSite } from "./assemble.js";
import type { Registry } from "./registry.js";

export async function deploySite(armToken: string, storageToken: string, registry: Registry): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), "deploy-agent-site-"));
  try {
    await assembleSite(storageToken, registry, tempDir);
    await deploySwaDir(armToken, config.swaSlug, tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
