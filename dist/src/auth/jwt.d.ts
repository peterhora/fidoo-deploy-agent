/**
 * Extract the user principal name (UPN) from an Azure AD JWT access token.
 * Does NOT validate the signature — this is for audit tagging only.
 */
export declare function extractUpn(token: string): string | undefined;
