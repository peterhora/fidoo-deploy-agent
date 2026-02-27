/**
 * Azure Static Web Apps ARM API operations.
 * No dependencies — uses azureFetch.
 */
import { config } from "../config.js";
import { azureFetch } from "./rest-client.js";
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
export async function deploySwaZip(token, slug, zipBuffer) {
    const apiKey = await getDeploymentToken(token, slug);
    const swa = await getStaticWebApp(token, slug);
    const hostname = swa.properties.defaultHostname;
    const response = await fetch(`https://${hostname}/api/zipdeploy?provider=SwaCli`, {
        method: "POST",
        headers: {
            Authorization: apiKey,
            "Content-Type": "application/octet-stream",
        },
        body: zipBuffer,
    });
    if (!response.ok) {
        throw new Error(`Deployment failed: ${response.status} ${response.statusText}`);
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