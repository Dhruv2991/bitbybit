// ════════════════════════════════════════════════════════════
// src/lib/visualizer.ts
// Multi-language Line-by-Line Execution Tracer & Tiered Quota Manager.
//
// Features:
//   - Client-side execution: Python (Pyodide), JavaScript (Browser AST/Sandbox).
//   - Compiled execution: C++, Java, Go, Rust (Judge0 with Wandbox fallback).
//   - Tiered Daily Quotas:
//       • Free Users:  5 runs / day
//       • Pro Users:  50 runs / day
//       • Automatic 24-hour / midnight calendar day reset.
// ════════════════════════════════════════════════════════════

import type { SupportedLang } from '@/types/database';
import { parseExecutionStdout } from '@/lib/parseExecutionStdout';
import {
  traceJavaScript,
  buildCppTraceProgram,
  buildJavaTraceProgram,
  buildGoTraceProgram,
  buildRustTraceProgram,
} from '@/lib/visualizerInstrumenter';

export interface ExecStep {
  /** 1-based line number in the user's original code */
  line:      number;
  /** Snapshot of local variables at this step */
  variables: Record<string, string>;
  /** stdout captured up to this step */
  stdout?:   string;
}

export interface TraceResult {
  steps:   ExecStep[];
  stdout:  string;
  stderr:  string;
  error?:  string;
}

// ── Daily Quota Limits & State ────────────────────────────────

export const FREE_DAILY_LIMIT = 5;
export const PRO_DAILY_LIMIT  = 50;

const QUOTA_KEY_PREFIX = 'bb_viz_quota_v2';

interface QuotaRecord {
  date: string;
  used: number;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function quotaKey(userGithub?: string): string {
  return userGithub ? `${QUOTA_KEY_PREFIX}_${userGithub}` : `${QUOTA_KEY_PREFIX}_anon`;
}

export interface QuotaStatus {
  used:      number;
  limit:     number;
  remaining: number;
  isPro:     boolean;
  resetsIn:  string;
}

export function msUntilMidnight(): string {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diffMs = midnight.getTime() - now.getTime();
  const hrs = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

export function getVisualizerQuota(
  isSubscriber: boolean = false,
  userGithub?: string
): QuotaStatus {
  const limit = isSubscriber ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
  const today = todayStr();
  const key   = quotaKey(userGithub);

  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const record: QuotaRecord = JSON.parse(raw);
      if (record.date === today) {
        const used = Math.min(record.used, limit);
        return {
          used,
          limit,
          remaining: Math.max(0, limit - used),
          isPro: isSubscriber,
          resetsIn: msUntilMidnight(),
        };
      }
    }
  } catch {}

  return {
    used: 0,
    limit,
    remaining: limit,
    isPro: isSubscriber,
    resetsIn: msUntilMidnight(),
  };
}

export function decrementVisualizerQuota(
  isSubscriber: boolean = false,
  userGithub?: string
): QuotaStatus {
  const limit = isSubscriber ? PRO_DAILY_LIMIT : FREE_DAILY_LIMIT;
  const today = todayStr();
  const key   = quotaKey(userGithub);

  let used = 1;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const record: QuotaRecord = JSON.parse(raw);
      used = record.date === today ? record.used + 1 : 1;
    }
    localStorage.setItem(key, JSON.stringify({ date: today, used }));
  } catch {}

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    isPro: isSubscriber,
    resetsIn: msUntilMidnight(),
  };
}

// ── Access Gate Checker ───────────────────────────────────────

export type VisualizerGateResult =
  | { ok: true; remaining: number; limit: number; isPro: boolean }
  | { ok: false; reason: 'free_limit_reached' | 'pro_limit_reached'; used: number; limit: number };

export function checkVisualizerAccess(
  user: { is_subscriber?: boolean; github?: string } | null
): VisualizerGateResult {
  const isSubscriber = !!user?.is_subscriber;
  const quota = getVisualizerQuota(isSubscriber, user?.github);

  if (quota.remaining <= 0) {
    return {
      ok: false,
      reason: isSubscriber ? 'pro_limit_reached' : 'free_limit_reached',
      used: quota.used,
      limit: quota.limit,
    };
  }

  return {
    ok: true,
    remaining: quota.remaining,
    limit: quota.limit,
    isPro: isSubscriber,
  };
}

// ── Python Tracing via Pyodide ────────────────────────────────

function extractPythonFuncName(code: string): string | null {
  const m = code.match(/^def\s+(\w+)\s*\(/m);
  return m ? m[1] : null;
}

function buildPythonTracerHarness(userCode: string, inputJson: string | null): string {
  const fnName   = extractPythonFuncName(userCode);
  const argsJson = JSON.stringify(inputJson ?? '[]');
  const userJson = JSON.stringify(userCode);

  return `
import sys as __sys__, json as __json__, io as __io__, traceback as __tb__

__trace_steps__ = []
__real_stdout__ = __sys__.stdout
__cap_stdout__  = __io__.StringIO()
__sys__.stdout  = __cap_stdout__

def __safe_repr__(v):
    try:
        r = repr(v)
        return r if len(r) <= 400 else r[:397] + '…'
    except Exception:
        return '<unrepresentable>'

def __tracer__(frame, event, arg):
    if event == 'line' and frame.f_code.co_filename == '<user>':
        snap = {}
        for k, v in frame.f_locals.items():
            if not k.startswith('__'):
                snap[k] = __safe_repr__(v)
        __trace_steps__.append({
            'line': frame.f_lineno,
            'variables': snap,
            'stdout': __cap_stdout__.getvalue(),
        })
    return __tracer__

__sys__.settrace(__tracer__)

__err__ = ''
__user_globals__ = {}
try:
    exec(compile(${userJson}, '<user>', 'exec'), __user_globals__)
except Exception:
    __err__ = __tb__.format_exc()

if not __err__:
    try:
        __viz_args__ = __json__.loads(${argsJson})
        if not isinstance(__viz_args__, list):
            __viz_args__ = [__viz_args__]
        ${fnName ? `__user_globals__['${fnName}'](*__viz_args__)` : 'pass'}
    except Exception:
        __err__ = __err__ or __tb__.format_exc()

__sys__.settrace(None)
__sys__.stdout = __real_stdout__

print('---TRACE_PAYLOAD---')
print(__json__.dumps({
    'steps': __trace_steps__,
    'stdout': __cap_stdout__.getvalue(),
    'error': __err__,
}))
`.trim();
}

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

async function tracePython(
  userCode: string,
  inputJson: string | null,
  onProgress?: (msg: string) => void
): Promise<TraceResult> {
  onProgress?.('Loading Python runtime (Pyodide)…');
  const pyodide = await getPyodide();

  onProgress?.('Executing step-by-step trace…');
  const harness = buildPythonTracerHarness(userCode, inputJson);

  let rawOut = '';
  let rawErr = '';
  pyodide.setStdout({ batched: (s: string) => { rawOut += s + '\n'; } });
  pyodide.setStderr({ batched: (s: string) => { rawErr += s + '\n'; } });

  try {
    await pyodide.runPythonAsync(harness);
  } catch (e: any) {
    rawErr += e.message || String(e);
  } finally {
    pyodide.setStdout({ batched: () => {} });
    pyodide.setStderr({ batched: () => {} });
  }

  const sentinel = '---TRACE_PAYLOAD---\n';
  const splitIdx = rawOut.lastIndexOf(sentinel);

  if (splitIdx === -1) {
    return {
      steps:  [],
      stdout: rawOut.trimEnd(),
      stderr: rawErr.trimEnd(),
      error:  'Tracer produced no output — verify your syntax.',
    };
  }

  const beforePayload = rawOut.slice(0, splitIdx).trimEnd();
  const payloadStr    = rawOut.slice(splitIdx + sentinel.length).trim();

  try {
    const payload = JSON.parse(payloadStr) as {
      steps: Array<{ line: number; variables: Record<string, string>; stdout: string }>;
      stdout: string;
      error:  string;
    };

    return {
      steps:  payload.steps,
      stdout: payload.stdout || beforePayload,
      stderr: rawErr.trimEnd(),
      error:  payload.error || undefined,
    };
  } catch {
    return {
      steps:  [],
      stdout: beforePayload,
      stderr: rawErr.trimEnd(),
      error:  'Failed to parse trace payload.',
    };
  }
}

// ── Compiled Languages Server Trace Dispatcher ───────────────

async function traceCompiledOnServer(
  instrumentedCode: string,
  language: SupportedLang,
  onProgress?: (msg: string) => void
): Promise<TraceResult> {
  onProgress?.(`Dispatching ${language} trace to sandbox…`);

  const res = await fetch('/api/visualize/trace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: instrumentedCode, language }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Server trace compilation failed');
  }

  const { steps, cleanStdout } = parseExecutionStdout(data.stdout || '');

  return {
    steps,
    stdout: cleanStdout,
    stderr: data.stderr || '',
    error:  data.stderr ? `Compiler/Runtime notes:\n${data.stderr}` : undefined,
  };
}

// ── Main Multi-Language Entrypoint ────────────────────────────

export async function traceCode(
  userCode:    string,
  language:    SupportedLang,
  inputJson:   string | null,
  onProgress?: (msg: string) => void,
  user?:       { is_subscriber?: boolean; github?: string } | null
): Promise<TraceResult> {
  let result: TraceResult;

  switch (language) {
    case 'python':
      result = await tracePython(userCode, inputJson, onProgress);
      break;

    case 'javascript':
      onProgress?.('Tracing JavaScript in browser…');
      result = await traceJavaScript(userCode, inputJson);
      break;

    case 'cpp': {
      const code = buildCppTraceProgram(userCode, inputJson);
      result = await traceCompiledOnServer(code, 'cpp', onProgress);
      break;
    }

    case 'java': {
      const code = buildJavaTraceProgram(userCode, inputJson);
      result = await traceCompiledOnServer(code, 'java', onProgress);
      break;
    }

    case 'go': {
      const code = buildGoTraceProgram(userCode, inputJson);
      result = await traceCompiledOnServer(code, 'go', onProgress);
      break;
    }

    case 'rust': {
      const code = buildRustTraceProgram(userCode, inputJson);
      result = await traceCompiledOnServer(code, 'rust', onProgress);
      break;
    }

    default:
      throw new Error(`Unsupported language for visualizer: ${language}`);
  }

  // Decrement quota only upon successful trace processing
  decrementVisualizerQuota(!!user?.is_subscriber, user?.github);

  return result;
}
