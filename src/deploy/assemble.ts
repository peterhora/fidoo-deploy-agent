import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { listBlobs, downloadBlob } from "../azure/blob.js";
import { generateDashboardHtml } from "./dashboard.js";
import type { Registry } from "./registry.js";

export async function assembleSite(
  token: string,
  registry: Registry,
  outDir: string,
): Promise<void> {
  // 1. Write dashboard index.html at root
  const html = generateDashboardHtml(registry.apps);
  await writeFile(join(outDir, "index.html"), html, "utf-8");

  // 2. Write registry.json at root
  await writeFile(join(outDir, "registry.json"), JSON.stringify(registry, null, 2), "utf-8");

  // 3. Write staticwebapp.config.json — require Entra ID login for all routes
  const swaConfig = {
    routes: [
      { route: "/.auth/*", allowedRoles: ["anonymous"] },
      { route: "/*", allowedRoles: ["authenticated"] },
    ],
    responseOverrides: {
      "401": { redirect: "/.auth/login/aad", statusCode: 302 },
    },
  };
  await writeFile(join(outDir, "staticwebapp.config.json"), JSON.stringify(swaConfig, null, 2), "utf-8");

  // 4. Download all app files from blob into subdirectories
  const allBlobs = await listBlobs(token);
  const appBlobs = allBlobs.filter((name) => name !== "registry.json");

  await Promise.all(
    appBlobs.map(async (blobName) => {
      const content = await downloadBlob(token, blobName);
      if (!content) return;
      const filePath = join(outDir, blobName);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content);
    }),
  );
}
