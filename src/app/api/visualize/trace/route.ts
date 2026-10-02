// ════════════════════════════════════════════════════════════
// src/app/api/visualize/trace/route.ts
// POST /api/visualize/trace
//
// Server-side trace runner for compiled languages (C++, Java, Go, Rust)
// and fallback execution environments. Receives instrumented source code
// with __BB_TRACE__ markers and returns the raw compiler stdout/stderr.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { executeRawProgram } from '@/lib/executor';

interface TraceRequestBody {
  code:     string;
  language: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: TraceRequestBody = await req.json();
    const { code, language } = body;

    if (!code || !language) {
      return NextResponse.json({ error: 'Missing code or language parameter' }, { status: 400 });
    }

    const { stdout, stderr } = await executeRawProgram(code, language);
    return NextResponse.json({ stdout, stderr });
  } catch (err: any) {
    console.error('[/api/visualize/trace error]', err);
    return NextResponse.json({ error: err.message || 'Trace execution failed' }, { status: 500 });
  }
}
