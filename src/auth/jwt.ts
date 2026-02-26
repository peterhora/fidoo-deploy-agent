/**
 * Extract the user principal name (UPN) from an Azure AD JWT access token.
 * Does NOT validate the signature — this is for audit tagging only.
 */
export function extractUpn(token: string): string | undefined {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return undefined;

    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );

    return payload.upn || payload.preferred_username || undefined;
  } catch {
    return undefined;
  }
}
