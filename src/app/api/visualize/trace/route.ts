// ------------------------------------------------------------
// src/app/api/visualize/trace/route.ts
// POST /api/visualize/trace
//
// Server-side trace runner for compiled languages (C++, Java, Go, Rust).
// Receives pre-instrumented source code with __BB_TRACE__ markers,
// submits it to the local Docker Judge0 container (with Wandbox fallback),
// and returns split stdout (clean user output + parsed trace steps) and
// any compiler/runtime errors.
//
// Response body (200):
//   { stdout: string, stderr: string, compileError?: string }
//
// Response body (422):
//   { error: string, compileError: string } � compilation failed cleanly
//
// Response body (500):
//   { error: string } � infrastructure / network failure
// ------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { executeRawProgram } from '@/lib/executor';

// Judge0 status IDs that indicate compilation failure
const COMPILE_ERROR_STATUSES = new Set([6]); // Compilation Error

interface TraceRequestBody {
  code:     string;
  language: string;
}

// Judge0-specific extended fetch so we can inspect the status field
async function executeRawProgramWithStatus(
  code: string,
  language: string,
): Promise<{ stdout: string; stderr: string; compileError?: string }> {
  // Judge0 language IDs (must stay in sync with executor.ts)
  const JUDGE0_LANGUAGE_ID: Record<string, number> = {
    cpp:    54,
    java:   62,
    rust:   73,
    go:     60,
    python: 71,
  };

  const languageId = JUDGE0_LANGUAGE_ID[language];
  if (!languageId) throw new Error(`Unsupported language for trace: ${language}`);

  const base = process.env.JUDGE0_URL || 'http://localhost:2358';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.JUDGE0_AUTH_TOKEN) {
    headers['X-Auth-Token'] = process.env.JUDGE0_AUTH_TOKEN;
  }

  let judgeData: any = null;
  let judgeOk = false;

  try {
    const submitRes = await fetch(`${base}/submissions?wait=true`, {
      method:  'POST',
      headers,
      body: JSON.stringify({
        source_code:     code,
        language_id:     languageId,
        stdin:           '',
        cpu_time_limit:  15,
        compile_timeout: 30,
        wall_time_limit: 20,
      }),
      signal: AbortSignal.timeout(35000),
    });

    if (submitRes.ok) {
      judgeData = await submitRes.json();
      judgeOk   = true;
    } else {
      const errBody = await submitRes.text();
      console.warn(`[trace] Judge0 HTTP ${submitRes.status}: ${errBody} � falling back to Wandbox`);
    }
  } catch (e: any) {
    console.warn(`[trace] Judge0 unreachable: ${e.message} � falling back to Wandbox`);
  }

  if (judgeOk && judgeData) {
    const statusId: number = judgeData.status?.id ?? 0;

    // Compilation error
    if (COMPILE_ERROR_STATUSES.has(statusId)) {
      const compileError = (judgeData.compile_output ?? '').trim();
      return { stdout: '', stderr: '', compileError };
    }

    const stdout       = judgeData.stdout        ?? '';
    const stderr       = (judgeData.stderr        ?? '').trim();
    const compileOut   = (judgeData.compile_output ?? '').trim();
    // Treat compile_output as a warning/note if execution still succeeded
    const combinedStderr = [stderr, compileOut].filter(Boolean).join('\n');

    return { stdout, stderr: combinedStderr };
  }

  // -- Wandbox fallback -------------------------------------------
  const WANDBOX_COMPILER: Record<string, string> = {
    cpp:    'gcc-head',
    java:   'openjdk-jdk-22+36',
    rust:   'rust-1.82.0',
    go:     'go-1.23.2',
    python: 'cpython-3.12.0',
  };

  const compiler = WANDBOX_COMPILER[language];
  if (!compiler) throw new Error(`Wandbox: no compiler for ${language}`);

  let lastErr: any;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://wandbox.org/api/compile.json', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ compiler, code }),
        signal:  AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const body = await res.text();
        if (res.status >= 500 && attempt < 3) {
          await new Promise(r => setTimeout(r, attempt * 600));
          continue;
        }
        throw new Error(`Wandbox error ${res.status}: ${body}`);
      }

      const data = await res.json();
      const compilerError = (data.compiler_error ?? '').trim();

      // Wandbox signals compile error via non-empty compiler_error + empty program_output
      if (compilerError && !data.program_output) {
        return { stdout: '', stderr: '', compileError: compilerError };
      }

      return {
        stdout: data.program_output ?? '',
        stderr: (compilerError || (data.program_error ?? '')).trim(),
      };
    } catch (err: any) {
      lastErr = err;
      if (
        attempt < 3 &&
        (err.name === 'AbortError' || err.name === 'TypeError' || err.message?.includes('fetch failed'))
      ) {
        await new Promise(r => setTimeout(r, attempt * 600));
        continue;
      }
      throw err;
    }
  }

  throw lastErr || new Error('Wandbox fallback failed after retries');
}

export async function POST(req: NextRequest) {
  try {
    const body: TraceRequestBody = await req.json();
    const { code, language } = body;

    if (!code || !language) {
      return NextResponse.json(
        { error: 'Missing code or language parameter' },
        { status: 400 },
      );
    }

    const result = await executeRawProgramWithStatus(code, language);

    // Compilation failed � return 422 so the frontend can surface it cleanly
    if (result.compileError) {
      return NextResponse.json(
        { error: 'Compilation failed', compileError: result.compileError },
        { status: 422 },
      );
    }

    return NextResponse.json({
      stdout: result.stdout,
      stderr: result.stderr,
    });

  } catch (err: any) {
    console.error('[/api/visualize/trace]', err);
    return NextResponse.json(
      { error: err.message || 'Trace execution failed' },
      { status: 500 },
    );
  }
}
