/**
 * Azure REST client — thin fetch wrapper with auth headers.
 * No dependencies — uses global fetch.
 */
import { config } from "../config.js";
export class AzureError extends Error {
    status;
    code;
    name = "AzureError";
    constructor(message, status, code) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
export async function azureFetch(path, options) {
    const { token, method = "GET", body, apiVersion } = options;
    let url = `${config.armBaseUrl}${path}`;
    if (apiVersion) {
        url += `?api-version=${apiVersion}`;
    }
    const headers = {
        Authorization: `Bearer ${token}`,
    };
    let requestBody;
    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        requestBody = JSON.stringify(body);
    }
    const response = await fetch(url, {
        method,
        headers,
        body: requestBody,
    });
    if (response.status === 204) {
        return null;
    }
    const responseBody = await response.json();
    if (!response.ok) {
        const errorEnvelope = responseBody.error;
        const code = errorEnvelope?.code ?? "UnknownError";
        const message = errorEnvelope?.message ?? JSON.stringify(responseBody);
        throw new AzureError(message, response.status, code);
    }
    return responseBody;
}
//# sourceMappingURL=rest-client.js.map