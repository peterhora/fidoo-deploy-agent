/**
 * Azure Static Web Apps ARM API operations.
 * No dependencies — uses azureFetch.
 */

import { config } from "../config.js";
import { azureFetch } from "./rest-client.js";
import { uploadBlob, deleteBlob, generateBlobSasUrl } from "./blob.js";

export interface StaticWebAppResource {
  id: string;
  name: string;
  location: string;
  properties: Record<string, unknown>;
  tags: Record<string, string>;
}

export interface CreateOptions {
  appName: string;
  appDescription: string;
}

function swaPath(slug: string): string {
  return `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Web/staticSites/${slug}`;
}

function swaListPath(): string {
  return `/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.Web/staticSites`;
}

export async function createStaticWebApp(
  token: string,
  slug: string,
  options: CreateOptions,
): Promise<StaticWebAppResource> {
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
  })) as StaticWebAppResource;
}

export async function getStaticWebApp(
  token: string,
  slug: string,
): Promise<StaticWebAppResource> {
  return (await azureFetch(swaPath(slug), {
    token,
    method: "GET",
    apiVersion: config.swaApiVersion,
  })) as StaticWebAppResource;
}

export async function deleteStaticWebApp(
  token: string,
  slug: string,
): Promise<void> {
  await azureFetch(swaPath(slug), {
    token,
    method: "DELETE",
    apiVersion: config.swaApiVersion,
  });
}

export async function listStaticWebApps(
  token: string,
): Promise<StaticWebAppResource[]> {
  const result = (await azureFetch(swaListPath(), {
    token,
    method: "GET",
    apiVersion: config.swaApiVersion,
  })) as { value: StaticWebAppResource[] };
  return result.value;
}

export async function getDeploymentToken(
  token: string,
  slug: string,
): Promise<string> {
  const result = (await azureFetch(`${swaPath(slug)}/listSecrets`, {
    token,
    method: "POST",
    apiVersion: config.swaApiVersion,
  })) as { properties: { apiKey: string } };
  return result.properties.apiKey;
}

export async function updateTags(
  token: string,
  slug: string,
  tags: Record<string, string>,
): Promise<StaticWebAppResource> {
  return (await azureFetch(swaPath(slug), {
    token,
    method: "PATCH",
    apiVersion: config.swaApiVersion,
    body: { tags },
  })) as StaticWebAppResource;
}

export async function deploySwaZip(
  armToken: string,
  storageToken: string,
  slug: string,
  zipBuffer: Buffer,
): Promise<void> {
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
  } finally {
    // Clean up temp blob
    await deleteBlob(storageToken, tempBlobPath).catch(() => {});
  }
}

export async function configureAuth(
  token: string,
  slug: string,
): Promise<void> {
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
