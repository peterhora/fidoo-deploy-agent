/**
 * OAuth2 Device Code Flow for Azure Entra ID.
 * No dependencies — uses global fetch.
 */
export interface DeviceCodeResponse {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
    message: string;
}
export interface TokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
}
export declare function startDeviceCodeFlow(tenantId: string, clientId: string, scope: string): Promise<DeviceCodeResponse>;
export declare function pollForToken(tenantId: string, clientId: string, deviceCode: string, interval: number): Promise<TokenResponse>;
export declare function refreshAccessToken(tenantId: string, clientId: string, refreshToken: string): Promise<TokenResponse>;
