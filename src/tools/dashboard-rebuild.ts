import type { ToolDefinition, ToolHandler } from "./index.js";

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
  return {
    content: [
      { type: "text", text: "Not implemented yet: dashboard_rebuild" },
    ],
  };
};
