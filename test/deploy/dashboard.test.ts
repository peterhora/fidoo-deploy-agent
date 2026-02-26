import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  installMockFetch,
  restoreFetch,
  mockFetch,
  getFetchCalls,
} from "../helpers/mock-fetch.js";
import {
  buildAppsJson,
  generateDashboardHtml,
  deployDashboard,
} from "../../src/deploy/dashboard.js";
import type { AppEntry } from "../../src/deploy/dashboard.js";

const TOKEN = "test-access-token";

function makeSwa(
  name: string,
  tags: Record<string, string> = {},
  props: Record<string, unknown> = {},
) {
  return {
    id: `/subscriptions/x/resourceGroups/rg/providers/Microsoft.Web/staticSites/${name}`,
    name,
    location: "westeurope",
    properties: { defaultHostname: `${name}.azurestaticapps.net`, ...props },
    tags,
  };
}

describe("buildAppsJson", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("returns empty array when no SWAs exist", async () => {
    mockFetch((url) => {
      if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
        return { status: 200, body: { value: [] } };
      }
      return undefined;
    });

    const apps = await buildAppsJson(TOKEN);
    assert.deepEqual(apps, []);
  });

  it("excludes the dashboard SWA (slug matches config.dashboardSlug)", async () => {
    mockFetch((url) => {
      if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
        return {
          status: 200,
          body: {
            value: [
              makeSwa("apps", { appName: "Dashboard" }),
              makeSwa("my-app", { appName: "My App" }),
            ],
          },
        };
      }
      return undefined;
    });

    const apps = await buildAppsJson(TOKEN);
    assert.equal(apps.length, 1);
    assert.equal(apps[0].slug, "my-app");
  });

  it("maps SWA resource tags to AppEntry format", async () => {
    mockFetch((url) => {
      if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
        return {
          status: 200,
          body: {
            value: [
              makeSwa("expense-tracker", {
                appName: "Expense Tracker",
                appDescription: "Track your expenses",
                deployedAt: "2026-01-15T10:30:00.000Z",
              }),
            ],
          },
        };
      }
      return undefined;
    });

    const apps = await buildAppsJson(TOKEN);
    assert.equal(apps.length, 1);
    assert.equal(apps[0].slug, "expense-tracker");
    assert.equal(apps[0].name, "Expense Tracker");
    assert.equal(apps[0].description, "Track your expenses");
    assert.equal(apps[0].url, "https://expense-tracker.env.fidoo.cloud");
    assert.equal(apps[0].deployedAt, "2026-01-15T10:30:00.000Z");
  });

  it("sorts apps alphabetically by slug", async () => {
    mockFetch((url) => {
      if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
        return {
          status: 200,
          body: {
            value: [
              makeSwa("zebra-app", { appName: "Zebra" }),
              makeSwa("alpha-app", { appName: "Alpha" }),
              makeSwa("mid-app", { appName: "Mid" }),
            ],
          },
        };
      }
      return undefined;
    });

    const apps = await buildAppsJson(TOKEN);
    assert.equal(apps[0].slug, "alpha-app");
    assert.equal(apps[1].slug, "mid-app");
    assert.equal(apps[2].slug, "zebra-app");
  });

  it("handles missing tags gracefully", async () => {
    mockFetch((url) => {
      if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
        return {
          status: 200,
          body: {
            value: [makeSwa("no-tags")],
          },
        };
      }
      return undefined;
    });

    const apps = await buildAppsJson(TOKEN);
    assert.equal(apps.length, 1);
    assert.equal(apps[0].slug, "no-tags");
    assert.equal(apps[0].name, "no-tags"); // fallback to slug
    assert.equal(apps[0].description, "");
    assert.equal(apps[0].deployedAt, "");
  });
});

describe("generateDashboardHtml", () => {
  it("returns string containing <!DOCTYPE html>", () => {
    const html = generateDashboardHtml([]);
    assert.ok(html.includes("<!DOCTYPE html>"));
  });

  it("includes strict CSP meta tag", () => {
    const html = generateDashboardHtml([]);
    assert.ok(html.includes("default-src 'self'"));
    assert.ok(html.includes("script-src 'unsafe-inline'"));
  });

  it("embeds apps data in a script tag", () => {
    const apps: AppEntry[] = [
      {
        slug: "test-app",
        name: "Test App",
        description: "A test",
        url: "https://test-app.env.fidoo.cloud",
        deployedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const html = generateDashboardHtml(apps);
    assert.ok(html.includes("<script>"));
    assert.ok(html.includes("test-app"));
    assert.ok(html.includes("Test App"));
  });

  it("uses textContent (not innerHTML)", () => {
    const html = generateDashboardHtml([]);
    assert.ok(html.includes("textContent"));
    assert.ok(!html.includes("innerHTML"));
  });

  it("renders with empty apps array", () => {
    const html = generateDashboardHtml([]);
    assert.ok(html.includes("<!DOCTYPE html>"));
    assert.ok(html.includes("[]"));
  });

  it("escapes </script> in app data", () => {
    const apps: AppEntry[] = [
      {
        slug: "xss-app",
        name: "</script><script>alert(1)</script>",
        description: "test",
        url: "https://xss-app.env.fidoo.cloud",
        deployedAt: "",
      },
    ];
    const html = generateDashboardHtml(apps);
    // Should not contain a literal </script> inside the data
    // Split on <script> tags and check the script content
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, "Should have a script tag");
    // The script content should not contain </script>
    assert.ok(
      !scriptMatch[1].includes("</script>"),
      "Script content must not contain literal </script>",
    );
    // But should contain the escaped version
    assert.ok(html.includes("<\\/script>") || html.includes("<\\/"));
  });
});

describe("deployDashboard", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("lists SWAs, generates HTML, deploys ZIP to dashboard SWA", async () => {
    // Mock listStaticWebApps
    mockFetch((url) => {
      if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
        return {
          status: 200,
          body: {
            value: [
              makeSwa("apps", { appName: "Dashboard" }),
              makeSwa("my-app", { appName: "My App", appDescription: "Desc" }),
            ],
          },
        };
      }
      return undefined;
    });

    // Mock getDeploymentToken (for deploySwaZip)
    mockFetch((url, init) => {
      if (url.includes("/listSecrets") && init?.method === "POST") {
        return {
          status: 200,
          body: { properties: { apiKey: "dashboard-deploy-key" } },
        };
      }
      return undefined;
    });

    // Mock getStaticWebApp for dashboard slug (for deploySwaZip)
    mockFetch((url, init) => {
      if (
        url.includes("/staticSites/apps") &&
        !url.includes("/listSecrets") &&
        (!init?.method || init.method === "GET")
      ) {
        return {
          status: 200,
          body: {
            id: "id",
            name: "apps",
            properties: { defaultHostname: "apps.azurestaticapps.net" },
            tags: {},
          },
        };
      }
      return undefined;
    });

    // Mock zipdeploy
    mockFetch((url, init) => {
      if (url.includes("zipdeploy") && init?.method === "POST") {
        return { status: 200, body: {} };
      }
      return undefined;
    });

    await deployDashboard(TOKEN);

    const calls = getFetchCalls();
    // Should have: listStaticWebApps + getDeploymentToken + getStaticWebApp + zipdeploy
    assert.ok(calls.length >= 4, `Expected at least 4 calls, got ${calls.length}`);
    // Verify zipdeploy was called
    const zipCall = calls.find((c) => c.url.includes("zipdeploy"));
    assert.ok(zipCall, "Should deploy via zipdeploy");
    assert.ok(
      zipCall.url.includes("apps.azurestaticapps.net"),
      "Should deploy to dashboard SWA",
    );
  });

  it("propagates errors from Azure API", async () => {
    // Mock listStaticWebApps to fail
    mockFetch((url) => {
      if (url.includes("/staticSites?") || url.includes("/staticSites&")) {
        return {
          status: 403,
          body: { error: { code: "AuthorizationFailed", message: "Forbidden" } },
        };
      }
      return undefined;
    });

    await assert.rejects(() => deployDashboard(TOKEN));
  });
});
