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
  // Uses the service role key — this client is only ever used from
  // server-side API routes (never exposed to the browser), and needs
  // to bypass RLS to write confirmed payment/subscription status.
  // Using the anon key here would either silently fail on RLS-protected
  // writes, or — worse — imply those tables allow anon writes, which
  // would let anyone set their own subscription to "confirmed" directly
  // from the browser without paying at all.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — required for server-side writes.');
  }
  return createClient<Database>(SUPABASE_URL, serviceKey);
}

export type AdminRole = 'super_admin' | 'tech' | 'coordinator';

export interface AdminRoleResult {
  isAdmin: boolean;        // true for super_admin and tech
  isCoordinator: boolean;  // true for super_admin and coordinator
  role: AdminRole | null;
}

export async function resolveAdminRole(github: string): Promise<AdminRoleResult> {
  const fallback: AdminRoleResult = { isAdmin: false, isCoordinator: false, role: null };
  if (!github) return fallback;

  const roleKey  = "bb_role_" + github;
  const adminKey = "bb_admin_" + github;
  const coordKey = "bb_coord_" + github;
  const tsKey    = "bb_admin_ts_" + github;

  try {
    const cachedRole = localStorage.getItem(roleKey);
    const ts         = parseInt(localStorage.getItem(tsKey) || '0', 10);
    const age        = Date.now() - ts;
    if (cachedRole !== null && age < 60 * 60 * 1000) {
      if (cachedRole === 'none') return fallback;
      const r = cachedRole as AdminRole;
      return {
        isAdmin: r === 'super_admin' || r === 'tech',
        isCoordinator: r === 'super_admin' || r === 'coordinator',
        role: r,
      };
    }
  } catch {}

  try {
    let roleVal: AdminRole | null = null;
    const { data, error } = await (getSupabaseClient().from('admins') as any)
      .select('github, role')
      .eq('github', github)
      .maybeSingle();

    if (error) {
      // Gracefully fall back if 'role' column does not exist yet in DB
      const { data: legacyData, error: legacyErr } = await (getSupabaseClient().from('admins') as any)
        .select('github')
        .eq('github', github)
        .maybeSingle();
      if (!legacyErr && legacyData) {
        roleVal = 'super_admin';
      }
    } else if (data) {
      roleVal = (data.role as AdminRole) || 'super_admin';
    }

    const res: AdminRoleResult = {
      isAdmin: roleVal === 'super_admin' || roleVal === 'tech',
      isCoordinator: roleVal === 'super_admin' || roleVal === 'coordinator',
      role: roleVal,
    };

    try {
      localStorage.setItem(adminKey, res.isAdmin ? '1' : '0');
      localStorage.setItem(coordKey, res.isCoordinator ? '1' : '0');
      localStorage.setItem(roleKey, roleVal || 'none');
      localStorage.setItem(tsKey, String(Date.now()));
    } catch {}

    return res;
  } catch {
    return fallback;
  }
}

export async function resolveAdminStatus(github: string): Promise<boolean> {
  const res = await resolveAdminRole(github);
  return res.isAdmin;
}
