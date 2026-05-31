// ════════════════════════════════════════════════════════════
// src/lib/supabase.ts
// ════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const G = globalThis as typeof globalThis & {
  __bbClient?: ReturnType<typeof createClient<Database>>;
};

export function getSupabaseClient() {
  if (!G.__bbClient) {
    G.__bbClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession:     true,
        autoRefreshToken:   true,
        detectSessionInUrl: true,
        storageKey:         'bitbybit-auth',
        flowType:           'implicit',
      },
    });
  }
  return G.__bbClient;
}

export function createServerSupabaseClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON);
}

export async function resolveAdminStatus(github: string): Promise<boolean> {
  if (!github) return false;
  const cacheKey = `bb_admin_${github}`;
  const tsKey    = `bb_admin_ts_${github}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    const ts     = parseInt(localStorage.getItem(tsKey) || '0', 10);
    const age    = Date.now() - ts;
    // FIX: re-check DB every hour — previously cached forever, so removing
    // an admin from the DB had no effect until they manually signed out.
    if (cached !== null && age < 60 * 60 * 1000) return cached === '1';
  } catch {}
  try {
    const { data, error } = await getSupabaseClient()
      .from('admins').select('github').eq('github', github).maybeSingle();
    const result = !error && !!data;
    try {
      localStorage.setItem(cacheKey, result ? '1' : '0');
      localStorage.setItem(tsKey, String(Date.now()));
    } catch {}
    return result;
  } catch { return false; }
}