/**
 * Shared helpers for mocking the SWA deploy path in tests.
 *
 * The new deploy flow calls:
 *   deploySwaDir -> getDeploymentToken (fetch /listSecrets) -> deploySwaContent (binary via execFile)
 *
 * These helpers mock both parts:
 *   1. mockFetch matcher for /listSecrets (returns a fake deployment token)
 *   2. mock.method on child_process.execFile (returns success output)
 */
import type { RequestMatcher } from "./mock-fetch.js";
/**
 * Returns a mockFetch matcher that handles the /listSecrets POST call
 * used by getDeploymentToken().
 */
export declare function listSecretsMatcher(): RequestMatcher;
/**
 * Mocks child_process.execFile to simulate successful SWA binary execution.
 * Must be called in beforeEach and paired with mock.restoreAll() in afterEach.
 */
export declare function mockExecFile(): void;
/**
 * Restores the original child_process.execFile.
 * Call in afterEach alongside mock.restoreAll().
 */
export declare function restoreExecFile(): void;
