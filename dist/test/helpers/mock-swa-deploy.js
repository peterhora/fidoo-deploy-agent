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
import { mock } from "node:test";
import childProcess from "node:child_process";
/**
 * Returns a mockFetch matcher that handles the /listSecrets POST call
 * used by getDeploymentToken().
 */
export function listSecretsMatcher() {
    return (url, init) => {
        if (url.includes("/listSecrets") && init?.method === "POST") {
            return {
                status: 200,
                body: { properties: { apiKey: "test-deploy-key" } },
            };
        }
        return undefined;
    };
}
/**
 * Mocks child_process.execFile to simulate successful SWA binary execution.
 * Must be called in beforeEach and paired with mock.restoreAll() in afterEach.
 */
export function mockExecFile() {
    mock.method(childProcess, "execFile", function mockedExecFile(_cmd, _args, _opts, cb) {
        // Handle overloaded signatures: execFile(cmd, args, cb) or execFile(cmd, args, opts, cb)
        if (typeof _opts === "function") {
            cb = _opts;
        }
        if (typeof cb === "function") {
            cb(null, "Deployment Complete :)\nStatus: Succeeded\n", "");
        }
    });
}
/**
 * Restores the original child_process.execFile.
 * Call in afterEach alongside mock.restoreAll().
 */
export function restoreExecFile() {
    mock.restoreAll();
}
//# sourceMappingURL=mock-swa-deploy.js.map