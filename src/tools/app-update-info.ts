import type { ToolDefinition, ToolHandler } from "./index.js";
import { loadTokens, isTokenExpired } from "../auth/token-store.js";
import { loadRegistry, saveRegistry, upsertApp } from "../deploy/registry.js";
import { deploySite } from "../deploy/site-deploy.js";

export const definition: ToolDefinition = {
  name: "app_update_info",
  description:
    "Update an app's display name and/or description. Updates the registry and redeploys the site. Does NOT re-deploy the app code.",
  inputSchema: {
    type: "object",
    properties: {
      app_slug: {
        type: "string",
        description: "The slug (URL name) of the app to update",
      },
      app_name: {
        type: "string",
        description: "New display name",
      },
      app_description: {
        type: "string",
        description: "New description",
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

  const appName = args.app_name as string | undefined;
  const appDescription = args.app_description as string | undefined;

  if (!appName && !appDescription) {
    return {
      content: [
        { type: "text", text: "Provide at least one of app_name or app_description to update." },
      ],
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
    const token = tokens.access_token;
    const registry = await loadRegistry(token);
    const app = registry.apps.find((a) => a.slug === appSlug);

    if (!app) {
      return {
        content: [{ type: "text", text: `App "${appSlug}" not found.` }],
        isError: true,
      };
    }

    const updated = upsertApp(registry, {
      ...app,
      name: appName ?? app.name,
      description: appDescription ?? app.description,
    });
    await saveRegistry(token, updated);
    await deploySite(token, updated);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "ok",
            message: `App "${appSlug}" info updated successfully.`,
          }),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Failed to update app info: ${message}` }],
      isError: true,
    };
  }
};
