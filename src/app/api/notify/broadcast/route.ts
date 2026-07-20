// ════════════════════════════════════════════════════════════
// src/app/api/notify/broadcast/route.ts
// POST /api/notify/broadcast
//
// Admin-only. Emails every *active* subscriber that a contest just
// went live or a new weekly challenge dropped. Dedupes against
// email_log so re-triggering (double click, retry) never sends the
// same alert twice to the same person.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';
import { isActiveSubscription } from '@/lib/subscription';
import { sendBatch, contestLiveEmail, weeklyChallengeEmail, type BatchRecipient } from '@/lib/email';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: subs } = await (db.from('subscribers') as any)
      .select('github, name, email, status, current_period_end');

    const active = (subs || []).filter((s: any) =>
      isActiveSubscription(s.status, s.current_period_end) && s.email,
    );
    if (active.length === 0) {
      return NextResponse.json({ sent: 0, skipped: 0, message: 'No active subscribers with an email on file' });
    }

    // Reserve dedupe rows first — insert with onConflict/ignore, then
    // only email the rows that were newly inserted (i.e. not already sent).
    const logRows = active.map((s: any) => ({ github: s.github, email: s.email, kind, ref_id: refId }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted } = await (db.from('email_log') as any)
      .upsert(logRows, { onConflict: 'github,kind,ref_id', ignoreDuplicates: true })
      .select('github');

    const alreadySent = active.length - (inserted?.length || 0);
    const toEmail = active.filter((s: any) => (inserted || []).some((i: any) => i.github === s.github));

    const recipients: BatchRecipient[] = toEmail.map((s: any) => {
      const { subject, html } = kind === 'contest_live'
        ? contestLiveEmail(s.name, title)
        : weeklyChallengeEmail(s.name, title);
      return { to: s.email, subject, html };
    });

    const { sent, failed } = await sendBatch(recipients);
    return NextResponse.json({ sent, failed, skipped: alreadySent });
  } catch (err: any) {
    console.error('[/api/notify/broadcast]', err);
    return NextResponse.json({ error: err.message || 'Broadcast failed' }, { status: 500 });
  }
}
