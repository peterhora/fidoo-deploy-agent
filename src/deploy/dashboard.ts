import type { AppEntry } from "./registry.js";

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
        link.href = "/" + app.slug + "/";
        link.textContent = "/" + app.slug + "/";
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
