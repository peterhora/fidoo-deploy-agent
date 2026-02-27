/**
 * Token storage with file-based persistence.
 *
 * Production path: ~/.deploy-agent/tokens.json (mode 0600)
 * Tests pass a custom dir to avoid touching real storage.
 *
 * Future: macOS Keychain via `security` CLI as primary store.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
const TOKENS_FILE = "tokens.json";
const SAFETY_MARGIN_MS = 5 * 60 * 1000; // 5 minutes
export function getTokenDir() {
    return process.env.DEPLOY_AGENT_TOKEN_DIR || path.join(os.homedir(), ".deploy-agent");
}
function tokensPath(dir) {
    return path.join(dir, TOKENS_FILE);
}
export async function saveTokens(tokens, dir = getTokenDir()) {
    fs.mkdirSync(dir, { recursive: true });
    const filePath = tokensPath(dir);
    fs.writeFileSync(filePath, JSON.stringify(tokens, null, 2), {
        mode: 0o600,
    });
}
export async function loadTokens(dir = getTokenDir()) {
    const filePath = tokensPath(dir);
    try {
        const data = fs.readFileSync(filePath, "utf-8");
        return JSON.parse(data);
    }
    catch {
        return null;
    }
}
export async function clearTokens(dir = getTokenDir()) {
    const filePath = tokensPath(dir);
    try {
        fs.unlinkSync(filePath);
    }
    catch {
        // Already gone — that's fine
    }
}
export function isTokenExpired(tokens) {
    return tokens.expires_at - Date.now() < SAFETY_MARGIN_MS;
}
//# sourceMappingURL=token-store.js.map