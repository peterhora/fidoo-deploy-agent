import { config } from "../config.js";
const ACR_API = "2019-06-01-preview";
function armHeaders(token) {
    return {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };
}
// Get a pre-authenticated upload URL from ACR for source code.
// Returns { uploadUrl, relativePath } — uploadUrl is Azure Files SAS,
// relativePath goes into scheduleAcrBuild as sourceLocation.
export async function listBuildSourceUploadUrl(token) {
    const url = `${config.armBaseUrl}/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.ContainerRegistry/registries/${config.acrName}/listBuildSourceUploadUrl?api-version=${ACR_API}`;
    const res = await fetch(url, {
        method: "POST",
        headers: armHeaders(token),
        body: JSON.stringify({}),
    });
    if (!res.ok) {
        throw new Error(`listBuildSourceUploadUrl failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json());
    return data;
}
const FILES_API_VERSION = "2024-11-04";
const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB — Azure Files max range write
// Upload a buffer to a pre-authenticated Azure Files SAS URL.
// Two-step: create empty file, then write content in 4 MB chunks.
export async function uploadToAzureFiles(uploadUrl, content) {
    // The uploadUrl already contains SAS params (?sv=...&sig=...).
    // For additional query params we append with "&".
    const separator = uploadUrl.includes("?") ? "&" : "?";
    // Step 1: Create the empty file
    const createRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
            "x-ms-type": "file",
            "x-ms-content-length": String(content.length),
            "x-ms-version": FILES_API_VERSION,
            "Content-Length": "0",
        },
    });
    if (!createRes.ok) {
        throw new Error(`Azure Files create failed: ${createRes.status} ${await createRes.text()}`);
    }
    // Step 2: Write content in chunks
    for (let offset = 0; offset < content.length; offset += CHUNK_SIZE) {
        const end = Math.min(offset + CHUNK_SIZE, content.length) - 1;
        const chunk = content.subarray(offset, end + 1);
        const rangeRes = await fetch(`${uploadUrl}${separator}comp=range`, {
            method: "PUT",
            headers: {
                "x-ms-write": "update",
                "x-ms-range": `bytes=${offset}-${end}`,
                "x-ms-version": FILES_API_VERSION,
                "Content-Length": String(chunk.length),
            },
            body: chunk,
        });
        if (!rangeRes.ok) {
            throw new Error(`Azure Files range write failed: ${rangeRes.status} ${await rangeRes.text()}`);
        }
    }
}
// Trigger an ACR Tasks build using the ARM REST API.
// imageTag: just "slug:timestamp" (no login server prefix — ACR handles that)
// sourceLocation: relative path from listBuildSourceUploadUrl (NOT a full URL)
// Returns: the run ID string
export async function scheduleAcrBuild(token, imageTag, sourceLocation) {
    const url = `${config.armBaseUrl}/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.ContainerRegistry/registries/${config.acrName}/scheduleRun?api-version=${ACR_API}`;
    const body = {
        type: "DockerBuildRequest",
        imageNames: [imageTag],
        dockerFilePath: "Dockerfile",
        platform: { os: "Linux", architecture: "amd64" },
        sourceLocation,
        isPushEnabled: true,
    };
    const res = await fetch(url, {
        method: "POST",
        headers: armHeaders(token),
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        throw new Error(`ACR scheduleRun failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return data.properties.runId;
}
// Poll until the build succeeds or fails. 5s interval, 10 minute timeout.
export async function pollAcrBuild(token, runId, onLog) {
    const runUrl = `${config.armBaseUrl}/subscriptions/${config.subscriptionId}/resourceGroups/${config.resourceGroup}/providers/Microsoft.ContainerRegistry/registries/${config.acrName}/runs/${runId}?api-version=${ACR_API}`;
    for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const res = await fetch(runUrl, { headers: armHeaders(token) });
        if (!res.ok) {
            throw new Error(`ACR poll failed: ${res.status} ${await res.text()}`);
        }
        const data = await res.json();
        const status = data.properties.status;
        onLog?.(`[ACR] Run ${runId}: ${status}`);
        if (status === "Succeeded")
            return;
        if (status === "Failed" || status === "Canceled" || status === "Error") {
            throw new Error(`ACR build ${runId} ended with status: ${status}`);
        }
    }
    throw new Error(`ACR build ${runId} timed out after 10 minutes`);
}
//# sourceMappingURL=acr.js.map