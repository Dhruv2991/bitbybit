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
    _client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON);
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
