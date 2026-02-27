/**
 * Azure REST client — thin fetch wrapper with auth headers.
 * No dependencies — uses global fetch.
 */
export interface AzureFetchOptions {
    token: string;
    method?: string;
    body?: unknown;
    apiVersion?: string;
}
export declare class AzureError extends Error {
    status: number;
    code: string;
    name: string;
    constructor(message: string, status: number, code: string);
}
export declare function azureFetch(path: string, options: AzureFetchOptions): Promise<unknown>;
