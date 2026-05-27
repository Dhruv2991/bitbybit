// ════════════════════════════════════════════════════════════
// src/lib/executor.ts — Zero-API Code Execution
// ════════════════════════════════════════════════════════════
//
// HOW IT WORKS — no API key, no account, no rate limit fees:
//
//   Python     → Pyodide (CPython WASM, runs IN the browser)
//   JavaScript → Browser Web Worker (native, zero deps)
//   C++ / Java / Go / Rust
//              → Server route proxies to Wandbox.org
//                (100% free public API, no auth required)
//
// This file is SERVER-SIDE only (called from /api/execute).
// Python and JS are handled CLIENT-SIDE in the Workspace
// via the useBrowserExecutor hook (see below).
// ════════════════════════════════════════════════════════════

export interface TestResult {
  input:    string;
  expected: string;
  actual:   string;
  ok:       boolean;
  error?:   string;
  time?:    string;
}

export interface RunResult {
  passed:  number;
  total:   number;
  results: TestResult[];
}

// Wandbox compiler IDs for each language
const WANDBOX_COMPILER: Record<string, string> = {
  python: 'cpython-head',
  cpp:  'gcc-head',
  java: 'openjdk-head',
  rust: 'rust-head',
  go:   'go-head',
};

// ── Execute via Wandbox (server-side, no auth) ───────────────
async function executeWithWandbox(
  sourceCode: string,
  language:   string,
  stdin:      string
): Promise<{ stdout: string; stderr: string; code: number }> {
  const compiler = WANDBOX_COMPILER[language];
  if (!compiler) throw new Error(`Unsupported language for server execution: ${language}`);

  const res = await fetch('https://wandbox.org/api/compile.json', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      compiler,
      code:  sourceCode,
      stdin: stdin || '',
      ...(language === 'cpp' && { 'compiler-option-raw': '-std=c++17' }),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Wandbox error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return {
    stdout: data.program_output || '',
    stderr: (data.compiler_error || '') + (data.program_error || ''),
    code:   data.status ?? 0,
  };
}

// ── Run compiled-language code against test cases ────────────
export async function runAgainstTestCases(
  sourceCode: string,
  language:   string,
  testCases:  { input: string; expected: string }[]
): Promise<RunResult> {
  if (!testCases.length) return { passed: 0, total: 0, results: [] };

  const results: TestResult[] = await Promise.all(
    testCases.map(async (tc): Promise<TestResult> => {
      try {
        const t0  = Date.now();
        const out = await executeWithWandbox(sourceCode, language, tc.input);
        const ms  = Date.now() - t0;

        const actual   = (out.stdout || '').trim();
        const expected = String(tc.expected).trim();
        const ok       = actual === expected;
        const error    = out.stderr ? out.stderr.split('\n')[0] : undefined;

        return { input: tc.input, expected, actual, ok, error, time: `${ms}ms` };
      } catch (e: any) {
        return {
          input: tc.input, expected: String(tc.expected).trim(),
          actual: '', ok: false, error: e.message || 'Execution error',
        };
      }
    })
  );

  return { passed: results.filter(r => r.ok).length, total: results.length, results };
}