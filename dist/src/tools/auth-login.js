import { startDeviceCodeFlow } from "../auth/device-code.js";
import { config } from "../config.js";
export const definition = {
    name: "auth_login",
    description: "Start the OAuth2 device code flow. Returns a URL and code for the user to complete browser login.",
    inputSchema: {
        type: "object",
        properties: {},
    },
};
export const handler = async (_args) => {
    try {
        const result = await startDeviceCodeFlow(config.tenantId, config.clientId, config.scope);
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
    }
    catch (err) {
        return {
            content: [
                {
                    type: "text",
                    text: `Login failed: ${err.message}`,
                },
            ],
            isError: true,
        };
    }
};
//# sourceMappingURL=auth-login.js.map