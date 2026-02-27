/**
 * OAuth2 Device Code Flow for Azure Entra ID.
 * No dependencies — uses global fetch.
 */
function tokenUrl(tenantId) {
    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}
function deviceCodeUrl(tenantId) {
    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`;
}
function encodeForm(params) {
    return Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
}
function sleep(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}
export async function startDeviceCodeFlow(tenantId, clientId, scope) {
    const response = await fetch(deviceCodeUrl(tenantId), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encodeForm({ client_id: clientId, scope }),
    });
    const body = await response.json();
    if (!response.ok) {
        const err = body;
        throw new Error(`Device code request failed: ${err.error}${err.error_description ? ` — ${err.error_description}` : ""}`);
    }
    return body;
}
export async function pollForToken(tenantId, clientId, deviceCode, interval) {
    let currentInterval = interval;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const response = await fetch(tokenUrl(tenantId), {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: encodeForm({
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                client_id: clientId,
                device_code: deviceCode,
            }),
        });
        const body = await response.json();
        if (response.ok) {
            return body;
        }
        const err = body;
        if (err.error === "authorization_pending") {
            await sleep(currentInterval);
            continue;
        }
        if (err.error === "slow_down") {
            currentInterval += 5;
            await sleep(currentInterval);
            continue;
        }
        if (err.error === "expired_token") {
            throw new Error("Device code expired. Please restart the login flow.");
        }
        // Any other error is unrecoverable
        throw new Error(`Token request failed: ${err.error}${err.error_description ? ` — ${err.error_description}` : ""}`);
    }
}
export async function refreshAccessToken(tenantId, clientId, refreshToken) {
    const response = await fetch(tokenUrl(tenantId), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encodeForm({
            grant_type: "refresh_token",
            client_id: clientId,
            refresh_token: refreshToken,
        }),
    });
    const body = await response.json();
    if (!response.ok) {
        const err = body;
        throw new Error(`Token refresh failed: ${err.error}${err.error_description ? ` — ${err.error_description}` : ""}`);
    }
    return body;
}
//# sourceMappingURL=device-code.js.map