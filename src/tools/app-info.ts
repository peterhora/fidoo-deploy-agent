import type { ToolDefinition, ToolHandler } from "./index.js";
import { loadTokens, isTokenExpired } from "../auth/token-store.js";
import { config } from "../config.js";
import { getStaticWebApp } from "../azure/static-web-apps.js";
import { AzureError } from "../azure/rest-client.js";

export const definition: ToolDefinition = {
  name: "app_info",
  description:
    "Get details for a deployed app: URL, status, name, description, and last deploy time.",
  inputSchema: {
    type: "object",
    properties: {
      app_slug: {
        type: "string",
        description: "The slug (URL name) of the app",
      },
    },
    required: ["app_slug"],
  },
};

export const handler: ToolHandler = async (args) => {
  const appSlug = args.app_slug as string | undefined;
  if (!appSlug) {
    return {
      content: [{ type: "text", text: "Missing required argument: app_slug" }],
      isError: true,
    };
  }

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
    const swa = await getStaticWebApp(tokens.access_token, appSlug);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            slug: swa.name,
            name: swa.tags?.appName || swa.name,
            description: swa.tags?.appDescription || "",
            url: `https://${swa.name}.${config.dnsZone}`,
            status: (swa.properties as { status?: string }).status || "Unknown",
            deployedAt: swa.tags?.deployedAt || "",
            defaultHostname: (swa.properties as { defaultHostname?: string }).defaultHostname || "",
          }),
        },
      ],
    };
  } catch (err) {
    if (err instanceof AzureError && err.status === 404) {
      return {
        content: [{ type: "text", text: `App "${appSlug}" not found.` }],
        isError: true,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Failed to get app info: ${message}` }],
      isError: true,
    };
  }
};
