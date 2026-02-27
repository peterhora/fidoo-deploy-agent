/**
 * Azure Static Web Apps ARM API operations.
 * No dependencies — uses azureFetch.
 */
import { config } from "../config.js";
import { azureFetch } from "./rest-client.js";
import { uploadBlob, deleteBlob, generateBlobSasUrl } from "./blob.js";
function swaPath(slug) {
    return `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Web/staticSites/${slug}`;
}
function swaListPath() {
    return `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Web/staticSites`;
}
export async function createStaticWebApp(token, slug, options) {
    return (await azureFetch(swaPath(slug), {
        token,
        method: "PUT",
        apiVersion: config.swaApiVersion,
        body: {
            location: config.location,
            sku: { name: config.swaSkuName, tier: config.swaSkuTier },
            properties: {},
            tags: {
                appName: options.appName,
                appDescription: options.appDescription,
            },
        },
    }));
}
export async function getStaticWebApp(token, slug) {
    return (await azureFetch(swaPath(slug), {
        token,
        method: "GET",
        apiVersion: config.swaApiVersion,
    }));
}
export async function deleteStaticWebApp(token, slug) {
    await azureFetch(swaPath(slug), {
        token,
        method: "DELETE",
        apiVersion: config.swaApiVersion,
    });
}
export async function listStaticWebApps(token) {
    const result = (await azureFetch(swaListPath(), {
        token,
        method: "GET",
        apiVersion: config.swaApiVersion,
    }));
    return result.value;
}
export async function getDeploymentToken(token, slug) {
    const result = (await azureFetch(`${swaPath(slug)}/listSecrets`, {
        token,
        method: "POST",
        apiVersion: config.swaApiVersion,
    }));
    return result.properties.apiKey;
}
export async function updateTags(token, slug, tags) {
    return (await azureFetch(swaPath(slug), {
        token,
        method: "PATCH",
        apiVersion: config.swaApiVersion,
        body: { tags },
    }));
}
export async function deploySwaZip(armToken, storageToken, slug, zipBuffer) {
    const tempBlobPath = `_deploy-temp/${Date.now()}.zip`;
    // Upload ZIP to blob storage
    await uploadBlob(storageToken, tempBlobPath, zipBuffer);
    try {
        // Generate SAS URL so the ARM backend can fetch the ZIP
        const sasUrl = await generateBlobSasUrl(storageToken, tempBlobPath);
        // Call ARM zipdeploy API (returns 200 or 202)
        await azureFetch(`${swaPath(slug)}/zipdeploy`, {
            token: armToken,
            method: "POST",
            apiVersion: "2024-04-01",
            body: {
                properties: {
                    appZipUrl: sasUrl,
                    provider: "DeployAgent",
                },
            },
        });
    }
    finally {
        // Clean up temp blob
        await deleteBlob(storageToken, tempBlobPath).catch(() => { });
    }
}
export async function configureAuth(token, slug) {
    await azureFetch(`${swaPath(slug)}/config/authsettingsV2`, {
        token,
        method: "PUT",
        apiVersion: config.swaApiVersion,
        body: {
            properties: {
                identityProviders: {
                    azureActiveDirectory: {
                        registration: {
                            clientIdSettingName: "AZURE_CLIENT_ID",
                            openIdIssuer: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
                        },
                        isAutoProvisioned: false,
                    },
                },
                globalValidation: {
                    unauthenticatedClientAction: "RedirectToLoginPage",
                },
            },
        },
    });
}
//# sourceMappingURL=static-web-apps.js.map