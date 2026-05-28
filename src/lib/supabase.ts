// ════════════════════════════════════════════════════════════
// src/lib/supabase.ts
// ════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Pin the singleton on globalThis so it survives Next.js module
// re-evaluations (fast-refresh, chunk splits).  A plain module-level
// variable resets on every re-evaluation, creating a brand-new client
// that hasn't loaded its token yet → spurious logged-out state.
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
  // Check cache first — avoids a DB round trip on every page load
  const cacheKey = `bb_admin_${github}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached !== null) return cached === '1';
  } catch {}
  try {
    const { data, error } = await getSupabaseClient()
      .from('admins').select('github').eq('github', github).maybeSingle();
    const result = !error && !!data;
    try { localStorage.setItem(cacheKey, result ? '1' : '0'); } catch {}
    return result;
  } catch { return false; }
}