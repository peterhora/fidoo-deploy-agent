export function buildConfig() {
  return {
    tenantId: process.env.DEPLOY_AGENT_TENANT_ID ?? "7d8c4da5-9bcc-48dd-ace3-fb4681cf4277",
    clientId: process.env.DEPLOY_AGENT_CLIENT_ID ?? "PLACEHOLDER_CLIENT_ID",
    subscriptionId: process.env.DEPLOY_AGENT_SUBSCRIPTION_ID ?? "PLACEHOLDER_SUBSCRIPTION_ID",
    resourceGroup: process.env.DEPLOY_AGENT_RESOURCE_GROUP ?? "rg-published-apps",
    dnsZone: process.env.DEPLOY_AGENT_DNS_ZONE ?? "env.fidoo.cloud",
    dnsResourceGroup: process.env.DEPLOY_AGENT_DNS_RESOURCE_GROUP ?? "PLACEHOLDER_DNS_RESOURCE_GROUP",
    dashboardSlug: "apps",
    scope: "https://management.azure.com/.default offline_access",
    armBaseUrl: "https://management.azure.com",
    entraBaseUrl: "https://login.microsoftonline.com",
    swaApiVersion: "2022-09-01",
    dnsApiVersion: "2018-05-01",
    location: process.env.DEPLOY_AGENT_LOCATION ?? "westeurope",
    swaSkuName: "Free",
    swaSkuTier: "Free",
  };
}

export const config = buildConfig();
