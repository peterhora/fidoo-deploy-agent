import { stat, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { loadTokens, isTokenExpired } from "../auth/token-store.js";
import { extractUpn } from "../auth/jwt.js";
import { config } from "../config.js";
import { readDeployConfig, writeDeployConfig, generateSlug } from "../deploy/deploy-json.js";
import { collectFiles } from "../deploy/deny-list.js";
import { uploadBlob } from "../azure/blob.js";
import { loadRegistry, saveRegistry, upsertApp } from "../deploy/registry.js";
import { deploySite } from "../deploy/site-deploy.js";
export const definition = {
    name: "app_deploy",
    description: "Deploy a static app. First deploy requires app_name and app_description. Re-deploy reads .deploy.json automatically. Uploads files to blob storage, updates the registry, and rebuilds the site.",
    inputSchema: {
        type: "object",
        properties: {
            folder: {
                type: "string",
                description: "Path to the folder to deploy",
            },
            app_name: {
                type: "string",
                description: "Display name for the app (first deploy only)",
            },
            app_description: {
                type: "string",
                description: "Short description for the dashboard (first deploy only)",
            },
        },
        required: ["folder"],
    },
};
function errorResult(message) {
    return { content: [{ type: "text", text: message }], isError: true };
}
function successResult(message) {
    return { content: [{ type: "text", text: message }] };
}
async function uploadAppToBlob(token, slug, folder, files) {
    await Promise.all(files.map(async (relativePath) => {
        const content = await readFile(join(folder, relativePath));
        await uploadBlob(token, `${slug}/${relativePath}`, content);
    }));
}
async function firstDeploy(armToken, storageToken, folder, appName, appDescription) {
    const slug = generateSlug(appName);
    const files = await collectFiles(folder);
    await uploadAppToBlob(storageToken, slug, folder, files);
    let registry = await loadRegistry(storageToken);
    const entry = {
        slug,
        name: appName,
        description: appDescription,
        deployedAt: new Date().toISOString(),
        deployedBy: extractUpn(armToken) || "unknown",
    };
    registry = upsertApp(registry, entry);
    await saveRegistry(storageToken, registry);
    await deploySite(armToken, storageToken, registry);
    await writeDeployConfig(folder, {
        appSlug: slug,
        appName,
        appDescription,
        resourceId: "",
    });
    const url = `https://${config.appDomain}/${slug}/`;
    return successResult(JSON.stringify({ status: "ok", url, slug }));
}
async function redeploy(armToken, storageToken, folder, existingConfig) {
    const { appSlug } = existingConfig;
    const files = await collectFiles(folder);
    await uploadAppToBlob(storageToken, appSlug, folder, files);
    let registry = await loadRegistry(storageToken);
    const existing = registry.apps.find((a) => a.slug === appSlug);
    const entry = {
        slug: appSlug,
        name: existing?.name || existingConfig.appName,
        description: existing?.description || existingConfig.appDescription,
        deployedAt: new Date().toISOString(),
        deployedBy: extractUpn(armToken) || "unknown",
    };
    registry = upsertApp(registry, entry);
    await saveRegistry(storageToken, registry);
    await deploySite(armToken, storageToken, registry);
    const url = `https://${config.appDomain}/${appSlug}/`;
    return successResult(JSON.stringify({ status: "ok", url, slug: appSlug }));
}
export const handler = async (args) => {
    const folder = args.folder;
    // Validate folder exists
    try {
        const s = await stat(folder);
        if (!s.isDirectory()) {
            return errorResult(`Folder path is not a directory: ${folder}`);
        }
    }
    catch {
        return errorResult(`Folder does not exist: ${folder}`);
    }
    // Check for index.html in the root of the folder
    try {
        await access(join(folder, "index.html"));
    }
    catch {
        const files = await collectFiles(folder);
        const nestedIndex = files.find((f) => f.endsWith("/index.html"));
        let hint = "No index.html found in the root of the deploy folder. " +
            "The app will not load without a root index.html.\n\n";
        if (nestedIndex) {
            const subdir = join(folder, nestedIndex.substring(0, nestedIndex.lastIndexOf("/")));
            hint +=
                `Found index.html in "${nestedIndex}" — you may want to deploy the "${subdir}" subdirectory instead, ` +
                    `or move index.html to the root of "${folder}".`;
        }
        else {
            hint +=
                `Files found: ${files.join(", ") || "(none)"}.\n\n` +
                    "If this is a build-based project, make sure to run the build step first " +
                    "(e.g. npm run build) and deploy the output directory (e.g. dist/ or build/).";
        }
        return errorResult(hint);
    }
    // Check auth
    const tokens = await loadTokens();
    if (!tokens) {
        return errorResult("Not authenticated. Run auth_login first.");
    }
    if (isTokenExpired(tokens)) {
        return errorResult("Token expired. Run auth_login to re-authenticate.");
    }
    const armToken = tokens.access_token;
    const storageToken = tokens.storage_access_token;
    // Check for existing .deploy.json
    const existing = await readDeployConfig(folder);
    if (existing) {
        return redeploy(armToken, storageToken, folder, existing);
    }
    // First deploy — need app_name and app_description
    const appName = args.app_name;
    const appDescription = args.app_description;
    if (!appName) {
        return errorResult("First deploy requires app_name argument.");
    }
    if (!appDescription) {
        return errorResult("First deploy requires app_description argument.");
    }
    return firstDeploy(armToken, storageToken, folder, appName, appDescription);
};
//# sourceMappingURL=app-deploy.js.map