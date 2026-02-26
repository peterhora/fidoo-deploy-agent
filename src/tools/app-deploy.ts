import { stat } from "node:fs/promises";
import type { ToolDefinition, ToolHandler, ToolResult } from "./index.js";
import { loadTokens, isTokenExpired } from "../auth/token-store.js";
import { config } from "../config.js";
import { readDeployConfig, writeDeployConfig, generateSlug } from "../deploy/deploy-json.js";
import { collectFiles } from "../deploy/deny-list.js";
import { createZipBuffer } from "../deploy/zip.js";
import {
  createStaticWebApp,
  getStaticWebApp,
  deploySwaZip,
  updateTags,
  configureAuth,
} from "../azure/static-web-apps.js";
import { createCnameRecord } from "../azure/dns.js";
import { AzureError } from "../azure/rest-client.js";
import { deployDashboard } from "../deploy/dashboard.js";
import { extractUpn } from "../auth/jwt.js";

export const definition: ToolDefinition = {
  name: "app_deploy",
  description:
    "Deploy a static app to Azure Static Web Apps. First deploy requires app_name and app_description. Re-deploy reads .deploy.json automatically. ZIPs the folder, creates/updates the SWA, configures DNS and auth, and rebuilds the dashboard.",
  inputSchema: {
    type: "object",
    properties: {
      folder: {
        type: "string",
        description: "Path to the folder to deploy",
      },
      app_name: {
        type: "string",
        description: "Display name for the app (first deploy only)",
      },
      app_description: {
        type: "string",
        description: "Short description for the dashboard (first deploy only)",
      },
    },
    required: ["folder"],
  },
};

function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function successResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }] };
}

async function firstDeploy(
  token: string,
  folder: string,
  appName: string,
  appDescription: string,
): Promise<ToolResult> {
  const slug = generateSlug(appName);

  // Collision check
  try {
    await getStaticWebApp(token, slug);
    // If we get here, the slug already exists
    return errorResult(`App slug "${slug}" already exists. Choose a different app_name.`);
  } catch (err) {
    if (!(err instanceof AzureError && err.status === 404)) {
      throw err; // Unexpected error
    }
    // 404 = slug available, continue
  }

  const files = await collectFiles(folder);
  const zipBuffer = await createZipBuffer(folder, files);

  const swa = await createStaticWebApp(token, slug, { appName, appDescription });
  await deploySwaZip(token, slug, zipBuffer);

  const hostname = (swa.properties as { defaultHostname: string }).defaultHostname;
  await createCnameRecord(token, slug, hostname);
  await configureAuth(token, slug);

  const tags: Record<string, string> = {
    appName,
    appDescription,
    deployedAt: new Date().toISOString(),
  };
  const upn = extractUpn(token);
  if (upn) tags.deployedBy = upn;

  await updateTags(token, slug, tags);

  await writeDeployConfig(folder, {
    appSlug: slug,
    appName,
    appDescription,
    resourceId: swa.id,
  });

  await deployDashboard(token);

  const url = `https://${slug}.${config.dnsZone}`;
  return successResult(JSON.stringify({ status: "ok", url, slug }));
}

async function redeploy(
  token: string,
  folder: string,
  existingConfig: { appSlug: string },
): Promise<ToolResult> {
  const { appSlug } = existingConfig;

  const files = await collectFiles(folder);
  const zipBuffer = await createZipBuffer(folder, files);

  await deploySwaZip(token, appSlug, zipBuffer);

  const tags: Record<string, string> = {
    deployedAt: new Date().toISOString(),
  };
  const upn = extractUpn(token);
  if (upn) tags.deployedBy = upn;

  await updateTags(token, appSlug, tags);

  await deployDashboard(token);

  const url = `https://${appSlug}.${config.dnsZone}`;
  return successResult(JSON.stringify({ status: "ok", url, slug: appSlug }));
}

export const handler: ToolHandler = async (args) => {
  const folder = args.folder as string;

  // Validate folder exists
  try {
    const s = await stat(folder);
    if (!s.isDirectory()) {
      return errorResult(`Folder path is not a directory: ${folder}`);
    }
  } catch {
    return errorResult(`Folder does not exist: ${folder}`);
  }

  // Check auth
  const tokens = await loadTokens();
  if (!tokens) {
    return errorResult("Not authenticated. Run auth_login first.");
  }
  if (isTokenExpired(tokens)) {
    return errorResult("Token expired. Run auth_login to re-authenticate.");
  }

  const token = tokens.access_token;

  // Check for existing .deploy.json
  const existing = await readDeployConfig(folder);
  if (existing) {
    return redeploy(token, folder, existing);
  }

  // First deploy — need app_name and app_description
  const appName = args.app_name as string | undefined;
  const appDescription = args.app_description as string | undefined;

  if (!appName) {
    return errorResult("First deploy requires app_name argument.");
  }
  if (!appDescription) {
    return errorResult("First deploy requires app_description argument.");
  }

  return firstDeploy(token, folder, appName, appDescription);
};
