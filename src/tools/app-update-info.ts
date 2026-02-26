import type { ToolDefinition, ToolHandler } from "./index.js";

export const definition: ToolDefinition = {
  name: "app_update_info",
  description:
    "Update an app's display name and/or description. Updates .deploy.json, Azure resource tags, and regenerates the dashboard. Does NOT re-deploy the app.",
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

export const handler: ToolHandler = async (_args) => {
  return {
    content: [
      { type: "text", text: "Not implemented yet: app_update_info" },
    ],
  };
};
