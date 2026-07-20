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
// Protect this route the same way as broadcast: either call it from
// the admin panel with a Bearer token, or lock it down with a cron
// secret if you wire it to Vercel Cron (see CRON_SECRET check below).
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';
import { isActiveSubscription } from '@/lib/subscription';
import { sendBatch, subscribeNudgeEmail, type BatchRecipient } from '@/lib/email';

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

export async function POST(req: NextRequest) {
  try {
    const caller = await getVerifiedAdmin(req);
    if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const db = createServerSupabaseClient();
    const monthKey = new Date().toISOString().slice(0, 7); // e.g. '2026-08'

    const [{ data: members }, { data: subs }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.from('members') as any).select('github, name, email'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.from('subscribers') as any).select('github, status, current_period_end'),
    ]);

    const activeGithubs = new Set(
      (subs || []).filter((s: any) => isActiveSubscription(s.status, s.current_period_end)).map((s: any) => s.github),
    );
    const targets = (members || []).filter((m: any) => m.email && !activeGithubs.has(m.github));
    if (targets.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 0, message: 'Nobody to nudge' });
    }

    const logRows = targets.map((m: any) => ({ github: m.github, email: m.email, kind: 'subscribe_nudge', ref_id: monthKey }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted } = await (db.from('email_log') as any)
      .upsert(logRows, { onConflict: 'github,kind,ref_id', ignoreDuplicates: true })
      .select('github');

    const alreadySent = targets.length - (inserted?.length || 0);
    const toEmail = targets.filter((m: any) => (inserted || []).some((i: any) => i.github === m.github));

    const recipients: BatchRecipient[] = toEmail.map((m: any) => {
      const { subject, html } = subscribeNudgeEmail(m.name);
      return { to: m.email, subject, html };
    });

    const { sent, failed } = await sendBatch(recipients);
    return NextResponse.json({ sent, failed, skipped: alreadySent });
  } catch (err: any) {
    console.error('[/api/notify/subscribe-nudge]', err);
    return NextResponse.json({ error: err.message || 'Nudge failed' }, { status: 500 });
  }
}
