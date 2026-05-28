// ════════════════════════════════════════════════════════════
// src/lib/browserExecutor.ts
// Client-side code execution — zero API, zero auth
//
// Python     → Pyodide (CPython 3.11 WASM, runs in browser)
// JavaScript → Isolated Web Worker (5s timeout)
// C++/Java/Go/Rust → /api/execute (Wandbox, no auth)
//
// JSON HARNESS
// ─────────────
// test_cases[i].input    — JSON object keyed by param name
//                          e.g. { "nums": [2,7,11,15], "target": 9 }
// test_cases[i].expected — JSON value the function must return
//                          e.g. [0, 1]
//
// The harness deserialises input, calls the user's function with
// the correct args, serialises the return value, compares to expected.
// Users only write the function body — no stdin/stdout needed.
// ════════════════════════════════════════════════════════════

import { parsePythonDef } from '@/types/database';
import type { RunResult, TestResult } from './executor';
export type { RunResult, TestResult };

// ── Deep-equal for JSON values ────────────────────────────────
function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}
function normalise(v: unknown): unknown {
  if (Array.isArray(v)) return [...v].map(normalise).sort(
    (x, y) => (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1)
  );
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) out[k] = normalise((v as any)[k]);
    return out;
  }
  return v;
}

// ── Pyodide loader (singleton) ────────────────────────────────
let pyodideInstance: any = null;
let pyodideLoading: Promise<any> | null = null;

async function getPyodide(): Promise<any> {
  if (pyodideInstance) return pyodideInstance;
  if (pyodideLoading)  return pyodideLoading;
  pyodideLoading = (async () => {
    await new Promise<void>((resolve, reject) => {
      if ((window as any).loadPyodide) { resolve(); return; }
      const script   = document.createElement('script');
      script.src     = 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js';
      script.onload  = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Pyodide'));
      document.head.appendChild(script);
    });
    pyodideInstance = await (window as any).loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/',
    });
    return pyodideInstance;
  })();
  return pyodideLoading;
}

// ── Python via Pyodide ────────────────────────────────────────
// Wraps the user's function in a harness that:
//   1. json.loads the input object
//   2. Calls fn(**kwargs) so param order doesn't matter
//   3. json.dumps the return value to stdout
async function runPython(
  userCode:  string,
  fnName:    string,
  inputJson: string,
): Promise<{ stdout: string; stderr: string }> {
  const pyodide = await getPyodide();

  let stdout = '';
  let stderr = '';
  pyodide.setStdout({ batched: (s: string) => { stdout += s + '\n'; } });
  pyodide.setStderr({ batched: (s: string) => { stderr += s + '\n'; } });

  // Reset any leftover state from previous test cases
  pyodide.runPython('import sys; sys.modules.pop("__user__", None)');

  const harness = `
import json as _json

${userCode}

_input  = _json.loads(${JSON.stringify(inputJson)})
_result = ${fnName}(**_input)
print(_json.dumps(_result, separators=(',', ':')))
`.trim();

  try {
    await pyodide.runPythonAsync(harness);
  } catch (e: any) {
    // Clean up the Pyodide internal traceback noise —
    // only keep lines that reference user code (no _pyodide/_base paths)
    const raw: string = e.message || String(e);
    const cleaned = raw
      .split('\n')
      .filter((l: string) => !l.includes('_pyodide') && !l.includes('_base.py') && l.trim())
      .join('\n');
    stderr += cleaned || raw;
  }

  return { stdout: stdout.trimEnd(), stderr: stderr.trimEnd() };
}

// ── JavaScript via Web Worker ─────────────────────────────────
// Wraps the user's function in an isolated Worker that:
//   1. JSON.parses the input object
//   2. Calls fn(...args) with params in declaration order
//   3. JSON.stringifies the return value and postMessages it
function runJavaScript(
  userCode:  string,
  fnName:    string,
  params:    string[],
  inputJson: string,
  timeout    = 5000,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const workerCode = `
      try {
        ${userCode}

        const __input__  = JSON.parse(${JSON.stringify(inputJson)});
        const __args__   = ${JSON.stringify(params)}.map(k => __input__[k]);
        const __result__ = ${fnName}(...__args__);

        self.postMessage({ ok: true, stdout: JSON.stringify(__result__), stderr: '' });
      } catch (e) {
        self.postMessage({ ok: false, stdout: '', stderr: e.message });
      }
    `;

    const blob   = new Blob([workerCode], { type: 'application/javascript' });
    const url    = URL.createObjectURL(blob);
    const worker = new Worker(url);

    const timer = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ stdout: '', stderr: 'Time limit exceeded (5s)' });
    }, timeout);

    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ stdout: e.data.stdout || '', stderr: e.data.stderr || '' });
    };

    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({ stdout: '', stderr: e.message || 'Worker error' });
    };
  });
}

// ── Strategy ─────────────────────────────────────────────────
export type ExecutionStrategy = 'browser' | 'server';

export function getStrategy(language: string): ExecutionStrategy {
  return language === 'python' || language === 'javascript' ? 'browser' : 'server';
}

// ── runInBrowser ──────────────────────────────────────────────
export async function runInBrowser(
  sourceCode: string,
  language:   string,
  fnName:     string,
  params:     string[],
  testCases:  { input: string; expected: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<RunResult> {
  if (!testCases.length) return { passed: 0, total: 0, results: [] };

  const results: TestResult[] = [];

  // Sequential — Pyodide is single-threaded and shares global state
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    try {
      const t0  = Date.now();
      const out = language === 'python'
        ? await runPython(sourceCode, fnName, tc.input)
        : await runJavaScript(sourceCode, fnName, params, tc.input);
      const ms = Date.now() - t0;

      let actual: unknown;
      try   { actual = JSON.parse(out.stdout); }
      catch { actual = out.stdout; }

      let expected: unknown;
      try   { expected = JSON.parse(tc.expected); }
      catch { expected = tc.expected; }

      const ok = !out.stderr && jsonEqual(actual, expected);

      results.push({
        input:    tc.input,
        expected: tc.expected,
        actual:   out.stdout || '',
        ok,
        error:    out.stderr || undefined,
        time:     `${ms}ms`,
      });
    } catch (e: any) {
      results.push({
        input:    tc.input,
        expected: tc.expected,
        actual:   '',
        ok:       false,
        error:    e.message || 'Execution error',
      });
    }
    onProgress?.(i + 1, testCases.length);
  }

  return { passed: results.filter(r => r.ok).length, total: results.length, results };
}

// ── runOnServer ───────────────────────────────────────────────
export async function runOnServer(
  sourceCode: string,
  language:   string,
  fnName:     string,
  params:     string[],
  testCases:  { input: string; expected: string }[],
): Promise<RunResult> {
  const res = await fetch('/api/execute', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code:       sourceCode,
      language,
      fn_name:    fnName,
      params,
      test_cases: testCases,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Execution failed');
  return data as RunResult;
}