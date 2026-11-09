// ════════════════════════════════════════════════════════════
// src/app/api/auth/sync/route.ts
// POST /api/auth/sync
//
// Writes the signed-in user's email (from Supabase Auth — GitHub
// OAuth) into `members`, and into `subscribers` if a row for them
// already exists there.
//
// Why this exists instead of the old client-side update:
//   The client used to run `db.from("members").update({ email })`
//   directly with the anon key. If there's no RLS policy that lets
//   a logged-in user update their own `members` row (or the policy
//   doesn't cover the `email` column), Supabase returns an error —
//   but the old code did `.then(() => {})` with no error handling,
//   so the write failed *silently* and email stayed null forever.
//
//   This route uses the same verified-token pattern as
//   /api/razorpay/verify and /api/contest/register: it takes the
//   caller's Supabase access token, re-verifies it server-side, and
//   then writes with the SERVICE ROLE key, which bypasses RLS
//   entirely. That removes the RLS footgun and gives us a real
//   error we can log if the write ever fails.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { getVerifiedApiUser } from '@/lib/serverAuth';

async function getVerifiedUser(req: NextRequest) {
  const user = await getVerifiedApiUser(req);
  if (!user) return null;
  return { github: user.github, name: user.name, email: user.email || null };
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getVerifiedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const { github, name, email } = authUser;

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 1. Check if member row already exists
    const { data: existingMember } = await (db.from('members') as any)
      .select('github')
      .eq('github', github)
      .maybeSingle();

    if (!existingMember) {
      // Insert new member row with initial default stats
      const { error: insertErr } = await (db.from('members') as any).insert({
        github,
        name,
        email,
        total_points: 0,
        problems_solved: 0,
        streak: 0,
      });
      if (insertErr) {
        console.error('[auth/sync] members insert error:', insertErr);
      }
    } else {
      // For existing members, update display fields only (name, email)
      // NEVER reset total_points, problems_solved, streak, or last_solved_at
      const updateData: Record<string, any> = { name };
      if (email) updateData.email = email;
      const { error: memberErr } = await (db.from('members') as any)
        .update(updateData)
        .eq('github', github);
      if (memberErr) {
        console.error('[auth/sync] members update error:', memberErr);
      }
    }

    // 2. If they already have a subscribers row, sync name + email there too
    if (email) {
      const { error: subErr } = await (db.from('subscribers') as any)
        .update({ email, name })
        .eq('github', github);
      if (subErr) {
        console.error('[auth/sync] subscribers email update error:', subErr);
      }
    }

    return NextResponse.json({ success: true, synced: true });
  } catch (err: any) {
    console.error('[/api/auth/sync]', err);
    return NextResponse.json({ error: err.message || 'Sync failed' }, { status: 500 });
  }
}
