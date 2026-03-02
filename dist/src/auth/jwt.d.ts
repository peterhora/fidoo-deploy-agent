/**
 * Extract the user principal name (UPN) from an Azure AD JWT access token.
 * Does NOT validate the signature — this is for audit tagging only.
 */
export declare function extractUpn(token: string): string | undefined;
/**
 * Extract a human-readable display name from an Azure AD JWT access token.
 * Handles B2B guest accounts where upn/preferred_username use the
 * `firstname.lastname_domain.com#EXT#@tenant` format.
 *
 * Priority:
 *   1. `name` claim (full display name, present for most account types)
 *   2. EXT# UPN pattern parsed into "Firstname Lastname"
 *   3. `preferred_username` or `upn` as-is
 */
export declare function extractDisplayName(token: string): string | undefined;
