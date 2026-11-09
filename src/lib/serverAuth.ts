// ════════════════════════════════════════════════════════════
// src/lib/serverAuth.ts
// Server-Side Cryptographic Caller Identity Verification
// ════════════════════════════════════════════════════════════

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase";
import type { NextRequest } from "next/server";

export interface AuthenticatedUser {
  id: string;
  github: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  isCryptographicallyVerified: boolean;
}

export { extractVerifiedGithubIdentity } from "./authIdentity";
import { extractVerifiedGithubIdentity } from "./authIdentity";

/**
 * Authenticates the caller in Server Actions / Server Components
 * using cryptographically signed HTTP session cookies.
 * Verification is the ONLY mode.
 */
export async function getAuthenticatedServerUser(): Promise<AuthenticatedUser | null> {
  try {
    const cookieStore = cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return null;
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    });

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) return null;

    const verified = extractVerifiedGithubIdentity(user);
    if (!verified) return null;

    return {
      id: user.id,
      github: verified.github,
      name: verified.name,
      email: verified.email,
      avatar_url: verified.avatar_url,
      isCryptographicallyVerified: true,
    };
  } catch {
    return null;
  }
}

/**
 * Authenticates a caller in Server Actions using a passed Bearer/JWT token
 * (as stored in localStorage by supabase-js in the browser), with cookie fallback.
 * Verification is the ONLY mode.
 */
export async function getVerifiedTokenUser(
  token?: string | null
): Promise<AuthenticatedUser | null> {
  if (token && typeof token === "string" && token.trim()) {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) return null;

      const authClient = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await authClient.auth.getUser(token.trim());
      if (error || !data?.user) return null;

      const verified = extractVerifiedGithubIdentity(data.user);
      if (!verified) return null;

      return {
        id: data.user.id,
        github: verified.github,
        name: verified.name,
        email: verified.email,
        avatar_url: verified.avatar_url,
        isCryptographicallyVerified: true,
      };
    } catch {
      return null;
    }
  }

  // Fallback: check signed HTTP session cookies
  return getAuthenticatedServerUser();
}

/**
 * Authenticates the caller in API route handlers (src/app/api/**)
 * using Bearer token from Authorization header or cookie session.
 */
export async function getVerifiedApiUser(
  req: NextRequest | Request
): Promise<AuthenticatedUser | null> {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return null;

    const authClient = createClient(supabaseUrl, supabaseAnonKey);

    let user: any = null;
    if (token) {
      const { data, error } = await authClient.auth.getUser(token);
      if (!error && data?.user) {
        user = data.user;
      }
    }

    // Fallback: try cookies if token header was omitted
    if (!user && req.headers.get("cookie")) {
      try {
        const cookieStore = cookies();
        const cookieClient = createServerClient(supabaseUrl, supabaseAnonKey, {
          cookies: {
            get(name: string) {
              return cookieStore.get(name)?.value;
            },
          },
        });
        const { data, error } = await cookieClient.auth.getUser();
        if (!error && data?.user) {
          user = data.user;
        }
      } catch {}
    }

    if (!user) return null;

    const verified = extractVerifiedGithubIdentity(user);
    if (!verified) return null;

    return {
      id: user.id,
      github: verified.github,
      name: verified.name,
      email: verified.email,
      avatar_url: verified.avatar_url,
      isCryptographicallyVerified: true,
    };
  } catch {
    return null;
  }
}

/**
 * Authenticates an admin caller by resolving verified GitHub identity
 * and checking membership in public.admins using the service role.
 */
export async function getVerifiedAdminUser(
  req: NextRequest | Request
): Promise<AuthenticatedUser | null> {
  const user = await getVerifiedApiUser(req);
  if (!user) return null;

  try {
    const db = createServerSupabaseClient();
    const { data: adminRow } = await (db.from("admins") as any)
      .select("github")
      .ilike("github", user.github)
      .maybeSingle();

    return adminRow ? user : null;
  } catch {
    return null;
  }
}

/**
 * Authenticates an admin or coordinator caller by resolving verified GitHub identity
 * and checking existence in public.admins.
 */
export async function getVerifiedCoordinatorUser(
  req: NextRequest | Request
): Promise<AuthenticatedUser | null> {
  const user = await getVerifiedApiUser(req);
  if (!user) return null;

  try {
    const db = createServerSupabaseClient();
    const { data: adminRow } = await (db.from("admins") as any)
      .select("github, role")
      .ilike("github", user.github)
      .maybeSingle();

    return adminRow ? user : null;
  } catch {
    return null;
  }
}
