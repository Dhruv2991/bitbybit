// ════════════════════════════════════════════════════════════
// src/app/api/certificates/issue/route.ts
// POST /api/certificates/issue
//
// Admin-only endpoint to issue a certificate to a member.
// 1. Verifies caller is an authenticated admin.
// 2. Generates unique Certificate ID.
// 3. Generates PDF matching reference design.
// 4. Stores PDF in private Supabase Storage bucket 'certificates'.
// 5. Creates DB record in 'certificates' table.
// 6. Sends Brevo notification email.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';
import { generateCertificateId } from '@/lib/certificates/idGenerator';
import { generateCertificatePdf } from '@/lib/certificates/pdfGenerator';
import { certificateIssuedEmail, sendEmailDetailed } from '@/lib/email';
import type { CertificateCoordinator } from '@/types/database';

export const maxDuration = 45;

interface IssueRequestBody {
  memberId?: string | null;
  github: string;
  recipientName: string;
  recipientEmail: string;
  certificateType: string;
  title: string;
  achievementText: string;
  eventName: string;
  organizationText?: string;
  activityPointsText?: string | null;
  coordinators?: CertificateCoordinator[];
  dateStr?: string;
}

async function getVerifiedAdmin(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
    const adminGithub = await getVerifiedAdmin(req);
    if (!adminGithub) {
      return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
    }

    const body: IssueRequestBody = await req.json();
    const {
      memberId,
      github,
      recipientName,
      recipientEmail,
      certificateType = 'Certificate of Achievement',
      title = 'CERTIFICATE OF ACHIEVEMENT',
      achievementText,
      eventName,
      organizationText = 'from teamcodelocked club',
      activityPointsText = 'This certificate is eligible for claiming 1-2 activity points.',
      coordinators = [],
      dateStr = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    } = body;

    // Strict validation
    if (!github || !recipientName?.trim() || !recipientEmail?.trim() || !achievementText?.trim() || !eventName?.trim()) {
      return NextResponse.json(
        { error: 'Missing required certificate fields (github, recipientName, recipientEmail, achievementText, eventName)' },
        { status: 400 }
      );
    }

    const db = createServerSupabaseClient();
    const year = new Date().getFullYear();
    const certificateId = generateCertificateId(year);
    const pdfPath = `${year}/${certificateId}.pdf`;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const verificationUrl = `${siteUrl}/certificate/${certificateId}`;

    // 1. Generate PDF
    const pdfBuffer = await generateCertificatePdf({
      certificateId,
      memberId,
      github,
      recipientName: recipientName.trim(),
      recipientEmail: recipientEmail.trim(),
      certificateType,
      title: title.trim(),
      achievementText: achievementText.trim(),
      eventName: eventName.trim(),
      organizationText: organizationText.trim(),
      activityPointsText: activityPointsText?.trim() || null,
      coordinators,
      dateStr,
      verificationUrl,
    });

    // 2. Upload PDF to private Supabase Storage bucket 'certificates'
    const { error: storageError } = await db.storage
      .from('certificates')
      .upload(pdfPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (storageError) {
      console.error('[certificates/issue] Storage upload failed:', storageError);
      return NextResponse.json(
        { error: `Storage upload failed: ${storageError.message}` },
        { status: 500 }
      );
    }

    // 3. Insert record into database
    const certificateRecord = {
      certificate_id: certificateId,
      member_id: memberId || null,
      github,
      recipient_name: recipientName.trim(),
      recipient_email: recipientEmail.trim(),
      certificate_type: certificateType,
      title: title.trim(),
      achievement_text: achievementText.trim(),
      event_name: eventName.trim(),
      organization_text: organizationText.trim(),
      activity_points_text: activityPointsText?.trim() || null,
      coordinator_names: coordinators,
      issued_at: new Date().toISOString(),
      issued_by: adminGithub,
      pdf_path: pdfPath,
      status: 'issued',
      email_status: 'pending',
      email_error: null,
    };

    // eslint-disable-next-line
    const { data: inserted, error: dbError } = await (db.from('certificates') as any)
      .insert([certificateRecord])
      .select()
      .single();

    if (dbError) {
      console.error('[certificates/issue] Database insert failed:', dbError);
      // Clean up storage file if DB insert fails
      await db.storage.from('certificates').remove([pdfPath]).catch(() => {});
      return NextResponse.json(
        { error: `Database record creation failed: ${dbError.message}` },
        { status: 500 }
      );
    }

    // 4. Send Brevo Email
    const { subject, html } = certificateIssuedEmail(
      recipientName,
      title,
      eventName,
      certificateId,
      `${siteUrl}/profile`
    );

    let emailSent = false;
    let emailError: string | null = null;

    try {
      const emailResult = await sendEmailDetailed(recipientEmail.trim(), subject, html);
      if (emailResult.ok) {
        emailSent = true;
        // eslint-disable-next-line
        await (db.from('certificates') as any)
          .update({ email_status: 'sent', email_error: null })
          .eq('id', inserted.id);
      } else {
        emailError = emailResult.error || 'Brevo email delivery failed';
        // eslint-disable-next-line
        await (db.from('certificates') as any)
          .update({ email_status: 'failed', email_error: emailError })
          .eq('id', inserted.id);
      }
    } catch (err: any) {
      emailError = err?.message || 'Email delivery exception';
      // eslint-disable-next-line
      await (db.from('certificates') as any)
        .update({ email_status: 'failed', email_error: emailError })
        .eq('id', inserted.id);
    }

    return NextResponse.json({
      success: true,
      certificate: { ...inserted, email_status: emailSent ? 'sent' : 'failed', email_error: emailError },
      emailSent,
      emailError,
      message: emailSent
        ? 'Certificate issued and email delivered successfully'
        : 'Certificate issued successfully, but notification email could not be sent (can be retried)',
    });
  } catch (err: any) {
    console.error('[certificates/issue] Server error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error while issuing certificate' },
      { status: 500 }
    );
  }
}
