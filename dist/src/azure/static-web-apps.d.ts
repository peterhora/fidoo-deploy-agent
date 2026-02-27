/**
 * Azure Static Web Apps ARM API operations.
 * No dependencies — uses azureFetch.
 */
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
export declare function createStaticWebApp(token: string, slug: string, options: CreateOptions): Promise<StaticWebAppResource>;
export declare function getStaticWebApp(token: string, slug: string): Promise<StaticWebAppResource>;
export declare function deleteStaticWebApp(token: string, slug: string): Promise<void>;
export declare function listStaticWebApps(token: string): Promise<StaticWebAppResource[]>;
export declare function getDeploymentToken(token: string, slug: string): Promise<string>;
export declare function updateTags(token: string, slug: string, tags: Record<string, string>): Promise<StaticWebAppResource>;
export declare function deploySwaDir(armToken: string, slug: string, outputDir: string): Promise<void>;
export declare function configureAuth(token: string, slug: string): Promise<void>;
