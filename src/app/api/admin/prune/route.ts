// ════════════════════════════════════════════════════════════
// src/app/api/admin/prune/route.ts
// GET/POST /api/admin/prune
//
// Runs weekly (see vercel.json). Does two things in one job so we
// stay within Vercel Hobby's 2-cron limit:
//   1. Deletes old rows from pure-telemetry tables (unchanged from
//      before — practice_attempts / ai_usage / email_log).
//   2. Emails anyone who's gone quiet (no solve in INACTIVITY_DAYS)
//      a "come back" nudge — NOT a deletion warning. Nobody's data
//      is ever removed for being inactive.
//
// Dedup for the nudge uses email_log the same way subscribe-nudge
// does: one nudge per person per month, keyed off email_log so a
// failed send is retried automatically next run instead of lost.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sendEmail, inactivityNudgeEmail } from '@/lib/email';

export const maxDuration = 60;

const RETENTION_DAYS: Record<string, number> = {
  practice_attempts: 60,
  ai_usage: 90,
  email_log: 180,
};

const INACTIVITY_DAYS = 30; // no solve in this window => nudge email

async function getVerifiedAdmin(req: NextRequest): Promise<string | null> {
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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  // TEMP DEBUG — remove after confirming, do not leave in production
  console.log('[debug] token length:', token?.length, 'env length:', process.env.CRON_SECRET?.length, 'match:', token === process.env.CRON_SECRET);
  if (!token || !process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runMaintenance();
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getVerifiedAdmin(req);
    if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return runMaintenance();
  } catch (err: any) {
    console.error('[/api/admin/prune]', err);
    return NextResponse.json({ error: err.message || 'Maintenance failed' }, { status: 500 });
  }
}

async function pruneOldRows() {
  const db = createServerSupabaseClient();
  const deleted: Record<string, number> = {};

  for (const [table, days] of Object.entries(RETENTION_DAYS)) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const dateCol = table === 'practice_attempts' ? 'attempted_at'
      : table === 'ai_usage' ? 'date'
      : 'sent_at';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error, count } = await (db.from(table) as any)
      .delete({ count: 'exact' })
      .lt(dateCol, cutoff);

    deleted[table] = error ? -1 : (count ?? 0);
    if (error) console.error(`[prune] ${table} failed:`, error.message);
  }
  return deleted;
}

async function sendInactivityNudges() {
  const db = createServerSupabaseClient();
  const monthKey = new Date().toISOString().slice(0, 7);
  const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: members }, { data: alreadyLogged }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.from('members') as any).select('github, name, email, last_solved_at, joined_at'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.from('email_log') as any).select('github').eq('kind', 'inactivity_nudge').eq('ref_id', monthKey),
  ]);

  const alreadyGithubs = new Set((alreadyLogged || []).map((r: any) => r.github));

  const targets = (members || []).filter((m: any) => {
    if (!m.email || alreadyGithubs.has(m.github)) return false;
    const lastActive = m.last_solved_at || m.joined_at;
    return lastActive && lastActive < cutoff;
  });

  let sent = 0, failed = 0;
  for (const m of targets) {
    const lastActive = new Date(m.last_solved_at || m.joined_at);
    const daysInactive = Math.floor((Date.now() - lastActive.getTime()) / (24 * 60 * 60 * 1000));
    const { subject, html } = inactivityNudgeEmail(m.name, daysInactive);
    const ok = await sendEmail(m.email, subject, html);
    if (ok) {
      sent++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db.from('email_log') as any)
        .upsert({ github: m.github, email: m.email, kind: 'inactivity_nudge', ref_id: monthKey }, { onConflict: 'github,kind,ref_id' });
    } else {
      failed++;
    }
  }
  return { sent, failed, eligible: targets.length };
}

async function runMaintenance() {
  const deleted = await pruneOldRows();
  const nudges = await sendInactivityNudges();
  return NextResponse.json({ deleted, nudges });
}