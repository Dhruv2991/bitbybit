// ════════════════════════════════════════════════════════════
// src/app/api/certificates/download/route.ts
// POST /api/certificates/download
//
// Secure download route:
// 1. Verifies caller's JWT authentication.
// 2. Checks if caller is the certificate owner (github matches) OR is an Admin.
// 3. Generates a short-lived (60s) signed URL for the private PDF in Storage.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }
    const currentGithub = authData.user.user_metadata?.user_name as string | undefined;
    if (!currentGithub) {
      return NextResponse.json({ error: 'User identity could not be verified' }, { status: 401 });
    }

    const { certificateId } = await req.json();
    if (!certificateId) {
      return NextResponse.json({ error: 'Missing certificateId' }, { status: 400 });
    }

    const db = createServerSupabaseClient();

    // Fetch certificate record
    // eslint-disable-next-line
    const { data: cert, error: certErr } = await (db.from('certificates') as any)
      .select('*')
      .eq('certificate_id', certificateId)
      .maybeSingle();

    if (certErr || !cert) {
      return NextResponse.json({ error: 'Certificate not found' }, { status: 404 });
    }

    // Check if user is admin
    // eslint-disable-next-line
    const { data: adminRow } = await (db.from('admins') as any)
      .select('github')
      .eq('github', currentGithub)
      .maybeSingle();
    const isAdmin = !!adminRow;

    // Authorization: User must be either the owner or an admin
    if (!isAdmin && cert.github !== currentGithub) {
      return NextResponse.json(
        { error: 'Access denied: You are not authorized to download this certificate' },
        { status: 403 }
      );
    }

    // Generate short-lived signed URL (valid for 60 seconds)
    const { data: signedData, error: signedError } = await db.storage
      .from('certificates')
      .createSignedUrl(cert.pdf_path, 60, {
        download: `${cert.certificate_id}.pdf`,
      });

    if (signedError || !signedData?.signedUrl) {
      console.error('[certificates/download] Signed URL generation failed:', signedError);
      return NextResponse.json(
        { error: 'Could not generate secure download link' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      downloadUrl: signedData.signedUrl,
      fileName: `${cert.certificate_id}.pdf`,
      status: cert.status,
    });
  } catch (err: any) {
    console.error('[certificates/download]', err);
    return NextResponse.json(
      { error: err?.message || 'Download error' },
      { status: 500 }
    );
  }
}
