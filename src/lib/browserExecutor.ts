// ════════════════════════════════════════════════════════════
// src/lib/browserExecutor.ts
// Client-side code execution — zero API, zero auth
//
//  Python     → Pyodide (CPython 3.11 compiled to WASM)
//               Loads once from CDN, cached by browser forever after.
//               stdin is simulated by monkey-patching input().
//
//  JavaScript → Isolated Web Worker with 5s timeout.
//               console.log captured and returned as stdout.
//               Worker is terminated on timeout to prevent hangs.
//
//  C++/Java/Go/Rust → Sent to /api/execute (Wandbox, no auth).
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
    // Load Pyodide from jsDelivr CDN
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

// ── Run Python via Pyodide ───────────────────────────────────
async function runPython(
  code:  string,
  stdin: string
): Promise<{ stdout: string; stderr: string }> {
  const pyodide = await getPyodide();

  // Capture stdout + stderr
  let stdout = '';
  let stderr = '';
  pyodide.setStdout({ batched: (s: string) => { stdout += s + '\n'; } });
  pyodide.setStderr({ batched: (s: string) => { stderr += s + '\n'; } });

  // Simulate stdin: pre-split lines, patch builtins.input()
  const lines = stdin ? stdin.split('\n') : [];
  pyodide.globals.set('__stdin_lines__', pyodide.toPy(lines));
  pyodide.runPython(`
import builtins as __builtins__
__stdin_idx__ = 0
def __patched_input__(prompt=''):
    global __stdin_idx__
    line = __stdin_lines__[__stdin_idx__] if __stdin_idx__ < len(__stdin_lines__) else ''
    __stdin_idx__ += 1
    return line
__builtins__.input = __patched_input__
import sys
sys.stdin = __import__('io').StringIO(${JSON.stringify(stdin || '')})
  `);

  try {
    await pyodide.runPythonAsync(code);
  } catch (e: any) {
    stderr += e.message || String(e);
  }

  return { stdout: stdout.trimEnd(), stderr: stderr.trimEnd() };
}

// ── Run JavaScript in an isolated Web Worker ─────────────────
function runJavaScript(
  code:    string,
  stdin:   string,
  timeout: number = 5000
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const workerCode = `
      const __lines__ = ${JSON.stringify(stdin ? stdin.split('\\n') : [])};
      let __lineIdx__ = 0;
      const __logs__ = [];

      // Patch console.log
      self.console = {
        log:   (...a) => __logs__.push(a.map(String).join(' ')),
        error: (...a) => __logs__.push('[err] ' + a.map(String).join(' ')),
        warn:  (...a) => __logs__.push('[warn] ' + a.map(String).join(' ')),
      };

      // Fake readline / input helpers common in competitive coding
      self.readline  = () => __lines__[__lineIdx__++] ?? '';
      self.readLine  = self.readline;
      self.input     = self.readline;
      self.requires  = () => {};

      // Fake require('fs').readFileSync('/dev/stdin') pattern
      self.require = (mod) => {
        if (mod === 'fs') {
          return {
            readFileSync: () => ${JSON.stringify(stdin || '')},
          };
        }
        throw new Error('require is not supported in browser sandbox');
      };

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

// ── Main entrypoint ──────────────────────────────────────────
export type ExecutionStrategy = 'browser' | 'server';

export function getStrategy(language: string): ExecutionStrategy {
  return language === 'python' || language === 'javascript' ? 'browser' : 'server';
}

export async function runInBrowser(
  sourceCode: string,
  language:   string,
  testCases:  { input: string; expected: string }[],
  onProgress?: (done: number, total: number) => void
): Promise<RunResult> {
  if (!testCases.length) return { passed: 0, total: 0, results: [] };

  const results: TestResult[] = [];

  // Run sequentially so Pyodide state doesn't collide between test cases
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    try {
      const t0  = Date.now();
      const out = language === 'python'
        ? await runPython(sourceCode, tc.input)
        : await runJavaScript(sourceCode, tc.input);
      const ms = Date.now() - t0;

      const actual   = (out.stdout || '').trim();
      const expected = String(tc.expected).trim();
      const ok       = actual === expected;

      results.push({
        input: tc.input, expected, actual, ok,
        error: out.stderr || undefined,
        time:  `${ms}ms`,
      });
    } catch (e: any) {
      results.push({
        input: tc.input, expected: String(tc.expected).trim(),
        actual: '', ok: false, error: e.message || 'Execution error',
      });
    }
    onProgress?.(i + 1, testCases.length);
  }

  return { passed: results.filter(r => r.ok).length, total: results.length, results };
}

export async function runOnServer(
  sourceCode: string,
  language:   string,
  testCases:  { input: string; expected: string }[]
): Promise<RunResult> {
  const res = await fetch('/api/execute', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: sourceCode, language, test_cases: testCases }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Execution failed');
  return data as RunResult;
}
