import { createHmac } from "node:crypto";
import { config } from "../config.js";
function blobUrl(blobPath) {
    return `https://${config.storageAccount}.blob.core.windows.net/${config.containerName}/${blobPath}`;
}
function authHeaders(token) {
    return {
        Authorization: `Bearer ${token}`,
        "x-ms-version": config.storageApiVersion,
    };
}
export async function uploadBlob(token, blobPath, content) {
    const resp = await fetch(blobUrl(blobPath), {
        method: "PUT",
        headers: {
            ...authHeaders(token),
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": "application/octet-stream",
            "Content-Length": String(content.length),
        },
        body: new Uint8Array(content),
    });
    if (!resp.ok) {
        throw new Error(`Blob upload failed: ${resp.status} ${await resp.text()}`);
    }
}
export async function downloadBlob(token, blobPath) {
    const resp = await fetch(blobUrl(blobPath), {
        method: "GET",
        headers: authHeaders(token),
    });
    if (resp.status === 404)
        return null;
    if (!resp.ok) {
        throw new Error(`Blob download failed: ${resp.status} ${await resp.text()}`);
    }
    return Buffer.from(await resp.arrayBuffer());
}
export async function deleteBlob(token, blobPath) {
    const resp = await fetch(blobUrl(blobPath), {
        method: "DELETE",
        headers: authHeaders(token),
    });
    if (!resp.ok && resp.status !== 404) {
        throw new Error(`Blob delete failed: ${resp.status} ${await resp.text()}`);
    }
}
export async function listBlobs(token, prefix) {
    let url = `https://${config.storageAccount}.blob.core.windows.net/${config.containerName}?restype=container&comp=list`;
    if (prefix)
        url += `&prefix=${encodeURIComponent(prefix)}`;
    const resp = await fetch(url, {
        method: "GET",
        headers: authHeaders(token),
    });
    if (!resp.ok) {
        throw new Error(`Blob list failed: ${resp.status} ${await resp.text()}`);
    }
    const xml = await resp.text();
    const names = [];
    const regex = /<Name>([^<]+)<\/Name>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
        names.push(match[1]);
    }
    return names;
}
export async function deleteBlobsByPrefix(token, prefix) {
    const blobs = await listBlobs(token, prefix);
    await Promise.all(blobs.map((name) => deleteBlob(token, name)));
}
async function getUserDelegationKey(token) {
    const now = new Date();
    const start = now.toISOString().replace(/\.\d{3}Z/, "Z");
    const expiry = new Date(now.getTime() + 3600_000).toISOString().replace(/\.\d{3}Z/, "Z");
    const resp = await fetch(`https://${config.storageAccount}.blob.core.windows.net/?restype=service&comp=userdelegationkey`, {
        method: "POST",
        headers: {
            ...authHeaders(token),
            "Content-Type": "application/xml",
        },
        body: `<?xml version="1.0" encoding="utf-8"?><KeyInfo><Start>${start}</Start><Expiry>${expiry}</Expiry></KeyInfo>`,
    });
    if (!resp.ok) {
        throw new Error(`User delegation key request failed: ${resp.status} ${await resp.text()}`);
    }
    const xml = await resp.text();
    const extract = (tag) => {
        const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
        return match?.[1] ?? "";
    };
    return {
        signedOid: extract("SignedOid"),
        signedTid: extract("SignedTid"),
        signedStart: extract("SignedStart"),
        signedExpiry: extract("SignedExpiry"),
        signedService: extract("SignedService"),
        signedVersion: extract("SignedVersion"),
        value: extract("Value"),
    };
}
export async function generateBlobSasUrl(token, blobPath) {
    const key = await getUserDelegationKey(token);
    const now = new Date();
    const start = now.toISOString().replace(/\.\d{3}Z/, "Z");
    const expiry = new Date(now.getTime() + 3600_000).toISOString().replace(/\.\d{3}Z/, "Z");
    const canonicalizedResource = `/blob/${config.storageAccount}/${config.containerName}/${blobPath}`;
    const stringToSign = [
        "r", // signedPermissions
        start, // signedStart
        expiry, // signedExpiry
        canonicalizedResource,
        key.signedOid, // signedKeyObjectId
        key.signedTid, // signedKeyTenantId
        key.signedStart, // signedKeyStart
        key.signedExpiry, // signedKeyExpiry
        key.signedService, // signedKeyService
        key.signedVersion, // signedKeyVersion
        "", // signedAuthorizedUserObjectId
        "", // signedUnauthorizedUserObjectId
        "", // signedCorrelationId
        "", // signedIP
        "https", // signedProtocol
        config.storageApiVersion, // signedVersion
        "b", // signedResource (blob)
        "", // signedSnapshotTime
        "", // signedEncryptionScope
        "", // rscc (Cache-Control)
        "", // rscd (Content-Disposition)
        "", // rsce (Content-Encoding)
        "", // rscl (Content-Language)
        "", // rsct (Content-Type)
    ].join("\n");
    const sig = createHmac("sha256", Buffer.from(key.value, "base64"))
        .update(stringToSign, "utf-8")
        .digest("base64");
    const params = new URLSearchParams({
        sp: "r",
        st: start,
        se: expiry,
        spr: "https",
        sv: config.storageApiVersion,
        sr: "b",
        skoid: key.signedOid,
        sktid: key.signedTid,
        skt: key.signedStart,
        ske: key.signedExpiry,
        sks: key.signedService,
        skv: key.signedVersion,
        sig,
    });
    return `${blobUrl(blobPath)}?${params.toString()}`;
}
//# sourceMappingURL=blob.js.map