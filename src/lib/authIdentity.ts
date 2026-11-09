// ════════════════════════════════════════════════════════════
// src/lib/authIdentity.ts
// Pure Verified GitHub Identity Extractor (Safe for Client & Server)
// ════════════════════════════════════════════════════════════

export interface VerifiedGithubIdentity {
  github: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
}

/**
 * Extracts verified GitHub handle strictly from user.identities or user.app_metadata.
 *
 * MUST-VERIFY SECURITY RULES:
 * 1. NEVER reads user_metadata (which is client-editable via auth.updateUser).
 * 2. NEVER falls back to email prefix or user.id.
 * 3. Returns null if no verified GitHub identity exists.
 * 4. Normalizes GitHub handle to lowercase.
 */
export function extractVerifiedGithubIdentity(user: any): VerifiedGithubIdentity | null {
  if (!user || typeof user !== "object") return null;

  // 1. Look for verified GitHub identity in auth.identities
  const githubIdentity = Array.isArray(user.identities)
    ? user.identities.find((id: any) => id?.provider === "github")
    : null;

  const identityData = githubIdentity?.identity_data;

  // 2. Resolve handle strictly from identity_data or app_metadata
  const rawGithub =
    identityData?.user_name ||
    identityData?.preferred_username ||
    (user.app_metadata?.provider === "github"
      ? user.app_metadata?.user_name || user.app_metadata?.preferred_username
      : null);

  if (!rawGithub || typeof rawGithub !== "string" || !rawGithub.trim()) {
    return null;
  }

  const github = rawGithub.trim().toLowerCase();

  const rawName =
    identityData?.name ||
    identityData?.full_name ||
    (user.app_metadata?.provider === "github"
      ? user.app_metadata?.name || user.app_metadata?.full_name
      : null);

  const name =
    typeof rawName === "string" && rawName.trim()
      ? rawName.trim()
      : github;

  const email =
    typeof identityData?.email === "string"
      ? identityData.email
      : typeof user.email === "string"
        ? user.email
        : null;

  const avatar_url =
    typeof identityData?.avatar_url === "string"
      ? identityData.avatar_url
      : typeof user.app_metadata?.avatar_url === "string"
        ? user.app_metadata.avatar_url
        : null;

  return {
    github,
    name,
    email,
    avatar_url,
  };
}

