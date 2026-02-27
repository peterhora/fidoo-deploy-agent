/**
 * Shared fetch mock for tests. Intercepts global fetch and returns
 * canned responses based on URL/body matching.
 */
let matchers = [];
let originalFetch;
let calls = [];
export function mockFetch(matcher) {
    matchers.push(matcher);
}
export function mockFetchOnce(response, urlMatch) {
    let used = false;
    matchers.push((url) => {
        if (used)
            return undefined;
        if (urlMatch && !url.includes(urlMatch))
            return undefined;
        used = true;
        return response;
    });
}
export function getFetchCalls() {
    return [...calls];
}
export function installMockFetch() {
    originalFetch = globalThis.fetch;
    calls = [];
    matchers = [];
    globalThis.fetch = (async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        calls.push({ url, init });
        for (const matcher of matchers) {
            const result = matcher(url, init);
            if (result) {
                // Status 204 (No Content) must not have a body
                if (result.status === 204) {
                    return new Response(null, { status: 204 });
                }
                const headers = { "content-type": "application/json", ...result.headers };
                const contentType = headers["content-type"];
                const body = typeof result.body === "string" && !contentType.includes("application/json")
                    ? result.body
                    : JSON.stringify(result.body);
                return new Response(body, { status: result.status, headers });
            }
        }
        throw new Error(`mock-fetch: no matcher for ${url}`);
    });
}
export function restoreFetch() {
    globalThis.fetch = originalFetch;
    matchers = [];
    calls = [];
}
//# sourceMappingURL=mock-fetch.js.map