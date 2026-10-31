// ════════════════════════════════════════════════════════════
// src/app/api/arena/submit/route.ts
// POST /api/arena/submit
//
// Authenticated Contest / Arena Submission Handler:
// - Extracts user identity exclusively from verified JWT (auth.identities).
// - Enforces that contest active window is open (now BETWEEN starts_at AND ends_at).
// - Reads authoritative problem points from the database.
// - Calculates time penalty and strike penalty server-side.
// - Service role upserts into arena_submissions ensuring users can only write their own row.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

async function getVerifiedUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const githubIdentity = data.user.identities?.find((id: any) => id.provider === 'github');
  const github = githubIdentity?.identity_data?.user_name as string | undefined;
  if (!github) return null;

  const name = (githubIdentity?.identity_data?.full_name || githubIdentity?.identity_data?.name || github) as string;
  return { github, name };
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getVerifiedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    const body = await req.json();
    const {
      contest_id,
      problem_id,
      lang = 'unknown',
      code = '',
      strikes = 0,
      action = 'submit',
      tests_passed = 0,
      tests_total = 0,
    } = body;

    if (!contest_id) {
      return NextResponse.json({ error: 'Missing contest_id' }, { status: 400 });
    }

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 1. Verify contest existence and active timing window
    const { data: contest, error: contestErr } = await (db.from('contests') as any)
      .select('id, name, starts_at, ends_at, duration_mins')
      .eq('id', contest_id)
      .maybeSingle();

    if (contestErr || !contest) {
      return NextResponse.json({ error: 'Contest not found' }, { status: 404 });
    }

    const now = Date.now();
    const startMs = new Date(contest.starts_at).getTime();
    const endMs = new Date(contest.ends_at).getTime();
    // Allow 60-second grace window for in-flight requests near deadline
    if (now < startMs || now > endMs + 60000) {
      return NextResponse.json({ error: 'Contest is not currently active' }, { status: 403 });
    }

    // 2. Load problem points from DB if problem_id is provided
    let problemTitle = '';
    let basePts = 200;

    if (problem_id) {
      const { data: prob } = await (db.from('problems') as any)
        .select('id, title, points')
        .eq('id', problem_id)
        .maybeSingle();

      if (prob) {
        problemTitle = prob.title || '';
        basePts = prob.points || 200;
      }
    }

    // 3. Compute penalties and final points
    const contestDurationSec = (contest.duration_mins || 60) * 60;
    const elapsedSec = Math.max(0, (now - startMs) / 1000);
    const timeFactor = Math.max(0.5, 1 - (elapsedSec / contestDurationSec) * 0.5);
    const strikePenalty = Math.max(0.7, 1 - strikes * 0.1);
    const strikePenaltyFactor = action === 'disqualify' ? 0 : timeFactor * strikePenalty;

    let finalPoints = 0;
    if (action === 'submit') {
      const testRatio = tests_total > 0 ? tests_passed / tests_total : 1;
      finalPoints = Math.round(basePts * testRatio * strikePenaltyFactor);
    }

    // 4. Upsert submission with verified user identity
    const submissionPayload = {
      contest_id: contest.id,
      contest_name: contest.name,
      problem_id: problem_id || null,
      problem_title: problemTitle,
      github: authUser.github,
      name: authUser.name,
      lang,
      code,
      strikes,
      status: action === 'disqualify' ? 'disqualified' : 'submitted',
      strike_penalty_factor: strikePenaltyFactor,
      tests_passed: action === 'submit' ? tests_passed : 0,
      tests_total: action === 'submit' ? tests_total : 0,
      points_awarded: finalPoints,
    };

    const { error: upsertErr } = await (db.from('arena_submissions') as any).upsert(
      [submissionPayload],
      { onConflict: 'contest_id,problem_id,github' },
    );

    if (upsertErr) {
      console.error('[/api/arena/submit] Upsert error:', upsertErr);
      return NextResponse.json({ error: 'Failed to record arena submission' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      points_awarded: finalPoints,
      status: submissionPayload.status,
    });
  } catch (err: any) {
    console.error('[/api/arena/submit]', err);
    return NextResponse.json({ error: err.message || 'Submission failed' }, { status: 500 });
  }
}

