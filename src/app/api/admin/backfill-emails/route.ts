// ════════════════════════════════════════════════════════════
// src/app/api/admin/backfill-emails/route.ts
// POST /api/admin/backfill-emails
//
// One-off (safe to re-run) backfill for everyone who logged in
// BEFORE /api/auth/sync existed, or who simply hasn't reloaded the
// site since it shipped. The client-side sync only fires when a
// user's browser hits getSession()/SIGNED_IN — so anyone who isn't
// actively visiting stays null indefinitely.
//
// This route sidesteps that entirely: it reads every user directly
// from Supabase Auth (auth.admin.listUsers, paginated) using the
// service-role key, and writes email + name into `members` (and
// `subscribers`, if a row already exists) by matching on the
// `user_name` GitHub handle from user_metadata. No client involved.
//
// Admin-only, same verified-token pattern as the notify routes.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getVerifiedAdminUser, extractVerifiedGithubIdentity } from '@/lib/serverAuth';

async function getVerifiedAdmin(req: NextRequest): Promise<string | null> {
  const admin = await getVerifiedAdminUser(req);
  return admin ? admin.github : null;
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getVerifiedAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const db = createServerSupabaseClient();

    // Walk every page of auth users and collect { github, email, name }
    // for anyone who has both a GitHub handle and an email on file.
    const rows: { github: string; email: string; name: string }[] = [];
    let page = 1;
    const perPage = 1000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line
      const { data, error } = await (db.auth.admin as any).listUsers({ page, perPage });
      if (error) {
        console.error('[admin/backfill-emails] listUsers error:', error);
        return NextResponse.json({ error: 'Failed to list auth users' }, { status: 500 });
      }
      const users = data?.users || [];
      for (const u of users) {
        const verified = extractVerifiedGithubIdentity(u);
        const email = (u.email || verified?.email || null) as string | null;
        if (verified && email) {
          rows.push({ github: verified.github, email, name: verified.name });
        }
      }
      if (users.length < perPage) break;
      page++;
    }

    if (rows.length === 0) {
      return NextResponse.json({ updated: 0, message: 'No auth users with both a GitHub handle and an email were found' });
    }

    // Update members + subscribers one row at a time. These tables
    // are small (every logged-in user, not every event), so a plain
    // loop is fine — no need for bulk upsert machinery here.
    let membersUpdated = 0;
    let subscribersUpdated = 0;
    for (const r of rows) {
      // eslint-disable-next-line
      const { error: mErr, count } = await (db.from('members') as any)
        .update({ email: r.email, name: r.name })
        .eq('github', r.github)
        .select('github', { count: 'exact' });
      if (mErr) console.error('[admin/backfill-emails] members update error for', r.github, mErr);
      else if (count) membersUpdated += count;

      // eslint-disable-next-line
      const { error: sErr, count: sCount } = await(db.from('subscribers') as any)
        .update({ email: r.email, name: r.name })
        .eq('github', r.github)
        .select('github', { count: 'exact' });
      if (sErr) console.error('[admin/backfill-emails] subscribers update error for', r.github, sErr);
      else if (sCount) subscribersUpdated += sCount;
    }

    return NextResponse.json({
      scanned: rows.length,
      membersUpdated,
      subscribersUpdated,
    });
  } catch (err: any) {
    console.error('[/api/admin/backfill-emails]', err);
    return NextResponse.json({ error: err.message || 'Backfill failed' }, { status: 500 });
  }
}
