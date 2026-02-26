import type { ToolDefinition, ToolHandler } from "./index.js";
import { loadTokens, isTokenExpired } from "../auth/token-store.js";
import { getStaticWebApp, updateTags } from "../azure/static-web-apps.js";
import { AzureError } from "../azure/rest-client.js";
import { deployDashboard } from "../deploy/dashboard.js";

export const definition: ToolDefinition = {
  name: "app_update_info",
  description:
    "Update an app's display name and/or description. Updates Azure resource tags and regenerates the dashboard. Does NOT re-deploy the app.",
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
    // Verify app exists
    await getStaticWebApp(tokens.access_token, appSlug);

    // Build tags to update
    const tags: Record<string, string> = {};
    if (appName) tags.appName = appName;
    if (appDescription) tags.appDescription = appDescription;

    await updateTags(tokens.access_token, appSlug, tags);
    await deployDashboard(tokens.access_token);

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
    if (err instanceof AzureError && err.status === 404) {
      return {
        content: [{ type: "text", text: `App "${appSlug}" not found.` }],
        isError: true,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Failed to update app info: ${message}` }],
      isError: true,
    };
  }
};
