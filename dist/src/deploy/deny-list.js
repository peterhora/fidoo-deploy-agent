import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
export const DENIED_PATTERNS = [
    ".env", // exact + prefix (.env, .env.local, .env.production, …)
    ".git/", // directory
    "node_modules/", // directory
    ".deploy.json", // exact
    ".claude/", // directory
    "*.pem", // extension
    "*.key", // extension
    "*.pfx", // certificate store
    "*.p12", // certificate store
    ".DS_Store", // exact
    ".npmrc", // may contain registry tokens
    "id_rsa", // SSH private key
    "id_ed25519", // SSH private key
    "id_ecdsa", // SSH private key
];
export function shouldExclude(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    const segments = normalized.split("/");
    const fileName = segments[segments.length - 1];
    for (const pattern of DENIED_PATTERNS) {
        if (pattern.endsWith("/")) {
            // Directory pattern — match if any path segment equals the dir name
            const dirName = pattern.slice(0, -1);
            if (segments.slice(0, -1).includes(dirName))
                return true;
        }
        else if (pattern.startsWith("*.")) {
            // Extension pattern
            if (fileName.endsWith(pattern.slice(1)))
                return true;
        }
        else if (pattern === ".env") {
            // .env matches .env, .env.local, .env.production, etc.
            if (fileName === ".env" || fileName.startsWith(".env."))
                return true;
        }
        else {
            // Exact basename match
            if (fileName === pattern)
                return true;
        }
    }
    return false;
}
export async function collectFiles(rootDir) {
    const results = [];
    async function walk(dir) {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const relPath = relative(rootDir, fullPath).replace(/\\/g, "/");
            if (entry.isDirectory()) {
                // Check if directory itself should be excluded (using trailing slash convention)
                if (!shouldExclude(relPath + "/x")) {
                    // If a file inside this dir wouldn't be excluded, recurse
                    await walk(fullPath);
                }
            }
            else if (entry.isFile()) {
                if (!shouldExclude(relPath)) {
                    results.push(relPath);
                }
            }
        }
    }
    await walk(rootDir);
    results.sort();
    return results;
}
//# sourceMappingURL=deny-list.js.map