// ════════════════════════════════════════════════════════════
// src/app/api/notify/resend-confirmation/route.ts
// POST /api/notify/resend-confirmation
//
// Admin-only. Manually (re)sends the "You're subscribed ✓" email to
// one specific subscriber — for people who confirmed before the
// email system existed, or whose original send failed for any
// reason. Unlike the automatic sends, this always sends when
// clicked (it's an explicit admin action), and just updates the
// email_log record to reflect the latest send.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sendEmail, subscriptionConfirmedEmail } from '@/lib/email';

interface Body {
  github: string;
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

    const { github }: Body = await req.json();
    if (!github) return NextResponse.json({ error: 'Missing github' }, { status: 400 });

    const db = createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sub } = await (db.from('subscribers') as any)
      .select('github, name, email, status, current_period_end, razorpay_payment_id')
      .eq('github', github)
      .maybeSingle();

    if (!sub) return NextResponse.json({ error: 'Subscriber not found' }, { status: 404 });
    if (!sub.email) return NextResponse.json({ error: 'No email on file for this subscriber — they need to log in again first' }, { status: 400 });
    if (!sub.current_period_end) return NextResponse.json({ error: 'No active period end set for this subscriber' }, { status: 400 });

    const { subject, html } = subscriptionConfirmedEmail(sub.name, sub.current_period_end);
    const ok = await sendEmail(sub.email, subject, html);
    if (!ok) return NextResponse.json({ error: 'Send failed — check server logs for the SMTP error' }, { status: 500 });

    // Record/refresh the log entry so future automatic sends for this
    // exact payment_id (if any) know a confirmation already went out.
    const refId = sub.razorpay_payment_id || `manual-${sub.github}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('email_log') as any)
      .upsert(
        { github: sub.github, email: sub.email, kind: 'subscription_confirmed', ref_id: refId },
        { onConflict: 'github,kind,ref_id' },
      );

    return NextResponse.json({ success: true, sentTo: sub.email });
  } catch (err: any) {
    console.error('[/api/notify/resend-confirmation]', err);
    return NextResponse.json({ error: err.message || 'Resend failed' }, { status: 500 });
  }
}
