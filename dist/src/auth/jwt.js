/**
 * Extract the user principal name (UPN) from an Azure AD JWT access token.
 * Does NOT validate the signature — this is for audit tagging only.
 */
export function extractUpn(token) {
    try {
        const parts = token.split(".");
        if (parts.length !== 3)
            return undefined;
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        return payload.upn || payload.preferred_username || undefined;
    }
    catch {
        return undefined;
    }
}
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
export function extractDisplayName(token) {
    try {
        const parts = token.split(".");
        if (parts.length !== 3)
            return undefined;
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        if (payload.name)
            return payload.name;
        const upnLike = payload.preferred_username || payload.upn;
        if (!upnLike)
            return undefined;
        // B2B guest pattern: firstname.lastname_domain.com#EXT#@tenant
        const extMatch = /^([^_]+)_[^#]+#EXT#/i.exec(upnLike);
        if (extMatch) {
            return extMatch[1]
                .split(".")
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                .join(" ");
        }
        return upnLike;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=jwt.js.map