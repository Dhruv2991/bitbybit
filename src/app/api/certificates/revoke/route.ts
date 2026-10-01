// ════════════════════════════════════════════════════════════
// src/app/api/certificates/revoke/route.ts
// POST /api/certificates/revoke
//
// Admin-only route to revoke an issued certificate.
// Preserves audit trail and never permanently deletes data.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';

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

    // eslint-disable-next-line
    const { data: updated, error: updateErr } = await (db.from('certificates') as any)
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', cert.id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Certificate ${certificateId} has been revoked`,
      certificate: updated,
    });
  } catch (err: any) {
    console.error('[certificates/revoke]', err);
    return NextResponse.json({ error: err?.message || 'Failed to revoke certificate' }, { status: 500 });
  }
}
