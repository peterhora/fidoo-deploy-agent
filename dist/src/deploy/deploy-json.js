import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const FILE_NAME = ".deploy.json";
export function generateSlug(appName) {
    return appName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
        .replace(/-+$/, "");
}
export async function readDeployConfig(dir) {
    try {
        const raw = await readFile(join(dir, FILE_NAME), "utf8");
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export async function writeDeployConfig(dir, config) {
    await writeFile(join(dir, FILE_NAME), JSON.stringify(config, null, 2) + "\n");
}
//# sourceMappingURL=deploy-json.js.map