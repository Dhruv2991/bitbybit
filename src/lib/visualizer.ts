// ════════════════════════════════════════════════════════════
// src/lib/visualizer.ts
// Line-by-line execution tracer powered by Pyodide.
//
// Key behaviour:
//   - Users write only their function (LeetCode-style).
//   - We detect the function name, inject a call with the
//     first test-case's JSON arguments, then trace through
//     the entire execution so every line inside the function
//     body is stepped through.
//   - The tracer uses Python's sys.settrace so no user code
//     modifications are needed.
//   - Line numbers in ExecStep are 1-based and refer to the
//     user's own code (harness lines are pre-pended but the
//     trace is filtered to only capture user-code lines).
//
// Quota:
//   - 15 visualizer runs per day, stored in localStorage.
//   - Resets at midnight local time.
// ════════════════════════════════════════════════════════════

export interface ExecStep {
  /** 1-based line number in the user's original code */
  line:      number;
  /** Snapshot of local variables at this step */
  variables: Record<string, string>;
  /** stdout captured up to this step */
  stdout?:   string;
}

export interface TraceResult {
  steps:  ExecStep[];
  stdout: string;
  stderr: string;
  error?: string;
}

// ── Daily quota helpers ───────────────────────────────────────

const QUOTA_KEY   = 'bb_viz_quota';
const DAILY_LIMIT = 15;

interface QuotaRecord { date: string; used: number; }

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getVisualizerQuota(): { used: number; limit: number; remaining: number } {
  try {
    const raw = localStorage.getItem(QUOTA_KEY);
    if (raw) {
      const rec: QuotaRecord = JSON.parse(raw);
      if (rec.date === todayStr()) {
        return { used: rec.used, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - rec.used) };
      }
    }
  } catch {}
  return { used: 0, limit: DAILY_LIMIT, remaining: DAILY_LIMIT };
}

function incrementQuota(): void {
  try {
    const today = todayStr();
    const raw   = localStorage.getItem(QUOTA_KEY);
    let used    = 1;
    if (raw) {
      const rec: QuotaRecord = JSON.parse(raw);
      used = rec.date === today ? rec.used + 1 : 1;
    }
    localStorage.setItem(QUOTA_KEY, JSON.stringify({ date: today, used }));
  } catch {}
}

// ── Access gate ───────────────────────────────────────────────

export type VisualizerGateResult =
  | { ok: true }
  | { ok: false; reason: 'not_subscriber' }
  | { ok: false; reason: 'quota_exceeded'; used: number; limit: number };

export function checkVisualizerAccess(
  user: { is_subscriber?: boolean } | null,
): VisualizerGateResult {
  if (!user?.is_subscriber) {
    return { ok: false, reason: 'not_subscriber' };
  }
  const { used, limit } = getVisualizerQuota();
  if (used >= limit) {
    return { ok: false, reason: 'quota_exceeded', used, limit };
  }
  return { ok: true };
}

// ── Extract function name from Python code ────────────────────

function extractPythonFuncName(code: string): string | null {
  const m = code.match(/^def\s+(\w+)\s*\(/m);
  return m ? m[1] : null;
}

// ── Build the full traced harness ────────────────────────────
//
// Strategy:
//   1. Pre-pend boilerplate (sys, io, tracer setup) — N_PREFIX lines.
//   2. Embed user code via exec() so it lives at "<string>" filename.
//   3. The tracer hook filters to filename == "<user>" (we compile
//      user code with that filename) so ONLY user lines are captured.
//   4. After user code is exec'd, inject a call:
//        fn(*json.loads(inputJson))
//      This makes the function body actually run.
//   5. Line numbers reported are relative to the start of the user
//      code block so they map 1:1 onto the editor.
//
// inputJson: JSON array of arguments, e.g. [[2,7,11,15], 9]
// If inputJson is null/empty we still call the function with no args
// (useful for functions that take no parameters or for basic scripts).

function buildTracerHarness(userCode: string, inputJson: string | null): string {
  const fnName     = extractPythonFuncName(userCode);
  const argsJson   = JSON.stringify(inputJson ?? '[]');   // double-encode for safe embedding
  const userJson   = JSON.stringify(userCode);            // safe embed of user code

  // Build the call line: fn(*args) if a function was detected, otherwise nothing
  // (the exec already ran the top-level code)
  const callPart = fnName
    ? `
# ── Auto-injected call so the function body actually executes ──
import json as __json__
try:
    __viz_args__ = __json__.loads(${argsJson})
    if not isinstance(__viz_args__, list):
        __viz_args__ = [__viz_args__]
    ${fnName}(*__viz_args__)
except Exception as __call_exc__:
    __err__ = __err__ or __tb__.format_exc()
`.trim()
    : '# (no function detected — tracing top-level code)';

  return `
import sys as __sys__, json as __json__, io as __io__, traceback as __tb__

# ── Capture stdout ────────────────────────────────────────────
__trace_steps__ = []
__real_stdout__ = __sys__.stdout
__cap_stdout__  = __io__.StringIO()
__sys__.stdout  = __cap_stdout__

# ── Safe value repr (truncate huge structures) ────────────────
def __safe_repr__(v):
    try:
        r = repr(v)
        return r if len(r) <= 400 else r[:397] + '…'
    except Exception:
        return '<unrepresentable>'

# ── Tracer: only capture lines inside the user's code ─────────
# We compile user code with filename '<user>' so we can filter
# accurately — harness lines (filename '<string>') are ignored.
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

# ── Step 1: define the user's function (exec with '<user>' filename) ──
__err__ = ''
__user_globals__ = {}
try:
    exec(compile(${userJson}, '<user>', 'exec'), __user_globals__)
except Exception:
    __err__ = __tb__.format_exc()

# ── Step 2: call the function so its body is traced ──────────
if not __err__:
    try:
        __viz_args__ = __json__.loads(${argsJson})
        if not isinstance(__viz_args__, list):
            __viz_args__ = [__viz_args__]
        ${fnName ? `__user_globals__['${fnName}'](*__viz_args__)` : 'pass  # no function detected'}
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

// ── Pyodide singleton ─────────────────────────────────────────

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

// ── Main entrypoint ───────────────────────────────────────────

export async function traceCode(
  userCode:    string,
  _language:   string,
  /** JSON-array string of args for the first test case, e.g. '[[2,7,11,15],9]' */
  inputJson:   string | null,
  onProgress?: (msg: string) => void,
): Promise<TraceResult> {
  onProgress?.('Loading Python runtime…');
  const pyodide = await getPyodide();

  onProgress?.('Tracing execution…');
  const harness = buildTracerHarness(userCode, inputJson);

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
      error:  'Tracer produced no output — your code may have a top-level syntax error.',
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

    incrementQuota();

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
