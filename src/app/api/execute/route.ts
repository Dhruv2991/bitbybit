// ════════════════════════════════════════════════════════════
// src/app/api/execute/route.ts
// POST /api/execute
//
// Handles C++, Java, Go, Rust via Wandbox.
// Python and JavaScript are executed client-side (browserExecutor.ts).
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { runAgainstTestCases }       from '@/lib/executor';

interface ExecuteBody {
  code:       string;
  language:   string;
  fn_name:    string;
  params:     string[];
  test_cases: { input: string; expected: string }[];
}

export async function POST(req: NextRequest) {
  try {
    const body: ExecuteBody = await req.json();
    const { code, language, fn_name, params, test_cases } = body;

    if (!code || !language || !fn_name || !params || !test_cases) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Python and JavaScript should be handled client-side
    if (language === 'python' || language === 'javascript') {
      return NextResponse.json(
        { error: `${language} should be executed in the browser. Check your Workspace setup.` },
        { status: 400 },
      );
    }

    const result = await runAgainstTestCases(code, language, fn_name, params, test_cases);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[/api/execute]', err);
    return NextResponse.json({ error: err.message || 'Execution failed' }, { status: 500 });
  }
}