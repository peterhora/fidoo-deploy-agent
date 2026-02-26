import type { ToolDefinition, ToolHandler } from "./index.js";

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

export const handler: ToolHandler = async (_args) => {
  return {
    content: [{ type: "text", text: "Not implemented yet: app_info" }],
  };
};
