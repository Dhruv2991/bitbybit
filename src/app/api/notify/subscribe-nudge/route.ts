// ════════════════════════════════════════════════════════════
// src/app/api/notify/subscribe-nudge/route.ts
// POST /api/notify/subscribe-nudge
//
// Emails everyone who has logged in (so we have their email in
// `members`) but does NOT currently have an active subscription,
// nudging them to subscribe. Dedup key is the current year-month,
// so this is safe to trigger at most once per person per month no
// matter how often the job runs.
//
// Like broadcast/route.ts, email_log rows are only written after a
// send actually succeeds — so a logged row reliably means delivered,
// and a failed send gets retried automatically on the next run
// instead of vanishing.
//
// Protect this route the same way as broadcast: either call it from
// the admin panel with a Bearer token, or lock it down with a cron
// secret if you wire it to Vercel Cron (see CRON_SECRET check below).
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';
import { isActiveSubscription } from '@/lib/subscription';
import { sendEmail, subscribeNudgeEmail } from '@/lib/email';

// Sending to dozens of subscribers sequentially can take longer than
// Vercel's 10s default. 60 is the max allowed on the Hobby plan without
// Fluid Compute — comfortably covers ~40-100 recipients with pooling.
export const maxDuration = 60;

async function getVerifiedAdmin(req: NextRequest): Promise<string | null> {
  // Allow a scheduled job (e.g. Vercel Cron) to call this with a
  // shared secret instead of a user session.
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET) {
    return 'cron';
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return null;
  const github = data.user.user_metadata?.user_name as string | undefined;
  if (!github) return null;

  const db = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: admin } = await (db.from('admins') as any).select('github').eq('github', github).maybeSingle();
  return admin ? github : null;
}

// Vercel Cron always sends GET requests, and automatically attaches
// `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set in
// your project's env vars — no extra config needed beyond the
// vercel.json schedule entry. This lets the monthly nudge run fully
// unattended instead of needing an admin to click a button.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || !process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runNudge();
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getVerifiedAdmin(req);
    if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return runNudge();
  } catch (err: any) {
    console.error('[/api/notify/subscribe-nudge]', err);
    return NextResponse.json({ error: err.message || 'Nudge failed' }, { status: 500 });
  }
}

async function runNudge() {
  try {
    const db = createServerSupabaseClient();
    const monthKey = new Date().toISOString().slice(0, 7); // e.g. '2026-08'

    const [{ data: members }, { data: subs }, { data: alreadyLogged }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.from('members') as any).select('github, name, email'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.from('subscribers') as any).select('github, status, current_period_end'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.from('email_log') as any).select('github').eq('kind', 'subscribe_nudge').eq('ref_id', monthKey),
    ]);

    const activeGithubs = new Set(
      (subs || []).filter((s: any) => isActiveSubscription(s.status, s.current_period_end)).map((s: any) => s.github),
    );
    const alreadyGithubs = new Set((alreadyLogged || []).map((r: any) => r.github));

    const targets = (members || []).filter((m: any) => m.email && !activeGithubs.has(m.github) && !alreadyGithubs.has(m.github));
    const alreadySent = (members || []).filter((m: any) => alreadyGithubs.has(m.github)).length;

    if (targets.length === 0) {
      return NextResponse.json({
        sent: 0, failed: 0, skipped: alreadySent,
        message: alreadySent > 0 ? 'Everyone eligible was already nudged this month' : 'Nobody to nudge',
      });
    }

    let sent = 0, failed = 0;
    for (const m of targets) {
      const { subject, html } = subscribeNudgeEmail(m.name);
      const ok = await sendEmail(m.email, subject, html);
      if (ok) {
        sent++;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db.from('email_log') as any)
          .upsert({ github: m.github, email: m.email, kind: 'subscribe_nudge', ref_id: monthKey }, { onConflict: 'github,kind,ref_id' });
      } else {
        failed++;
      }
    }

    return NextResponse.json({ sent, failed, skipped: alreadySent });
  } catch (err: any) {
    console.error('[/api/notify/subscribe-nudge]', err);
    return NextResponse.json({ error: err.message || 'Nudge failed' }, { status: 500 });
  }
}
