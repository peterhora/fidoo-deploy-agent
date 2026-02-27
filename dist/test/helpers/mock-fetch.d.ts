/**
 * Shared fetch mock for tests. Intercepts global fetch and returns
 * canned responses based on URL/body matching.
 */
export interface MockResponse {
    status: number;
    body: unknown;
    headers?: Record<string, string>;
}
export type RequestMatcher = (url: string, init?: RequestInit) => MockResponse | undefined;
export declare function mockFetch(matcher: RequestMatcher): void;
export declare function mockFetchOnce(response: MockResponse, urlMatch?: string): void;
export declare function getFetchCalls(): Array<{
    url: string;
    init?: RequestInit;
}>;
export declare function installMockFetch(): void;
export declare function restoreFetch(): void;
