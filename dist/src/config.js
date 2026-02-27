export function buildConfig() {
    return {
        tenantId: process.env.DEPLOY_AGENT_TENANT_ID ?? "7d8c4da5-9bcc-48dd-ace3-fb4681cf4277",
        clientId: process.env.DEPLOY_AGENT_CLIENT_ID ?? "PLACEHOLDER_CLIENT_ID",
        subscriptionId: process.env.DEPLOY_AGENT_SUBSCRIPTION_ID ?? "PLACEHOLDER_SUBSCRIPTION_ID",
        resourceGroup: process.env.DEPLOY_AGENT_RESOURCE_GROUP ?? "rg-published-apps",
        storageAccount: process.env.DEPLOY_AGENT_STORAGE_ACCOUNT ?? "PLACEHOLDER_STORAGE_ACCOUNT",
        containerName: process.env.DEPLOY_AGENT_CONTAINER_NAME ?? "app-content",
        appDomain: process.env.DEPLOY_AGENT_APP_DOMAIN ?? "ai-apps.env.fidoo.cloud",
        swaSlug: process.env.DEPLOY_AGENT_SWA_SLUG ?? "ai-apps",
        armScope: "https://management.azure.com/.default offline_access",
        storageScope: "https://storage.azure.com/.default offline_access",
        armBaseUrl: "https://management.azure.com",
        entraBaseUrl: "https://login.microsoftonline.com",
        swaApiVersion: "2022-09-01",
        storageApiVersion: "2024-11-04",
        location: process.env.DEPLOY_AGENT_LOCATION ?? "westeurope",
        swaSkuName: "Free",
        swaSkuTier: "Free",
    };
}
export const config = buildConfig();
//# sourceMappingURL=config.js.map