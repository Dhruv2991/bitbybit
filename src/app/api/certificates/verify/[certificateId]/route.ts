// ════════════════════════════════════════════════════════════
// src/app/api/certificates/verify/[certificateId]/route.ts
// GET /api/certificates/verify/:certificateId
//
// Public verification endpoint. Returns non-sensitive verification
// information for a certificate.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: { certificateId: string } }
) {
  try {
    const certificateId = params.certificateId;
    if (!certificateId) {
      return NextResponse.json({ error: 'Certificate ID is required' }, { status: 400 });
    }

    const db = createServerSupabaseClient();
    // eslint-disable-next-line
    const { data: cert, error } = await (db.from('certificates') as any)
      .select('certificate_id, recipient_name, certificate_type, title, event_name, achievement_text, organization_text, activity_points_text, coordinator_names, issued_at, status')
      .eq('certificate_id', certificateId)
      .maybeSingle();

    if (error || !cert) {
      return NextResponse.json({ verified: false, error: 'Certificate not found' }, { status: 404 });
    }

    return NextResponse.json({
      verified: cert.status !== 'revoked',
      certificate: {
        certificate_id: cert.certificate_id,
        recipient_name: cert.recipient_name,
        certificate_type: cert.certificate_type,
        title: cert.title,
        event_name: cert.event_name,
        achievement_text: cert.achievement_text,
        organization_text: cert.organization_text,
        activity_points_text: cert.activity_points_text,
        coordinator_names: cert.coordinator_names,
        issued_at: cert.issued_at,
        status: cert.status,
      },
    });
  } catch (err: any) {
    console.error('[certificates/verify]', err);
    return NextResponse.json({ error: err?.message || 'Verification error' }, { status: 500 });
  }
}
