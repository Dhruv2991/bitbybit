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

async function getVerifiedUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const github = data.user.user_metadata?.user_name as string | undefined;
  const name   = data.user.user_metadata?.full_name as string | undefined;
  // GitHub OAuth returns the account's email via Supabase's own
  // `user.email` as long as the user has a public/verified email —
  // some users genuinely have none, in which case this stays null
  // and we just skip the write (nothing to sync).
  const email  = (data.user.email || data.user.user_metadata?.email || null) as string | null;
  if (!github) return null;

  return { github, name: name || github, email };
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getVerifiedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const { github, name, email } = authUser;

    if (!email) {
      // Nothing to sync — GitHub account has no public/verified email.
      return NextResponse.json({ success: true, synced: false });
    }

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Ensure a members row exists, then set/refresh email + name.
    // Two steps (rather than one upsert) so an existing member's
    // points/streak/problems_solved are never reset by a login.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertErr } = await (db.from('members') as any).upsert(
      { github, name, total_points: 0, problems_solved: 0, streak: 0 },
      { onConflict: 'github', ignoreDuplicates: true },
    );
    if (upsertErr) {
      console.error('[auth/sync] members upsert error:', upsertErr);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: memberErr } = await (db.from('members') as any)
      .update({ email, name })
      .eq('github', github);
    if (memberErr) {
      console.error('[auth/sync] members email update error:', memberErr);
      return NextResponse.json({ error: 'Failed to sync email' }, { status: 500 });
    }

    // If they already have a subscribers row (e.g. from before this
    // fix shipped), keep its email in sync too. Don't create one —
    // that row is only created at actual payment time.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: subErr } = await (db.from('subscribers') as any)
      .update({ email, name })
      .eq('github', github);
    if (subErr) {
      console.error('[auth/sync] subscribers email update error:', subErr);
    }

    return NextResponse.json({ success: true, synced: true });
  } catch (err: any) {
    console.error('[/api/auth/sync]', err);
    return NextResponse.json({ error: err.message || 'Sync failed' }, { status: 500 });
  }
}
