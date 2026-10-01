// ════════════════════════════════════════════════════════════
// src/app/api/execute/route.ts
// POST /api/execute
//
// ONLY JavaScript is executed CLIENT-SIDE (browser environment).
// This route now handles Python, C++, Java, Go, and Rust via Wandbox.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { runAgainstTestCases }       from '@/lib/executor';

// Reduced to just javascript as per your new architecture
const BROWSER_LANGS = new Set(['javascript']);

interface ExecuteBody {
  code:       string;
  language:   string;
  test_cases: { input: string; expected: string }[];
}

export async function POST(req: NextRequest) {
  try {
    const body: ExecuteBody = await req.json();
    const { code, language, test_cases } = body;

    if (code === undefined || code === null || !language || !Array.isArray(test_cases)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Checked directly via string comparison as requested
    if (language === 'javascript') {
      // Should be handled client-side — but just in case, return a clear error
      return NextResponse.json(
        { error: `${language} should be executed in the browser. Check your Workspace setup.` },
        { status: 400 }
      );
    }

    // Python, C++, Java, Go, Rust will all flow down here seamlessly to Wandbox
    const result = await runAgainstTestCases(code, language, test_cases);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[/api/execute]', err);
    return NextResponse.json({ error: err.message || 'Execution failed' }, { status: 500 });
  }
}
