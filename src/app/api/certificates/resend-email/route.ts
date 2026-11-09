// ════════════════════════════════════════════════════════════
// src/app/api/certificates/resend-email/route.ts
// POST /api/certificates/resend-email
//
// Admin-only route to retry sending notification email for an
// existing issued certificate.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';
import { certificateIssuedEmail, sendEmailDetailed } from '@/lib/email';

import { getVerifiedAdminUser } from '@/lib/serverAuth';

async function getVerifiedAdmin(req: NextRequest): Promise<string | null> {
  const admin = await getVerifiedAdminUser(req);
  return admin ? admin.github : null;
}

export async function POST(req: NextRequest) {
  try {
    const adminGithub = await getVerifiedAdmin(req);
    if (!adminGithub) {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const { certificateId } = await req.json();
    if (!certificateId) {
      return NextResponse.json({ error: 'Missing certificateId' }, { status: 400 });
    }

    const db = createServerSupabaseClient();
    // eslint-disable-next-line
    const { data: cert, error: fetchErr } = await (db.from('certificates') as any)
      .select('*')
      .eq('certificate_id', certificateId)
      .maybeSingle();

    if (fetchErr || !cert) {
      return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const { subject, html } = certificateIssuedEmail(
      cert.recipient_name,
      cert.title,
      cert.event_name,
      cert.certificate_id,
      `${siteUrl}/profile`
    );

    const emailResult = await sendEmailDetailed(cert.recipient_email, subject, html);

    if (emailResult.ok) {
      // eslint-disable-next-line
      await (db.from('certificates') as any)
        .update({ email_status: 'sent', email_error: null })
        .eq('id', cert.id);

      return NextResponse.json({
        success: true,
        message: `Notification email sent successfully to ${cert.recipient_email}`,
      });
    } else {
      const emailError = emailResult.error || 'Brevo send failed';
      // eslint-disable-next-line
      await (db.from('certificates') as any)
        .update({ email_status: 'failed', email_error: emailError })
        .eq('id', cert.id);

      return NextResponse.json({
        success: false,
        error: `Email failed to send: ${emailError}`,
      }, { status: 502 });
    }
  } catch (err: any) {
    console.error('[certificates/resend-email]', err);
    return NextResponse.json({ error: err?.message || 'Failed to resend email' }, { status: 500 });
  }
}
