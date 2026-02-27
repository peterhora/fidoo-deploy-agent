/**
 * Downloads and runs the StaticSitesClient binary for SWA deployment.
 * Same binary used by @azure/static-web-apps-cli under the hood.
 */
export declare function ensureSwaClient(): Promise<string>;
export declare function deploySwaContent(apiToken: string, outputDir: string): Promise<void>;
