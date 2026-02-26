import type { ToolDefinition, ToolHandler } from "./index.js";
import { loadTokens, isTokenExpired } from "../auth/token-store.js";
import { config } from "../config.js";
import { deployDashboard } from "../deploy/dashboard.js";

export const definition: ToolDefinition = {
  name: "dashboard_rebuild",
  description:
    "Force-regenerate the app dashboard from current Azure resource tags. Use for admin recovery if the dashboard gets out of sync.",
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
    await deployDashboard(tokens.access_token);
    const url = `https://${config.dashboardSlug}.${config.dnsZone}`;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "ok",
            message: "Dashboard rebuilt successfully.",
            url,
          }),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Dashboard rebuild failed: ${message}` }],
      isError: true,
    };
  }
};
