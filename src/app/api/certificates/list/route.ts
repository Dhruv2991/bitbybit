// ════════════════════════════════════════════════════════════
// src/app/api/certificates/list/route.ts
// GET /api/certificates/list
//
// Returns certificates list:
// - If Admin: returns all certificates with optional filtering.
// - If regular authenticated Member: returns ONLY certificates owned by the user.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
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
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }
    const currentGithub = authData.user.user_metadata?.user_name as string | undefined;
    if (!currentGithub) {
      return NextResponse.json({ error: 'User identity could not be verified' }, { status: 401 });
    }

    const db = createServerSupabaseClient();

    // Check if user is admin
    // eslint-disable-next-line
    const { data: adminRow } = await (db.from('admins') as any)
      .select('github')
      .eq('github', currentGithub)
      .maybeSingle();
    const isAdmin = !!adminRow;

    // Build query
    let query = (db.from('certificates') as any).select('*').order('created_at', { ascending: false });

    if (!isAdmin) {
      // Members only see their own issued certificates
      query = query.eq('github', currentGithub);
    }

    const { data: certificates, error: queryError } = await query;

    if (queryError) {
      console.error('[certificates/list] Query error:', queryError);
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      certificates: certificates || [],
      isAdmin,
    });
  } catch (err: any) {
    console.error('[certificates/list]', err);
    return NextResponse.json({ error: err?.message || 'Failed to list certificates' }, { status: 500 });
  }
}
