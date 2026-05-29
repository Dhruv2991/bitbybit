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
    const m = code.match(/function\s+(\w+)\s*\(/);
    return m?.[1] || 'solution';
  }
  if (lang === 'cpp') {
    // match: returnType funcName(
    const m = code.match(/\w[\w<>*&\s]+\s+(\w+)\s*\(/g);
    if (m) {
      const last = m[m.length - 1].trim().match(/(\w+)\s*\($/);
      return last?.[1] || 'solution';
    }
    return 'solution';
  }
  if (lang === 'java') {
    const m = code.match(/public\s+\w+\s+(\w+)\s*\(/);
    return m?.[1] || 'solution';
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
      return [
        'import json',
        '',
        userCode,
        '',
        `__args__ = json.loads(${argsJson})`,
        `__result__ = ${fn}(*(__args__ if isinstance(__args__, list) else [__args__]))`,
        'print(json.dumps(__result__, separators=(",", ":")))',
      ].join('\n');

    case 'javascript':
      return [
        userCode,
        '',
        `const __args__ = JSON.parse(${argsJson});`,
        `const __result__ = ${fn}(...(Array.isArray(__args__) ? __args__ : [__args__]));`,
        'console.log(JSON.stringify(__result__));',
      ].join('\n');

    case 'cpp':
      return [
        '#include <bits/stdc++.h>',
        '#include <nlohmann/json.hpp>',
        'using namespace std;',
        'using json = nlohmann::json;',
        '',
        userCode,
        '',
        'int main() {',
        `    json __args__ = json::parse(${argsJson});`,
        `    auto __result__ = ${fn}(__args__[0], __args__[1]);`,
        '    cout << json(__result__).dump() << endl;',
        '    return 0;',
        '}',
      ].join('\n');

    case 'java':
      return [
        'import com.google.gson.*;',
        'import java.util.*;',
        '',
        userCode.replace('class Solution', 'class Main'),
        '',
        '// Harness (appended by BitByBit)',
        '// Note: full JSON harness requires Gson — Wandbox supports it',
        `// args: ${inputJson}`,
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
    // Fall back to string comparison if not valid JSON
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
      // stub require('fs') in case user code still uses it
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
  testCases: { input: string; expected: string }[],
  onProgress?: (done: number, total: number) => void
): Promise<RunResult> {
  if (!testCases.length) return { passed: 0, total: 0, results: [] };

  const results: TestResult[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
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
  userCode:  string,
  language:  string,
  testCases: { input: string; expected: string }[]
): Promise<RunResult> {
  const res = await fetch('/api/execute', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: userCode, language, test_cases: testCases, use_harness: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Execution failed');
  return data as RunResult;
}