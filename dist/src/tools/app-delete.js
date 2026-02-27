import { loadTokens, isTokenExpired } from "../auth/token-store.js";
import { deleteBlobsByPrefix } from "../azure/blob.js";
import { loadRegistry, saveRegistry, removeApp } from "../deploy/registry.js";
import { deploySite } from "../deploy/site-deploy.js";
export const definition = {
    name: "app_delete",
    description: "Delete a deployed app. Removes files from blob storage, updates the registry, and rebuilds the site.",
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
export const handler = async (args) => {
    const appSlug = args.app_slug;
    if (!appSlug) {
        return {
            content: [{ type: "text", text: "Missing required argument: app_slug" }],
            isError: true,
        };
    }
    const tokens = await loadTokens();
    if (!tokens) {
        return {
            content: [{ type: "text", text: "Not authenticated. Run auth_login first." }],
            isError: true,
        };
    }
    if (isTokenExpired(tokens)) {
        return {
            content: [{ type: "text", text: "Token expired. Run auth_login to re-authenticate." }],
            isError: true,
        };
    }
    try {
        const token = tokens.access_token;
        await deleteBlobsByPrefix(token, appSlug + "/");
        const registry = await loadRegistry(token);
        const updated = removeApp(registry, appSlug);
        await saveRegistry(token, updated);
        await deploySite(token, updated);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        status: "ok",
                        message: `App "${appSlug}" deleted successfully.`,
                    }),
                },
            ],
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            content: [{ type: "text", text: `Failed to delete app: ${message}` }],
            isError: true,
        };
    }
};
//# sourceMappingURL=app-delete.js.map