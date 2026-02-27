/**
 * Token storage with file-based persistence.
 *
 * Production path: ~/.deploy-agent/tokens.json (mode 0600)
 * Tests pass a custom dir to avoid touching real storage.
 *
 * Future: macOS Keychain via `security` CLI as primary store.
 */
export interface StoredTokens {
    access_token: string;
    refresh_token: string;
    expires_at: number;
}
export declare function getTokenDir(): string;
export declare function saveTokens(tokens: StoredTokens, dir?: string): Promise<void>;
export declare function loadTokens(dir?: string): Promise<StoredTokens | null>;
export declare function clearTokens(dir?: string): Promise<void>;
export declare function isTokenExpired(tokens: StoredTokens): boolean;
