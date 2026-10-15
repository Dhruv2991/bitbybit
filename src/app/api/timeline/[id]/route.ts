// ════════════════════════════════════════════════════════════
// src/app/api/timeline/[id]/route.ts
// GET /api/timeline/:id
//
// Fetches a saved problem timeline by ID for public replay playback.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, createServerSupabaseClient } from '@/lib/supabase';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ error: 'Timeline ID is required' }, { status: 400 });
    }

    let db;
    try {
      db = createServerSupabaseClient();
    } catch {
      db = getSupabaseClient();
    }

    const { data: timeline, error } = await (db.from('problem_timelines') as any)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !timeline) {
      return NextResponse.json({ error: 'Timeline replay not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      timeline,
    });
  } catch (err: any) {
    console.error('[API /api/timeline/[id]] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
