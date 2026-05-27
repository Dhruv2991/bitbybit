// ════════════════════════════════════════════════════════════
// src/lib/supabase.ts — Supabase client instances
// ════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ── Browser client (singleton) ──────────────────────────────
let _client: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseClient() {
  if (!_client) {
    _client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        // Persist session in localStorage (default), but auto-detect
        // broken/expired sessions and clear them instead of hanging.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // If the stored session is invalid/unrefreshable, sign the user
        // out cleanly so onAuthStateChange fires with null (not silence).
        storageKey: 'bitbybit-auth',
      },
    });

    // ── Guard: nuke any corrupted stored session on startup ──
    // If getSession() throws or returns an error, the stored token is
    // broken (expired refresh token, revoked, etc). Clear it so the
    // user lands on a clean logged-out state rather than infinite load.
    if (typeof window !== 'undefined') {
      _client.auth.getSession().then(({ error }) => {
        if (error) {
          console.warn('[supabase] Stored session invalid, clearing:', error.message);
          _client!.auth.signOut();
        }
      });
    }
  }
  return _client;
}

// ── Server-side client (fresh per request) ──────────────────
export function createServerSupabaseClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON);
}

// ── Admin status check (DB-authoritative, never localStorage) ──
export async function resolveAdminStatus(github: string): Promise<boolean> {
  if (!github) return false;
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('admins')
      .select('github')
      .eq('github', github)
      .maybeSingle();
    return !error && !!data;
  } catch {
    return false;
  }
}