import type { ToolDefinition, ToolHandler } from "./index.js";

export const definition: ToolDefinition = {
  name: "app_list",
  description: "List all deployed apps in the resource group with their names, slugs, and URLs.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export const handler: ToolHandler = async (_args) => {
  return {
    content: [{ type: "text", text: "Not implemented yet: app_list" }],
  };
};
