import { downloadBlob, uploadBlob } from "../azure/blob.js";
const REGISTRY_BLOB = "registry.json";
export async function loadRegistry(token) {
    const buf = await downloadBlob(token, REGISTRY_BLOB);
    if (!buf)
        return { apps: [] };
    return JSON.parse(buf.toString("utf-8"));
}
export async function saveRegistry(token, registry) {
    const json = JSON.stringify(registry, null, 2);
    await uploadBlob(token, REGISTRY_BLOB, Buffer.from(json, "utf-8"));
}
export function upsertApp(registry, entry) {
    const apps = registry.apps.filter((a) => a.slug !== entry.slug);
    apps.push(entry);
    apps.sort((a, b) => a.slug.localeCompare(b.slug));
    return { apps };
}
export function removeApp(registry, slug) {
    return { apps: registry.apps.filter((a) => a.slug !== slug) };
}
//# sourceMappingURL=registry.js.map