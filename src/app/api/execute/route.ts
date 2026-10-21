// ════════════════════════════════════════════════════════════
// src/app/api/execute/route.ts
// POST /api/execute
//
// Secure Server-Side Execution Isolation:
// - If problem_id is provided, fetches authoritative test cases
//   (both visible and hidden) directly from Supabase server-side.
// - Executes user code against ALL test cases on Judge0 / Wandbox.
// - Sanitizes hidden test cases so input/expected values are
//   NEVER returned in the JSON payload to the client.
// - Supports Python, JavaScript, C++, Java, Go, and Rust.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { runAgainstTestCases, type TestResult, type RunResult } from '@/lib/executor';
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
        return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
      }

      const allProblemCases: TestCase[] = (problem as Problem).test_cases || [];

      if (mode === 'run') {
        // "Run" mode: run against visible sample cases (or all cases if none marked hidden)
        const visibleOnly = allProblemCases.filter(tc => !tc.is_hidden);
        targetCases = visibleOnly.length > 0 ? visibleOnly : allProblemCases.slice(0, 3);
      } else {
        // "Submit" or full execution mode: run against ALL test cases (visible + hidden)
        targetCases = allProblemCases;
      }
    } else if (Array.isArray(test_cases)) {
      targetCases = test_cases;
    } else {
      return NextResponse.json({ error: 'Missing test cases or problem_id' }, { status: 400 });
    }

    if (targetCases.length === 0) {
      return NextResponse.json({
        passed: 0,
        total: 0,
        results: [],
        message: 'No test cases to run.',
      });
    }

    // ── 2. Run against all test cases on server ──────────────────────────────
    const rawResult: RunResult = await runAgainstTestCases(
      code,
      language,
      targetCases.map(tc => ({ input: tc.input, expected: tc.expected }))
    );

    // ── 3. Sanitize hidden test cases to eliminate network inspection leaks ──
    const sanitizedResults: TestResult[] = rawResult.results.map((res, idx) => {
      const tc = targetCases[idx];
      const isHidden = Boolean(tc?.is_hidden);

      if (isHidden) {
        return {
          input: '[Hidden]',
          expected: '[Hidden]',
          actual: '[Hidden]',
          ok: res.ok,
          time: res.time,
          is_hidden: true,
          // Only show generic runtime/compilation error message if failed
          error: res.ok ? undefined : (res.error ? 'Test case failed' : undefined),
        };
      }

      return {
        ...res,
        is_hidden: false,
      };
    });

    const hiddenTotal = targetCases.filter(tc => tc.is_hidden).length;
    const hiddenPassed = targetCases
      .filter((tc, i) => tc.is_hidden && rawResult.results[i]?.ok)
      .length;

    return NextResponse.json({
      passed: rawResult.passed,
      total: rawResult.total,
      results: sanitizedResults,
      hidden_passed: hiddenTotal > 0 ? hiddenPassed : undefined,
      hidden_total: hiddenTotal > 0 ? hiddenTotal : undefined,
    });
  } catch (err: any) {
    console.error('[/api/execute]', err);
    return NextResponse.json({ error: err.message || 'Execution failed' }, { status: 500 });
  }
}
