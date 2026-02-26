/**
 * Azure DNS CNAME record management.
 * No dependencies — uses azureFetch.
 */

import { config } from "../config.js";
import { azureFetch } from "./rest-client.js";

export interface CnameRecord {
  name: string;
  properties: {
    TTL: number;
    CNAMERecord: { cname: string };
  };
}

function cnamePath(subdomain: string): string {
  return `/subscriptions/${config.subscriptionId}/resourceGroups/${config.dnsResourceGroup}/providers/Microsoft.Network/dnsZones/${config.dnsZone}/CNAME/${subdomain}`;
}

export async function createCnameRecord(
  token: string,
  subdomain: string,
  target: string,
): Promise<CnameRecord> {
  return (await azureFetch(cnamePath(subdomain), {
    token,
    method: "PUT",
    apiVersion: config.dnsApiVersion,
    body: {
      properties: {
        TTL: 3600,
        CNAMERecord: { cname: target },
      },
    },
  })) as CnameRecord;
}

export async function deleteCnameRecord(
  token: string,
  subdomain: string,
): Promise<void> {
  await azureFetch(cnamePath(subdomain), {
    token,
    method: "DELETE",
    apiVersion: config.dnsApiVersion,
  });
}

export async function getCnameRecord(
  token: string,
  subdomain: string,
): Promise<CnameRecord> {
  return (await azureFetch(cnamePath(subdomain), {
    token,
    method: "GET",
    apiVersion: config.dnsApiVersion,
  })) as CnameRecord;
}
