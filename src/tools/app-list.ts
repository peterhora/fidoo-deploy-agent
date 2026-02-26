import type { ToolDefinition, ToolHandler } from "./index.js";
import { loadTokens, isTokenExpired } from "../auth/token-store.js";
import { config } from "../config.js";
import { listStaticWebApps } from "../azure/static-web-apps.js";

export const definition: ToolDefinition = {
  name: "app_list",
  description: "List all deployed apps in the resource group with their names, slugs, and URLs.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export const handler: ToolHandler = async (_args) => {
  const tokens = await loadTokens();
  if (!tokens) {
    return {
      content: [{ type: "text", text: "Not authenticated. Run auth_login first." }],
      isError: true,
    };
  }

  if (isTokenExpired(tokens)) {
    return {
      content: [{ type: "text", text: "Token expired. Run auth_login to re-authenticate." }],
      isError: true,
    };
  }

  try {
    const swas = await listStaticWebApps(tokens.access_token);

    const apps = swas
      .filter((swa) => swa.name !== config.dashboardSlug)
      .map((swa) => ({
        slug: swa.name,
        name: swa.tags?.appName || swa.name,
        description: swa.tags?.appDescription || "",
        url: `https://${swa.name}.${config.dnsZone}`,
        deployedAt: swa.tags?.deployedAt || "",
      }))
      .sort((a, b) => a.slug.localeCompare(b.slug));

    return {
      content: [{ type: "text", text: JSON.stringify({ apps }) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Failed to list apps: ${message}` }],
      isError: true,
    };
  }
};
