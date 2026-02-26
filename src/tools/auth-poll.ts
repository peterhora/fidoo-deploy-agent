import type { ToolDefinition, ToolHandler } from "./index.js";
import { pollForToken } from "../auth/device-code.js";
import { saveTokens } from "../auth/token-store.js";
import { config } from "../config.js";

export const definition: ToolDefinition = {
  name: "auth_poll",
  description:
    "Poll for token after user completes browser login. Call after auth_login.",
  inputSchema: {
    type: "object",
    properties: {
      device_code: {
        type: "string",
        description: "The device code returned by auth_login",
      },
    },
    required: ["device_code"],
  },
};

export const handler: ToolHandler = async (args) => {
  const deviceCode = args.device_code as string | undefined;

  if (!deviceCode) {
    return {
      content: [
        {
          type: "text",
          text: "Missing required parameter: device_code",
        },
      ],
      isError: true,
    };
  }

  try {
    const tokenResponse = await pollForToken(
      config.tenantId,
      config.clientId,
      deviceCode,
      5, // Default 5-second polling interval per OAuth2 spec
    );

    const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

    await saveTokens({
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_at: expiresAt,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "authenticated",
            expires_at: expiresAt,
          }),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Polling failed: ${(err as Error).message}`,
        },
      ],
      isError: true,
    };
  }
};
