// ════════════════════════════════════════════════════════════
// src/app/api/execute/route.ts
// POST /api/execute — Asynchronous Submission (wait=false)
// GET  /api/execute?token=... — Polling Endpoint
//
// Secure Server-Side Execution Isolation & Polling:
// - Enforces 64 KB code size limit.
// - Rate limiting: In-memory per-user / IP (20 runs/min, 5 submits/min).
//   (Note: In-memory rate limiting is per-instance).
// - Identity: Verified strictly from JWT auth.identities (GitHub provider).
// - Pro / Weekly Gate: Authorizes weekly problems against active Pro or Admin status.
// - Windows: Verifies weekly/contest active challenge time windows.
// - Duels: Verifies caller participation and records atomic win on server.
// - Test Cases: Pre/post migration compatible test case loader with 2-sample split rule.
// - Sanitization: Hidden test cases NEVER leak input, expected, stdout, or stderr.
// - Atomic Scoring: Awards points server-side once per problem per user, updates IST streak.
// - Executor Fallback: Wandbox fallback permitted ONLY for public practice problems.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  submitToJudge0,
  getJudge0Submission,
  evaluateJudge0Output,
  buildBatchedProgram,
  runWandboxSequential,
  pendingSubmissions,
  prunePendingSubmissions,
  type TestResult,
  type RunResult,
} from '@/lib/executor';
import { createServerSupabaseClient } from '@/lib/supabase';
import type { TestCase, Problem } from '@/types/database';

export const dynamic = 'force-dynamic';

const MAX_CODE_BYTES = 64 * 1024; // 64 KB

// ── In-memory rate limiters (per-instance) ───────────────────
interface RateLimitBucket {
  count: number;
  resetAt: number;
}
const runRateLimits = new Map<string, RateLimitBucket>();
const submitRateLimits = new Map<string, RateLimitBucket>();

function checkRateLimit(
  map: Map<string, RateLimitBucket>,
  key: string,
  limit: number,
  windowMs: number = 60000
): boolean {
  const now = Date.now();
  const rec = map.get(key);
  if (!rec || now >= rec.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (rec.count >= limit) {
    return false;
  }
  rec.count += 1;
  return true;
}

// ── Verified JWT Identity Extraction ─────────────────────────
async function getVerifiedAuthUser(req: NextRequest) {
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
  return { id: data.user.id, github, name };
}

// ── Sanitization ─────────────────────────────────────────────
function sanitizeTestResults(rawResults: TestResult[], targetCases: TestCase[]): TestResult[] {
  return rawResults.map((res, idx) => {
    const tc = targetCases[idx];
    const isHidden = Boolean(tc?.is_hidden || res.is_hidden);

    if (isHidden) {
      return {
        input: '[Hidden]',
        expected: '[Hidden]',
        actual: '[Hidden]',
        ok: res.ok,
        time: res.time,
        is_hidden: true,
        // Only return sanitized failure identifier, never raw output or error stack
        error: res.ok ? undefined : `Failed on hidden test case #${idx + 1}`,
      };
    }

    return {
      ...res,
      is_hidden: false,
    };
  });
}

// ── Test Cases Loading (Pre & Post Migration Compatible) ──────
async function loadTestCases(
  dbClient: any,
  problemId: string,
  mode?: 'run' | 'submit' | 'duel'
): Promise<{ cases: TestCase[]; problemRow: any }> {
  // 1. Fetch problem metadata
  const { data: problem, error: probErr } = await dbClient
    .from('problems')
    .select('id, title, points, visibility, is_contest_problem, test_cases')
    .eq('id', problemId)
    .maybeSingle();

  if (probErr || !problem) {
    throw new Error('Problem not found');
  }

  let allCases: TestCase[] = [];

  // 2. Try querying problem_test_cases (post-migration)
  const { data: dbCases, error: tcErr } = await dbClient
    .from('problem_test_cases')
    .select('input, expected, is_hidden, position')
    .eq('problem_id', problemId)
    .order('position', { ascending: true });

  if (!tcErr && dbCases && dbCases.length > 0) {
    allCases = dbCases.map((tc: any) => ({
      input: tc.input,
      expected: tc.expected,
      is_hidden: Boolean(tc.is_hidden),
    }));
  } else {
    // Fallback: Use problems.test_cases (pre-migration)
    const rawCases: TestCase[] = Array.isArray(problem.test_cases) ? problem.test_cases : [];
    const hasExplicitHidden = rawCases.some((tc) => tc.is_hidden === true);

    if (hasExplicitHidden) {
      allCases = rawCases.map((tc) => ({
        input: tc.input,
        expected: tc.expected,
        is_hidden: Boolean(tc.is_hidden),
      }));
    } else {
      // 2-sample split rule: first 2 cases are samples, remainder are hidden
      allCases = rawCases.map((tc, idx) => ({
        input: tc.input,
        expected: tc.expected,
        is_hidden: idx >= 2,
      }));
    }
  }

  // 3. Filter cases based on execution mode
  if (mode === 'run') {
    // Run mode evaluates only sample test cases
    const samples = allCases.filter((tc) => !tc.is_hidden);
    return { cases: samples.length ? samples : allCases.slice(0, 2), problemRow: problem };
  }

  // Submit and Duel modes run all test cases (sample + hidden)
  return { cases: allCases, problemRow: problem };
}

// ── Atomic Scoring Helper ─────────────────────────────────────
async function handleAtomicAward(
  dbClient: any,
  user: { github: string; name: string },
  problem: { id: string; title: string; points: number; visibility?: string },
  lang: string,
  code: string,
  passed: number,
  total: number
): Promise<{ pointsAwarded: number; isFirstSolve: boolean; streak: number }> {
  const isWeekly = problem.visibility === 'weekly';
  const allPassed = total > 0 && passed === total;
  const nowIso = new Date().toISOString();

  // Try RPC award_problem_points if installed by migration
  try {
    const { data: rpcRes, error: rpcErr } = await dbClient.rpc('award_problem_points', {
      p_problem_id: problem.id,
      p_github: user.github,
      p_name: user.name,
      p_lang: lang,
      p_code: code,
      p_passed: passed,
      p_total: total,
    });
    if (!rpcErr && rpcRes) {
      return {
        pointsAwarded: rpcRes.points_awarded ?? 0,
        isFirstSolve: Boolean(rpcRes.is_first_solve),
        streak: rpcRes.streak ?? 1,
      };
    }
  } catch {}

  // Fallback before migration: Service role atomic execution in JavaScript
  const { data: exSub } = await dbClient
    .from('submissions')
    .select('id, points_awarded, status, code')
    .eq('problem_id', String(problem.id))
    .eq('github', user.github)
    .maybeSingle();

  let alreadySolved = Boolean(exSub && (exSub.points_awarded || 0) > 0);
  if (!alreadySolved) {
    const { data: exWeekly } = await dbClient
      .from('weekly_submissions')
      .select('id')
      .eq('problem_id', problem.id)
      .eq('github', user.github)
      .gt('points_awarded', 0)
      .limit(1)
      .maybeSingle();
    if (exWeekly) alreadySolved = true;
  }
  const isFirstSolve = !alreadySolved && allPassed;
  const basePoints = problem.points || 100;
  const pointsAwarded = (allPassed && isFirstSolve) ? basePoints : 0;

  // For weekly problems, calculate time-bonus points to add to members.total_points
  let finalWeeklyPoints = 0;
  let activeChallenge: any = null;
  let weeklyBonus = 0;
  if (isWeekly) {
    try {
      const { data: challenges } = await dbClient
        .from('weekly_challenges')
        .select('id, starts_at, ends_at, problem_ids')
        .order('created_at', { ascending: false });

      activeChallenge = (challenges || []).find((c: any) =>
        Array.isArray(c.problem_ids) && c.problem_ids.includes(problem.id)
      );

      if (activeChallenge) {
        const nowMs = Date.now();
        const startMs = new Date(activeChallenge.starts_at).getTime();
        const endMs = new Date(activeChallenge.ends_at).getTime();
        const totalMs = Math.max(1, endMs - startMs);
        const frac = Math.min(1, Math.max(0, nowMs - startMs) / totalMs);
        weeklyBonus = 1.0 - frac * 0.8;
        finalWeeklyPoints = (allPassed && isFirstSolve) ? Math.round(basePoints * (1 + weeklyBonus)) : 0;
      }
    } catch (e: any) {
      console.warn('[handleAtomicAward] Weekly challenge lookup warning:', e.message);
    }
  }

  const memberPoints = isWeekly ? finalWeeklyPoints : pointsAwarded;

  // Streak calculation in Asia/Kolkata (IST)
  const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const { data: member } = await dbClient
    .from('members')
    .select('total_points, problems_solved, streak, last_solved_at')
    .eq('github', user.github)
    .maybeSingle();

  let streak = member?.streak || 0;
  if (allPassed) {
    if (member?.last_solved_at) {
      const lastIST = new Date(member.last_solved_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      if (lastIST === todayIST) {
        // Already solved something today in IST
      } else {
        const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        if (lastIST === yesterday) {
          streak += 1;
        } else {
          streak = 1;
        }
      }
    } else {
      streak = 1;
    }

    // Update members row
    await dbClient
      .from('members')
      .update({
        total_points: (member?.total_points || 0) + memberPoints,
        problems_solved: (member?.problems_solved || 0) + (isFirstSolve ? 1 : 0),
        streak,
        last_solved_at: nowIso,
      })
      .eq('github', user.github);
  }

  // Never downgrade an approved submission, preserve original approved code
  const finalStatus = (exSub?.status === 'approved') ? 'approved' : (allPassed ? 'approved' : 'rejected');
  const finalCode = (exSub?.status === 'approved' && exSub.code) ? exSub.code : code;
  const finalPoints = Math.max(exSub?.points_awarded || 0, pointsAwarded);

  // Record submission in submissions table
  await dbClient
    .from('submissions')
    .upsert(
      [
        {
          problem_id: String(problem.id),
          problem_title: problem.title,
          github: user.github,
          name: user.name,
          lang,
          code: finalCode,
          status: finalStatus,
          tests_passed: passed,
          tests_total: total,
          points_awarded: finalPoints,
        },
      ],
      { onConflict: 'problem_id,github' }
    );

  // If weekly problem, also write to weekly_submissions for weekly leaderboard
  if (isWeekly && activeChallenge) {
    try {
      const { data: exWeekly } = await dbClient
        .from('weekly_submissions')
        .select('id, status, points_awarded, code, lang, time_bonus')
        .eq('weekly_challenge_id', activeChallenge.id)
        .eq('problem_id', problem.id)
        .eq('github', user.github)
        .maybeSingle();

      const finalWeeklyStatus = (exWeekly?.status === 'approved') ? 'approved' : (allPassed ? 'approved' : 'rejected');
      const finalWeeklyCode = (exWeekly?.status === 'approved' && exWeekly.code) ? exWeekly.code : code;
      const finalWeeklyLang = (exWeekly?.status === 'approved' && exWeekly.lang) ? exWeekly.lang : lang;
      const finalWeeklyScore = Math.max(exWeekly?.points_awarded || 0, finalWeeklyPoints);
      const finalWeeklyBonus = (exWeekly?.status === 'approved' && exWeekly.time_bonus != null) ? exWeekly.time_bonus : weeklyBonus;

      await dbClient
        .from('weekly_submissions')
        .upsert(
          [
            {
              weekly_challenge_id: activeChallenge.id,
              problem_id: problem.id,
              problem_title: problem.title,
              github: user.github,
              name: user.name,
              lang: finalWeeklyLang,
              code: finalWeeklyCode,
              tests_passed: passed,
              tests_total: total,
              points_awarded: finalWeeklyScore,
              time_bonus: finalWeeklyBonus,
              status: finalWeeklyStatus,
              submitted_at: exWeekly?.submitted_at || nowIso,
            },
          ],
          { onConflict: 'weekly_challenge_id,problem_id,github' }
        );
    } catch (e: any) {
      console.warn('[handleAtomicAward] Weekly submission sync warning:', e.message);
    }
  }

  return { pointsAwarded, isFirstSolve, streak };
}

// ── POST Handler ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const authUser = await getVerifiedAuthUser(req);
    const ip = req.headers.get('x-forwarded-for') || 'anonymous';
    const rateLimitKey = authUser?.github || ip;

    const body = await req.json();
    const { code, language, problem_id, test_cases, mode = 'run', duel_id } = body;

    // 1. Enforce 64 KB code size limit
    if (typeof code !== 'string') {
      return NextResponse.json({ error: 'Missing code' }, { status: 400 });
    }
    if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) {
      return NextResponse.json(
        { error: 'Code size exceeds maximum limit of 64 KB' },
        { status: 413 }
      );
    }
    if (!language) {
      return NextResponse.json({ error: 'Missing language' }, { status: 400 });
    }

    // 2. Separate rate limits for Run and Submit
    if (mode === 'submit') {
      if (!checkRateLimit(submitRateLimits, rateLimitKey, 5, 60000)) {
        return NextResponse.json(
          { error: 'Submission rate limit reached (5 submits/minute). Please wait before submitting again.' },
          { status: 429 }
        );
      }
    } else {
      if (!checkRateLimit(runRateLimits, rateLimitKey, 20, 60000)) {
        return NextResponse.json(
          { error: 'Test execution rate limit reached (20 runs/minute). Please wait before running again.' },
          { status: 429 }
        );
      }
    }

    const dbClient = createServerSupabaseClient();
    let targetCases: TestCase[] = [];
    let problemRow: any = null;

    // 3. Load authoritative test cases from DB
    if (problem_id) {
      const loaded = await loadTestCases(dbClient, problem_id, mode);
      targetCases = loaded.cases;
      problemRow = loaded.problemRow;

      // Weekly problem authorization check
      if (problemRow.visibility === 'weekly') {
        if (!authUser) {
          return NextResponse.json({ error: 'Sign in required for weekly challenge problems' }, { status: 401 });
        }

        // Check Admin or Pro status
        const { data: adminRow } = await (dbClient.from('admins') as any)
          .select('github')
          .eq('github', authUser.github)
          .maybeSingle();

        let isPro = false;
        if (!adminRow) {
          const { data: subRow } = await (dbClient.from('subscribers') as any)
            .select('status, current_period_end')
            .eq('github', authUser.github)
            .eq('status', 'confirmed')
            .gt('current_period_end', new Date().toISOString())
            .maybeSingle();
          isPro = Boolean(subRow);
        }

        if (!adminRow && !isPro) {
          return NextResponse.json(
            { error: 'Weekly Challenge problems require an active Pro subscription.' },
            { status: 403 }
          );
        }

        // Check active challenge window for submissions
        if (mode === 'submit') {
          const { data: challenges } = await (dbClient.from('weekly_challenges') as any)
            .select('starts_at, ends_at, problem_ids')
            .order('created_at', { ascending: false });

          const activeChallenge = (challenges || []).find((c: any) =>
            Array.isArray(c.problem_ids) && c.problem_ids.includes(problem_id)
          );

          if (activeChallenge) {
            const now = Date.now();
            const startMs = new Date(activeChallenge.starts_at).getTime();
            const endMs = new Date(activeChallenge.ends_at).getTime();
            if (now < startMs || now > endMs) {
              return NextResponse.json(
                { error: 'Weekly challenge window has ended or is not currently active.' },
                { status: 403 }
              );
            }
          }
        }
      }
    } else if (Array.isArray(test_cases)) {
      targetCases = test_cases;
    } else {
      return NextResponse.json({ error: 'Missing test cases or problem_id' }, { status: 400 });
    }

    // 4. Duel verification
    let duelRow: any = null;
    if (mode === 'duel' || duel_id) {
      if (!duel_id) {
        return NextResponse.json({ error: 'Missing duel_id for duel mode' }, { status: 400 });
      }
      if (!authUser) {
        return NextResponse.json({ error: 'Authentication required for code duels' }, { status: 401 });
      }

      const { data: duel, error: duelErr } = await (dbClient.from('code_duels') as any)
        .select('*')
        .eq('id', duel_id)
        .maybeSingle();

      if (duelErr || !duel) {
        return NextResponse.json({ error: 'Duel room not found' }, { status: 404 });
      }

      if (duel.host_github !== authUser.github && duel.guest_github !== authUser.github) {
        return NextResponse.json({ error: 'User is not a participant in this duel match' }, { status: 403 });
      }

      duelRow = duel;
    }

    if (targetCases.length === 0) {
      return NextResponse.json({
        status: 'done',
        passed: 0,
        total: 0,
        results: [],
        message: 'No test cases to run.',
      });
    }

    // 5. Build batched program and submit to Judge0
    const batchedCode = buildBatchedProgram(code, language, targetCases, true);
    const isProtectedChallenge = problemRow?.visibility === 'weekly' || problemRow?.is_contest_problem === true;

    try {
      const { token } = await submitToJudge0(batchedCode, language);

      prunePendingSubmissions();
      pendingSubmissions.set(token, {
        token,
        problem_id,
        mode,
        duel_id,
        testCases: targetCases,
        user: authUser ? { github: authUser.github, name: authUser.name } : undefined,
        code,
        language,
        problemTitle: problemRow?.title,
        problemPoints: problemRow?.points,
        isWeekly: problemRow?.visibility === 'weekly',
        createdAt: Date.now(),
      });

      return NextResponse.json({
        token,
        status: 'processing',
        problem_id,
      });
    } catch (judge0Err: any) {
      // For weekly and contest problems, DO NOT fall back to Wandbox (hidden cases leak prevention)
      if (isProtectedChallenge) {
        console.error('[execute] Judge0 failed for weekly/contest problem:', judge0Err.message);
        return NextResponse.json(
          { error: 'Execution service temporarily unavailable for this challenge. Please retry in a moment.' },
          { status: 503 }
        );
      }

      console.warn('[execute] Judge0 async submit failed, using Wandbox fallback for practice problem:', judge0Err.message);
      const rawResult = await runWandboxSequential(code, language, targetCases);
      const sanitized = sanitizeTestResults(rawResult.results, targetCases);

      let awardData: any = undefined;
      if (mode === 'submit' && authUser && problemRow) {
        awardData = await handleAtomicAward(
          dbClient,
          authUser,
          problemRow,
          language,
          code,
          rawResult.passed,
          rawResult.total
        );
      }

      return NextResponse.json({
        status: 'done',
        passed: rawResult.passed,
        total: rawResult.total,
        results: sanitized,
        points_awarded: awardData?.pointsAwarded,
        is_first_solve: awardData?.isFirstSolve,
        streak: awardData?.streak,
      });
    }
  } catch (err: any) {
    console.error('[/api/execute POST]', err);
    return NextResponse.json({ error: err.message || 'Execution failed' }, { status: 500 });
  }
}

// ── GET Polling Handler ──────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const token = searchParams.get('token');
    const problem_id = searchParams.get('problem_id');
    const mode = (searchParams.get('mode') as 'run' | 'submit' | 'duel') || undefined;

    if (!token) {
      return NextResponse.json({ error: 'Missing submission token' }, { status: 400 });
    }

    const submission = await getJudge0Submission(token);
    const statusId = submission.status?.id ?? 0;

    // Status ID <= 2: In Queue (1) or Processing (2)
    if (statusId <= 2) {
      return NextResponse.json({
        token,
        status: 'processing',
        status_id: statusId,
        description: submission.status?.description || 'Processing',
      });
    }

    // Status ID > 2: Finished
    const pending = pendingSubmissions.get(token);
    let targetCases: TestCase[] = [];
    const dbClient = createServerSupabaseClient();

    if (pending && pending.testCases?.length) {
      targetCases = pending.testCases;
    } else if (problem_id) {
      const loaded = await loadTestCases(dbClient, problem_id, mode);
      targetCases = loaded.cases;
    }

    if (!targetCases.length) {
      return NextResponse.json({
        status: 'done',
        passed: 0,
        total: 0,
        results: [],
        message: 'No test cases associated with this submission token.',
      });
    }

    const rawResult: RunResult = evaluateJudge0Output(submission, targetCases);
    const sanitized = sanitizeTestResults(rawResult.results, targetCases);

    let awardData: any = undefined;
    let isVictory = false;

    // Atomic scoring for submit mode
    if (pending?.mode === 'submit' && pending.user && pending.problem_id) {
      const prob = {
        id: pending.problem_id,
        title: pending.problemTitle || '',
        points: pending.problemPoints || 100,
        visibility: pending.isWeekly ? 'weekly' : 'public',
      };
      awardData = await handleAtomicAward(
        dbClient,
        pending.user,
        prob,
        pending.language || 'unknown',
        pending.code || '',
        rawResult.passed,
        rawResult.total
      );
    }

    // Atomic duel victory resolution
    if (pending?.mode === 'duel' && pending.duel_id && pending.user) {
      const allPassed = rawResult.passed > 0 && rawResult.passed === targetCases.length;
      if (allPassed) {
        const { data: duel } = await (dbClient.from('code_duels') as any)
          .select('*')
          .eq('id', pending.duel_id)
          .maybeSingle();

        if (duel && duel.status === 'active') {
          const isHost = duel.host_github === pending.user.github;
          const now = new Date().toISOString();
          const { data: updatedDuel } = await (dbClient.from('code_duels') as any)
            .update({
              winner_github: pending.user.github,
              winner_id: isHost ? duel.host_id : duel.guest_id,
              status: 'completed',
              ended_at: now,
              ...(isHost
                ? { host_progress: { testsPassed: rawResult.passed, totalTests: targetCases.length, status: 'submitted', lastUpdated: now } }
                : { guest_progress: { testsPassed: rawResult.passed, totalTests: targetCases.length, status: 'submitted', lastUpdated: now } }),
            })
            .eq('id', pending.duel_id)
            .eq('status', 'active')
            .select('*')
            .maybeSingle();

          isVictory = Boolean(updatedDuel);
        }
      }
    }

    // Clean up cached pending submission
    pendingSubmissions.delete(token);

    return NextResponse.json({
      status: 'done',
      passed: rawResult.passed,
      total: rawResult.total,
      results: sanitized,
      judge_status: submission.status?.description,
      points_awarded: awardData?.pointsAwarded,
      is_first_solve: awardData?.isFirstSolve,
      streak: awardData?.streak,
      isVictory,
    });
  } catch (err: any) {
    console.error('[/api/execute GET]', err);
    return NextResponse.json({ error: err.message || 'Status check failed' }, { status: 500 });
  }
}
