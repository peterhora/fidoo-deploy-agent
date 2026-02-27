/**
 * Azure REST client — thin fetch wrapper with auth headers.
 * No dependencies — uses global fetch.
 */

import { config } from "../config.js";

export interface AzureFetchOptions {
  token: string;
  method?: string;
  body?: unknown;
  apiVersion?: string;
}

export class AzureError extends Error {
  override name = "AzureError";
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

export async function azureFetch(path: string, options: AzureFetchOptions): Promise<unknown> {
  const { token, method = "GET", body, apiVersion } = options;

  let url = `${config.armBaseUrl}${path}`;
  if (apiVersion) {
    url += `?api-version=${apiVersion}`;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  let requestBody: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: requestBody,
  });

  if (response.status === 204 || response.status === 202) {
    return null;
  }

  const responseBody = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    const errorEnvelope = responseBody.error as
      | { code?: string; message?: string }
      | undefined;
    const code = errorEnvelope?.code ?? "UnknownError";
    const message = errorEnvelope?.message ?? JSON.stringify(responseBody);
    throw new AzureError(message, response.status, code);
  }

  return responseBody;
}
