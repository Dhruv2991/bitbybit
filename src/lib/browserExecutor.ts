// ════════════════════════════════════════════════════════════
// src/lib/browserExecutor.ts
// LeetCode-style execution:
//   - Test case input  = JSON array of arguments e.g. [[2,7,11,15], 9]
//   - Test case output = JSON value              e.g. [0,1]
//   - User writes only the function body
//   - We wrap it with a harness that calls the function + prints JSON result
// ════════════════════════════════════════════════════════════

import type { RunResult, TestResult } from './executor';
export type { RunResult, TestResult };

// ── Pyodide loader (singleton) ───────────────────────────────
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

// ── Extract function name from user code ─────────────────────
function extractFuncName(code: string, lang: string): string {
  if (lang === 'python') {
    const m = code.match(/def\s+(\w+)\s*\(/);
    return m?.[1] || 'solution';
  }
  if (lang === 'javascript') {
    // FIX: also match arrow functions: const name = (...) => ...
    const m = code.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\())/);
    return m?.[1] || m?.[2] || 'solution';
  }
  return 'solution';
}

// ── Build harness around user's function ─────────────────────
// inputJson: JSON array of arguments e.g. [[2,7,11,15], 9]
function buildHarness(userCode: string, lang: string, inputJson: string): string {
  const fn = extractFuncName(userCode, lang);
  const argsJson = JSON.stringify(inputJson); // double-encoded for safe embedding

  switch (lang) {
    case 'python':
      // FIX: use json.dumps with ensure_ascii=False so unicode survives,
      // and separators=(',',':') for compact output matching expected values.
      return [
        'import json',
        '',
        userCode,
        '',
        `__args__ = json.loads(${argsJson})`,
        `__result__ = ${fn}(*(__args__ if isinstance(__args__, list) else [__args__]))`,
        // FIX: replace single-space in lists "[0, 1]" → "[0,1]" to match expected JSON
        'print(json.dumps(__result__, separators=(",", ":")))',
      ].join('\n');

    case 'javascript':
      // FIX: handle arrow functions and named function expressions by re-exporting under fn name
      return [
        userCode,
        '',
        `const __args__ = JSON.parse(${argsJson});`,
        // FIX: ensure fn exists even if user wrote an arrow function assigned to a const
        `const __fn__ = typeof ${fn} !== 'undefined' ? ${fn} : solution;`,
        `const __result__ = __fn__(...(Array.isArray(__args__) ? __args__ : [__args__]));`,
        'console.log(JSON.stringify(__result__));',
      ].join('\n');

    default:
      return userCode;
  }
}

// ── Compare JSON outputs (order-insensitive for objects) ──────
function jsonEqual(a: string, b: string): boolean {
  try {
    const normalize = (v: any): any => {
      if (Array.isArray(v)) return v.map(normalize);
      if (v !== null && typeof v === 'object')
        return Object.fromEntries(Object.entries(v).sort().map(([k,val]) => [k, normalize(val)]));
      return v;
    };
    return JSON.stringify(normalize(JSON.parse(a))) === JSON.stringify(normalize(JSON.parse(b)));
  } catch {
    return a.trim() === b.trim();
  }
}

// ── Run Python via Pyodide ───────────────────────────────────
async function runPython(code: string): Promise<{ stdout: string; stderr: string }> {
  const pyodide = await getPyodide();
  let stdout = '';
  let stderr = '';
  pyodide.setStdout({ batched: (s: string) => { stdout += s + '\n'; } });
  pyodide.setStderr({ batched: (s: string) => { stderr += s + '\n'; } });
  try {
    await pyodide.runPythonAsync(code);
  } catch (e: any) {
    stderr += e.message || String(e);
  } finally {
    pyodide.setStdout({ batched: () => {} });
    pyodide.setStderr({ batched: () => {} });
  }
  return { stdout: stdout.trimEnd(), stderr: stderr.trimEnd() };
}

// ── Run JavaScript in an isolated Web Worker ─────────────────
function runJavaScript(code: string, timeout = 5000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const workerCode = `
      const __logs__ = [];
      self.console = {
        log:   (...a) => __logs__.push(a.map(String).join(' ')),
        error: (...a) => __logs__.push('[err] ' + a.map(String).join(' ')),
        warn:  (...a) => __logs__.push('[warn] ' + a.map(String).join(' ')),
      };
      self.require = (mod) => mod === 'fs' ? { readFileSync: () => '' } : {};
      try {
        eval(${JSON.stringify(code)});
        self.postMessage({ ok: true, stdout: __logs__.join('\\n'), stderr: '' });
      } catch(e) {
        self.postMessage({ ok: false, stdout: __logs__.join('\\n'), stderr: e.message });
      }
    `;
    const blob   = new Blob([workerCode], { type: 'application/javascript' });
    const url    = URL.createObjectURL(blob);
    const worker = new Worker(url);
    const timer  = setTimeout(() => {
      worker.terminate(); URL.revokeObjectURL(url);
      resolve({ stdout: '', stderr: 'Time limit exceeded (5s)' });
    }, timeout);
    worker.onmessage = (e) => {
      clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url);
      resolve({ stdout: e.data.stdout || '', stderr: e.data.stderr || '' });
    };
    worker.onerror = (e) => {
      clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url);
      resolve({ stdout: '', stderr: e.message || 'Worker error' });
    };
  });
}

// ── Main entrypoint ──────────────────────────────────────────
export type ExecutionStrategy = 'browser' | 'server';

export function getStrategy(language: string): ExecutionStrategy {
  return language === 'python' || language === 'javascript' ? 'browser' : 'server';
}

export async function runInBrowser(
  userCode:  string,
  language:  string,
  testCases: { input: string; expected: string; is_hidden?: boolean }[],
  onProgress?: (done: number, total: number) => void
): Promise<RunResult> {
  if (!testCases.length) return { passed: 0, total: 0, results: [] };

  const results: TestResult[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const isHidden = Boolean((tc as any)?.is_hidden);
    try {
      const harness = buildHarness(userCode, language, tc.input);
      const t0  = Date.now();
      const out = language === 'python'
        ? await runPython(harness)
        : await runJavaScript(harness);
      const ms = Date.now() - t0;

      const actual   = (out.stdout || '').trim();
      const expected = String(tc.expected).trim();
      const ok       = jsonEqual(actual, expected);

      if (isHidden) {
        results.push({
          input: '[Hidden]',
          expected: '[Hidden]',
          actual: '[Hidden]',
          ok,
          time: `${ms}ms`,
          is_hidden: true,
          error: ok ? undefined : (out.stderr ? 'Test case failed' : undefined),
        });
      } else {
        results.push({
          input: tc.input,
          expected,
          actual,
          ok,
          time: `${ms}ms`,
          is_hidden: false,
          error: !ok && out.stderr ? out.stderr : undefined,
        });
      }
    } catch (e: any) {
      if (isHidden) {
        results.push({
          input: '[Hidden]',
          expected: '[Hidden]',
          actual: '[Hidden]',
          ok: false,
          is_hidden: true,
          error: 'Test case failed',
        });
      } else {
        results.push({
          input: tc.input,
          expected: String(tc.expected).trim(),
          actual: '',
          ok: false,
          is_hidden: false,
          error: e.message || 'Execution error',
        });
      }
    }
    onProgress?.(i + 1, testCases.length);
  }

  return { passed: results.filter(r => r.ok).length, total: results.length, results };
}

/**
 * Polls the execution status endpoint every 1.5 to 2 seconds until Judge0 finishes (status id > 2).
 * Shows loading progress and returns final RunResult.
 */
export async function pollExecutionStatus(
  token: string,
  problemId?: string,
  onStatus?: (status: string) => void,
  mode: 'run' | 'submit' = 'run'
): Promise<RunResult> {
  const pollIntervalMs = 1800; // 1.8 seconds (within the 1.5s - 2.0s range)
  const maxAttempts = 60; // 60 * 1.8s ≈ 108 seconds timeout safeguard
  let attempts = 0;

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    attempts++;

    onStatus?.(`Compiling & executing… (polling #${attempts})`);

    const query = new URLSearchParams({ token });
    if (problemId) query.set('problem_id', problemId);
    if (mode) query.set('mode', mode);

    try {
      const res = await fetch(`/api/execute?${query.toString()}`);
      if (!res.ok) {
        continue;
      }

      const data = await res.json();

      if (data.status === 'done') {
        return {
          passed: data.passed ?? 0,
          total: data.total ?? 0,
          results: data.results ?? [],
          hidden_passed: data.hidden_passed,
          hidden_total: data.hidden_total,
          points_awarded: data.points_awarded,
          is_first_solve: data.is_first_solve,
          streak: data.streak,
          isVictory: data.isVictory,
        };
      }

      if (data.description) {
        onStatus?.(`Status: ${data.description}…`);
      }
    } catch {
      // Continue next attempt
    }
  }

  throw new Error('Execution timed out waiting for Judge0');
}

export async function runOnServer(
  userCode:  string,
  language:  string,
  testCases?: { input: string; expected: string; is_hidden?: boolean }[],
  onStatus?: (status: string) => void,
  problemId?: string,
  mode: 'run' | 'submit' = 'run'
): Promise<RunResult> {
  const payload: Record<string, any> = {
    code: userCode,
    language,
    mode,
  };
  if (problemId) {
    payload.problem_id = problemId;
  }
  if (testCases && testCases.length > 0) {
    payload.test_cases = testCases;
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { getSupabaseClient } = await import('@/lib/supabase');
    const { data: { session } } = await getSupabaseClient().auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch {}

  const res = await fetch('/api/execute', {
    method:  'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Execution failed');

  // If already finished (e.g. Wandbox fallback or immediate response)
  if (data.status === 'done' || data.results) {
    return {
      passed: data.passed ?? 0,
      total: data.total ?? 0,
      results: data.results ?? [],
      hidden_passed: data.hidden_passed,
      hidden_total: data.hidden_total,
      points_awarded: data.points_awarded,
      is_first_solve: data.is_first_solve,
      streak: data.streak,
      isVictory: data.isVictory,
    };
  }

  // If asynchronous token returned, enter polling loop
  if (data.token) {
    onStatus?.('Submitted to Judge0, awaiting execution…');
    return await pollExecutionStatus(data.token, problemId, onStatus, mode);
  }

  return data as RunResult;
}
