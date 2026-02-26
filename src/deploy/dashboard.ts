import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { config } from "../config.js";
import { listStaticWebApps, deploySwaZip } from "../azure/static-web-apps.js";
import { collectFiles } from "./deny-list.js";
import { createZipBuffer } from "./zip.js";

export interface AppEntry {
  slug: string;
  name: string;
  description: string;
  url: string;
  deployedAt: string;
}

export async function buildAppsJson(token: string): Promise<AppEntry[]> {
  const swas = await listStaticWebApps(token);

  return swas
    .filter((swa) => swa.name !== config.dashboardSlug)
    .map((swa) => ({
      slug: swa.name,
      name: swa.tags?.appName || swa.name,
      description: swa.tags?.appDescription || "",
      url: `https://${swa.name}.${config.dnsZone}`,
      deployedAt: swa.tags?.deployedAt || "",
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function generateDashboardHtml(apps: AppEntry[]): string {
  const escapedData = JSON.stringify(apps).replace(/<\//g, "<\\/");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'unsafe-inline'">
  <title>Deployed Apps</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    .app { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
    .app h2 { margin: 0 0 0.5rem; }
    .app p { margin: 0.25rem 0; color: #666; }
    .app a { color: #0066cc; }
    .empty { color: #999; font-style: italic; }
  </style>
</head>
<body>
  <h1>Deployed Apps</h1>
  <div id="apps"></div>
  <script>
    const apps = ${escapedData};
    const container = document.getElementById("apps");
    if (apps.length === 0) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "No apps deployed yet.";
      container.appendChild(p);
    } else {
      for (const app of apps) {
        const div = document.createElement("div");
        div.className = "app";
        const h2 = document.createElement("h2");
        h2.textContent = app.name;
        div.appendChild(h2);
        if (app.description) {
          const desc = document.createElement("p");
          desc.textContent = app.description;
          div.appendChild(desc);
        }
        const link = document.createElement("a");
        link.href = app.url;
        link.textContent = app.url;
        div.appendChild(link);
        if (app.deployedAt) {
          const time = document.createElement("p");
          time.textContent = "Deployed: " + new Date(app.deployedAt).toLocaleString();
          div.appendChild(time);
        }
        container.appendChild(div);
      }
    }
  </script>
</body>
</html>`;
}

export async function deployDashboard(token: string): Promise<void> {
  const apps = await buildAppsJson(token);
  const html = generateDashboardHtml(apps);

  const tmpDir = await mkdtemp(join(tmpdir(), "dashboard-"));
  try {
    await writeFile(join(tmpDir, "index.html"), html);
    await writeFile(join(tmpDir, "apps.json"), JSON.stringify(apps, null, 2));

    const files = await collectFiles(tmpDir);
    const zipBuffer = await createZipBuffer(tmpDir, files);
    await deploySwaZip(token, config.dashboardSlug, zipBuffer);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
