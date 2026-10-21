// ════════════════════════════════════════════════════════════
// src/app/api/execute/route.ts
// POST /api/execute — Asynchronous Submission (wait=false)
// GET  /api/execute?token=... — Polling Endpoint
//
// Secure Server-Side Execution Isolation & Polling:
// - Captures Judge0 submission token instantly with wait=false,
//   completely bypassing Vercel's 10-second serverless timeout.
// - Supports GET status polling until Judge0 execution finishes (status id > 2).
// - Falls back to sequential Wandbox execution if Judge0 is unreachable.
// - Sanitizes hidden test cases so input/expected values are
//   NEVER returned in the JSON payload to the client.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import {
  submitToJudge0,
  getJudge0Submission,
  evaluateJudge0Output,
  buildBatchedProgram,
  runWandboxSequential,
  pendingSubmissions,
  prunePendingSubmissions,
  sanitizeTestResults,
  type TestResult,
  type RunResult,
} from '@/lib/executor';
import { createServerSupabaseClient, getSupabaseClient } from '@/lib/supabase';
import type { TestCase, Problem } from '@/types/database';

export const dynamic = 'force-dynamic';

interface ExecuteBody {
  code: string;
  language: string;
  problem_id?: string;
  test_cases?: { input: string; expected: string; is_hidden?: boolean }[];
  mode?: 'run' | 'submit';
}

async function loadAuthoritativeCases(problem_id: string, mode?: 'run' | 'submit'): Promise<TestCase[]> {
  let dbClient;
  try {
    dbClient = createServerSupabaseClient();
  } catch {
    dbClient = getSupabaseClient();
  }

  const { data: problem, error } = await dbClient
    .from('problems')
    .select('id, test_cases, starter_code')
    .eq('id', problem_id)
    .maybeSingle();

  if (error || !problem) {
    throw new Error('Problem not found');
  }

  const allProblemCases: TestCase[] = (problem as Problem).test_cases || [];

  if (mode === 'run') {
    const visibleOnly = allProblemCases.filter(tc => !tc.is_hidden);
    return visibleOnly.length > 0 ? visibleOnly : allProblemCases.slice(0, 3);
  }
  return allProblemCases;
}

export async function POST(req: NextRequest) {
  try {
    const body: ExecuteBody = await req.json();
    const { code, language, problem_id, test_cases, mode } = body;

    if (code === undefined || code === null || !language) {
      return NextResponse.json({ error: 'Missing required code or language' }, { status: 400 });
    }

    let targetCases: TestCase[] = [];

    // ── 1. If problem_id is provided, load authoritative test cases from DB ──
    if (problem_id) {
      targetCases = await loadAuthoritativeCases(problem_id, mode);
    } else if (Array.isArray(test_cases)) {
      targetCases = test_cases;
    } else {
      return NextResponse.json({ error: 'Missing test cases or problem_id' }, { status: 400 });
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

    // ── 2. Build batched program and submit asynchronously to Judge0 (wait=false) ──
    const batchedCode = buildBatchedProgram(code, language, targetCases, true);

    try {
      const { token } = await submitToJudge0(batchedCode, language);

      prunePendingSubmissions();
      pendingSubmissions.set(token, {
        token,
        problem_id,
        mode,
        testCases: targetCases,
        createdAt: Date.now(),
      });

      // Instantly return the submission token to the frontend
      return NextResponse.json({
        token,
        status: 'processing',
        problem_id,
      });
    } catch (judge0Err: any) {
      console.warn('[execute] Judge0 async submit failed, using Wandbox fallback:', judge0Err.message);

      // Fallback: run sequentially on Wandbox
      const rawResult = await runWandboxSequential(code, language, targetCases);
      const sanitized = sanitizeTestResults(rawResult.results, targetCases);
      const hiddenTotal = targetCases.filter(tc => tc.is_hidden).length;
      const hiddenPassed = targetCases.filter((tc, i) => tc.is_hidden && rawResult.results[i]?.ok).length;

      return NextResponse.json({
        status: 'done',
        passed: rawResult.passed,
        total: rawResult.total,
        results: sanitized,
        hidden_passed: hiddenTotal > 0 ? hiddenPassed : undefined,
        hidden_total: hiddenTotal > 0 ? hiddenTotal : undefined,
      });
    }
  } catch (err: any) {
    console.error('[/api/execute POST]', err);
    return NextResponse.json({ error: err.message || 'Execution failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const token = searchParams.get('token');
    const problem_id = searchParams.get('problem_id');
    const mode = (searchParams.get('mode') as 'run' | 'submit') || undefined;

    if (!token) {
      return NextResponse.json({ error: 'Missing submission token' }, { status: 400 });
    }

    // Query Judge0 submission status (GET /submissions/{token})
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

    // Status ID > 2: Finished (Accepted, Wrong Answer, Compilation Error, TLE, etc.)
    let targetCases: TestCase[] = [];
    const pending = pendingSubmissions.get(token);
    if (pending && pending.testCases?.length) {
      targetCases = pending.testCases;
    } else if (problem_id) {
      targetCases = await loadAuthoritativeCases(problem_id, mode);
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

    const hiddenTotal = targetCases.filter(tc => tc.is_hidden).length;
    const hiddenPassed = targetCases.filter((tc, i) => tc.is_hidden && rawResult.results[i]?.ok).length;

    // Clean up cached pending submission
    pendingSubmissions.delete(token);

    return NextResponse.json({
      status: 'done',
      passed: rawResult.passed,
      total: rawResult.total,
      results: sanitized,
      hidden_passed: hiddenTotal > 0 ? hiddenPassed : undefined,
      hidden_total: hiddenTotal > 0 ? hiddenTotal : undefined,
      judge_status: submission.status?.description,
    });
  } catch (err: any) {
    console.error('[/api/execute GET]', err);
    return NextResponse.json({ error: err.message || 'Status check failed' }, { status: 500 });
  }
}
