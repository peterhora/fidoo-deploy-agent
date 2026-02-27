import { config } from "../config.js";

function blobUrl(blobPath: string): string {
  return `https://${config.storageAccount}.blob.core.windows.net/${config.containerName}/${blobPath}`;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "x-ms-version": config.storageApiVersion,
  };
}

export async function uploadBlob(token: string, blobPath: string, content: Buffer): Promise<void> {
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

export async function downloadBlob(token: string, blobPath: string): Promise<Buffer | null> {
  const resp = await fetch(blobUrl(blobPath), {
    method: "GET",
    headers: authHeaders(token),
  });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    throw new Error(`Blob download failed: ${resp.status} ${await resp.text()}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

export async function deleteBlob(token: string, blobPath: string): Promise<void> {
  const resp = await fetch(blobUrl(blobPath), {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Blob delete failed: ${resp.status} ${await resp.text()}`);
  }
}

export async function listBlobs(token: string, prefix?: string): Promise<string[]> {
  let url = `https://${config.storageAccount}.blob.core.windows.net/${config.containerName}?restype=container&comp=list`;
  if (prefix) url += `&prefix=${encodeURIComponent(prefix)}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: authHeaders(token),
  });
  if (!resp.ok) {
    throw new Error(`Blob list failed: ${resp.status} ${await resp.text()}`);
  }
  const xml = await resp.text();
  const names: string[] = [];
  const regex = /<Name>([^<]+)<\/Name>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    names.push(match[1]);
  }
  return names;
}

export async function deleteBlobsByPrefix(token: string, prefix: string): Promise<void> {
  const blobs = await listBlobs(token, prefix);
  await Promise.all(blobs.map((name) => deleteBlob(token, name)));
}
