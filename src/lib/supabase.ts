// ════════════════════════════════════════════════════════════
// src/lib/supabase.ts — Supabase client instances
// ════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ── Browser client ───────────────────────────────────────────
// We pin the singleton on `globalThis` so it survives Next.js
// hot-reloads and chunk re-evaluations.  A plain module-level
// `let _client` gets reset to null every time the module is
// re-initialised (fast-refresh, chunk split, etc.), which
// creates a brand-new Supabase instance that hasn't read its
// token from localStorage yet — causing a spurious logged-out
// state on refresh.
const G = globalThis as typeof globalThis & {
  __bbSupabaseClient?: ReturnType<typeof createClient<Database>>;
};

export function getSupabaseClient() {
  if (!G.__bbSupabaseClient) {
    G.__bbSupabaseClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession:    true,
        autoRefreshToken:  true,
        detectSessionInUrl: true,
        storageKey:        'bitbybit-auth',
        flowType:          'implicit',
      },
    });
  }
  return G.__bbSupabaseClient;
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