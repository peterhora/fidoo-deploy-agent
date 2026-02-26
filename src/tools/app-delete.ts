import type { ToolDefinition, ToolHandler } from "./index.js";

export const definition: ToolDefinition = {
  name: "app_delete",
  description:
    "Delete a deployed app. Removes the Static Web App, CNAME record, and rebuilds the dashboard.",
  inputSchema: {
    type: "object",
    properties: {
      app_slug: {
        type: "string",
        description: "The slug (URL name) of the app to delete",
      },
    },
    required: ["app_slug"],
  },
};

export const handler: ToolHandler = async (_args) => {
  return {
    content: [{ type: "text", text: "Not implemented yet: app_delete" }],
  };
};
