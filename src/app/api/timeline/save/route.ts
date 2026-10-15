// ════════════════════════════════════════════════════════════
// src/app/api/timeline/save/route.ts
// POST /api/timeline/save
//
// Saves problem timeline snapshots to problem_timelines table.
// Resolves user_id from members table when available.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      problem_id,
      problem_title,
      user_github,
      user_name,
      snapshots,
      duration_seconds,
    } = body;

    if (!problem_id) {
      return NextResponse.json({ error: 'problem_id is required' }, { status: 400 });
    }

    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      return NextResponse.json({ error: 'Snapshots array must not be empty' }, { status: 400 });
    }

    const db = createServerSupabaseClient();

    let userId: string | null = null;
    if (user_github) {
      const { data: member } = await (db.from('members') as any)
        .select('id')
        .eq('github', user_github)
        .maybeSingle();

      if (member?.id) {
        userId = member.id;
      }
    }

    const { data: inserted, error } = await (db.from('problem_timelines') as any)
      .insert([
        {
          user_id: userId,
          problem_id: String(problem_id),
          problem_title: problem_title || null,
          user_github: user_github || null,
          user_name: user_name || null,
          snapshots,
          duration_seconds: typeof duration_seconds === 'number' ? duration_seconds : 0,
        },
      ])
      .select('id, created_at')
      .single();

    if (error) {
      console.error('[API /api/timeline/save] DB Insert Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      id: inserted.id,
      created_at: inserted.created_at,
    });
  } catch (err: any) {
    console.error('[API /api/timeline/save] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
