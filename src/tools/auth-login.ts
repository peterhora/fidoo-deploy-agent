import type { ToolDefinition, ToolHandler } from "./index.js";
import { startDeviceCodeFlow } from "../auth/device-code.js";
import { config } from "../config.js";

export const definition: ToolDefinition = {
  name: "auth_login",
  description:
    "Start the OAuth2 device code flow. Returns a URL and code for the user to complete browser login.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export const handler: ToolHandler = async (_args) => {
  try {
    const result = await startDeviceCodeFlow(
      config.tenantId,
      config.clientId,
      config.armScope,
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            user_code: result.user_code,
            verification_uri: result.verification_uri,
            device_code: result.device_code,
            expires_in: result.expires_in,
            interval: result.interval,
            message: result.message,
          }),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Login failed: ${(err as Error).message}`,
        },
      ],
      isError: true,
    };
  }
};
