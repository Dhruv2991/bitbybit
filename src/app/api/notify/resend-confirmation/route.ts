import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sendEmail, subscriptionConfirmedEmail } from '@/lib/email';
import { getVerifiedAdminUser } from '@/lib/serverAuth';

interface Body {
  github: string;
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getVerifiedAdminUser(req);
    if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });


    const { github }: Body = await req.json();
    if (!github) return NextResponse.json({ error: 'Missing github' }, { status: 400 });

    const db = createServerSupabaseClient();
    // eslint-disable-next-line
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
    // eslint-disable-next-line
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
