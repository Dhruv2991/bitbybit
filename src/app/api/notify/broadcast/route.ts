// ════════════════════════════════════════════════════════════
// src/app/api/notify/broadcast/route.ts
// POST /api/notify/broadcast
//
// Admin-only. Emails every *active* subscriber that a contest just
// went live or a new weekly challenge dropped.
//
// email_log rows are written ONLY after a send actually succeeds —
// so a row existing there is a reliable "this was delivered" signal,
// not just "we tried." Anyone whose send fails is simply left out of
// the log, which means the next click will retry them automatically
// (that's the desired behavior — a failed send should be retriable).
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';
import { isActiveSubscription } from '@/lib/subscription';
import { sendEmailDetailed, contestLiveEmail, weeklyChallengeEmail } from '@/lib/email';

// Sending to dozens of subscribers sequentially can take longer than
// Vercel's 10s default. 60 is the max allowed on the Hobby plan without
// Fluid Compute — comfortably covers ~40-100 recipients with pooling.
export const maxDuration = 60;

interface Body {
  kind:  'contest_live' | 'weekly_challenge';
  refId: string;   // contest id or weekly_challenge id — used for dedupe
  title: string;   // contest name or challenge title, shown in the email
}

async function getVerifiedAdmin(req: NextRequest): Promise<string | null> {
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
  // eslint-disable-next-line
  const { data: admin } = await (db.from('admins') as any).select('github').eq('github', github).maybeSingle();
  return admin ? github : null;
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getVerifiedAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { kind, refId, title }: Body = await req.json();
    if (!kind || !refId || !title) {
      return NextResponse.json({ error: 'Missing kind, refId, or title' }, { status: 400 });
    }
    if (kind !== 'contest_live' && kind !== 'weekly_challenge') {
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
    }

    const db = createServerSupabaseClient();

    const [{ data: subs }, { data: alreadyLogged }] = await Promise.all([
      // eslint-disable-next-line
      (db.from('subscribers') as any).select('github, name, email, status, current_period_end, email_subscribed'),
      // eslint-disable-next-line
      (db.from('email_log') as any).select('github').eq('kind', kind).eq('ref_id', refId),
    ]);

    const alreadyGithubs = new Set((alreadyLogged || []).map((r: any) => r.github));
    const active = (subs || []).filter((s: any) =>
      isActiveSubscription(s.status, s.current_period_end) &&
      s.email &&
      s.email_subscribed !== false &&
      !alreadyGithubs.has(s.github),
    );
    const alreadySent = (subs || []).filter((s: any) => alreadyGithubs.has(s.github)).length;

    if (active.length === 0) {
      return NextResponse.json({
        sent: 0, failed: 0, skipped: alreadySent, total: 0,
        message: alreadySent > 0 ? 'Everyone eligible was already notified' : 'No active subscribed users with an email on file',
      });
    }

    // Send one at a time so we know exactly who succeeded — only
    // those get logged, so a failed send is automatically retried
    // on the next click instead of silently disappearing.
    let sent = 0, failed = 0, optOutSkipped = 0;
    let lastError: string | undefined;
    for (const s of active) {
      const { subject, html } = kind === 'contest_live'
        ? contestLiveEmail(s.name, title, s.email)
        : weeklyChallengeEmail(s.name, title, s.email);
      const result = await sendEmailDetailed(s.email, subject, html, { isPromotional: true });
      if (result.ok) {
        sent++;
        // eslint-disable-next-line
        await (db.from('email_log') as any)
          .upsert({ github: s.github, email: s.email, kind, ref_id: refId }, { onConflict: 'github,kind,ref_id' });
      } else if (result.skipped) {
        optOutSkipped++;
      } else {
        failed++;
        lastError = result.error;
      }
    }

    return NextResponse.json({ sent, failed, skipped: alreadySent + optOutSkipped, total: active.length, lastError });
  } catch (err: any) {
    console.error('[/api/notify/broadcast]', err);
    return NextResponse.json({ error: err.message || 'Broadcast failed' }, { status: 500 });
  }
}
