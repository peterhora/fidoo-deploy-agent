import type { ToolDefinition, ToolHandler } from "./index.js";

export const definition: ToolDefinition = {
  name: "app_deploy",
  description:
    "Deploy a static app to Azure Static Web Apps. First deploy requires app_name and app_description. Re-deploy reads .deploy.json automatically. ZIPs the folder, creates/updates the SWA, configures DNS and auth, and rebuilds the dashboard.",
  inputSchema: {
    type: "object",
    properties: {
      folder: {
        type: "string",
        description: "Path to the folder to deploy",
      },
      app_name: {
        type: "string",
        description: "Display name for the app (first deploy only)",
      },
      app_description: {
        type: "string",
        description: "Short description for the dashboard (first deploy only)",
      },
    },
    required: ["folder"],
  },
};

export const handler: ToolHandler = async (_args) => {
  return {
    content: [{ type: "text", text: "Not implemented yet: app_deploy" }],
  };
};
