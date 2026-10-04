// ════════════════════════════════════════════════════════════════════════════════════
// src/lib/visualizerInstrumenter.ts
//
// Multi-language code execution and trace harness builder for the
// Line-by-Line Logic Visualizer.
//
// Supports:
//   - Client-side execution: Python (Pyodide), JavaScript (Browser AST/Sandbox).
//   - Server-side compiled execution: C++, Java, Go, Rust (Clean Driver-Based Execution Model).
// ════════════════════════════════════════════════════════════════════════════════════

import type { SupportedLang } from '@/types/database';
import type { ExecStep, TraceResult } from '@/lib/visualizer';
import { formatVariableValue } from '@/lib/parseExecutionStdout';
import {
  JS_PREAMBLE,
  PYTHON_PREAMBLE,
  inspectSignature,
  buildJavaDriverProgram,
  buildCppDriverProgram,
  buildGoDriverProgram,
  buildRustDriverProgram,
  splitCppHeaders,
  splitJavaImports,
  splitGoImports,
  splitRustUses,
  extractParamCount,
  parseHarnessArgs,
} from './leetCodeHarness';

export const BB_TRACE_PREFIX = '__BB_TRACE__:';

// Re-export driver builders for compiled languages
export const buildJavaTraceProgram = buildJavaDriverProgram;
export const buildCppTraceProgram  = buildCppDriverProgram;
export const buildGoTraceProgram   = buildGoDriverProgram;
export const buildRustTraceProgram = buildRustDriverProgram;

export {
  splitCppHeaders,
  splitJavaImports,
  splitGoImports,
  splitRustUses,
  extractParamCount,
  parseHarnessArgs,
};

// ── Function name extractor ──────────────────────────────────────────────────────

export function extractFunctionName(code: string, lang: SupportedLang): string {
  const sig = inspectSignature(code, lang);
  return sig.name || 'solution';
}

// ── JavaScript Client-Side Tracer ────────────────────────────────────────────────

export async function traceJavaScript(
  userCode: string,
  inputJson: string | null
): Promise<TraceResult> {
  const steps: ExecStep[] = [];
  let capturedStdout = '';
  let errorMsg = '';

  try {
    let parsedArgs: any[] = [];
    if (inputJson) {
      try {
        const raw = JSON.parse(inputJson);
        parsedArgs = Array.isArray(raw) ? raw : [raw];
      } catch {
        parsedArgs = [];
      }
    }

    const fnName = extractFunctionName(userCode, 'javascript');
    const rawLines = userCode.split('\n');
    const declaredVars = new Set<string>();

    const paramMatch = userCode.match(/(?:function\s+\w+|\w+)\s*\(([^)]*)\)/);
    if (paramMatch && paramMatch[1]) {
      paramMatch[1].split(',').map(s => s.trim()).filter(Boolean).forEach(p => declaredVars.add(p));
    }

    for (const l of rawLines) {
      const declMatch = l.match(/(?:let|const|var)\s+([\w\s,]+)(?:=|[;\n])/);
      if (declMatch && declMatch[1]) {
        declMatch[1].split(',').forEach(v => {
          const name = v.trim().split(/\s+/)[0];
          if (name && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
            declaredVars.add(name);
          }
        });
      }
    }

    const instrumentedLines: string[] = [];
    let userLineNum = 0;

    for (const line of rawLines) {
      userLineNum++;
      const trimmed = line.trim();

      const isTraceable =
        trimmed !== '' &&
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('/*') &&
        !trimmed.startsWith('*') &&
        !trimmed.startsWith('function') &&
        !trimmed.startsWith('import') &&
        !trimmed.startsWith('export') &&
        trimmed !== '{' &&
        trimmed !== '}';

      if (isTraceable && declaredVars.size > 0) {
        const varObjEntries = Array.from(declaredVars).map(v => `"${v}": (typeof ${v} !== 'undefined' ? ${v} : undefined)`);
        instrumentedLines.push(`__bb_trace__(${userLineNum}, { ${varObjEntries.join(', ')} });`);
      }

      instrumentedLines.push(line);
    }

    const instrumentedCode = instrumentedLines.join('\n');

    const sandboxFn = new Function(
      '__bb_trace__',
      '__bb_print__',
      '__args__',
      `
      ${JS_PREAMBLE}

      const console = {
        log: (...args) => __bb_print__(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        warn: (...args) => __bb_print__(args.join(' ')),
        error: (...args) => __bb_print__(args.join(' ')),
      };

      ${instrumentedCode}

      if (typeof ${fnName} === 'function') {
        return ${fnName}(...__args__);
      }
      `
    );

    const onTrace = (line: number, vars: Record<string, any>) => {
      const formattedVars: Record<string, string> = {};
      for (const [k, v] of Object.entries(vars)) {
        if (!k.startsWith('__') && v !== undefined) {
          formattedVars[k] = formatVariableValue(v);
        }
      }
      steps.push({ line, variables: formattedVars, stdout: capturedStdout });
    };

    const onPrint = (text: string) => {
      capturedStdout += (capturedStdout ? '\n' : '') + text;
    };

    sandboxFn(onTrace, onPrint, parsedArgs);
  } catch (err: any) {
    errorMsg = err.message || String(err);
  }

  return {
    steps,
    stdout: capturedStdout,
    stderr: errorMsg,
    error: errorMsg || undefined,
  };
}
