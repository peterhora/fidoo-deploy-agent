import { loadTokens, isTokenExpired } from "../auth/token-store.js";
export const definition = {
    name: "auth_status",
    description: "Check if the user has a valid Azure access token. Returns token status and expiry info.",
    inputSchema: {
        type: "object",
        properties: {},
    },
};
export const handler = async (_args) => {
    const tokens = await loadTokens();
    if (!tokens) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({ status: "not_authenticated" }),
                },
            ],
        };
    }
    if (isTokenExpired(tokens)) {
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        status: "expired",
                        expires_at: tokens.expires_at,
                    }),
                },
            ],
        };
    }
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({
                    status: "authenticated",
                    expires_at: tokens.expires_at,
                }),
            },
        ],
    };
};
//# sourceMappingURL=auth-status.js.map