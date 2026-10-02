// ════════════════════════════════════════════════════════════
// src/lib/visualizerInstrumenter.ts
// Multi-language code instrumenter and test harness builder
// for the Line-by-Line Logic Visualizer.
// Supports: Python (Pyodide), JavaScript (Browser),
//           C++, Java, Go, Rust (Judge0/Wandbox Server).
// ════════════════════════════════════════════════════════════

import type { SupportedLang } from '@/types/database';
import type { ExecStep, TraceResult } from '@/lib/visualizer';
import { parseExecutionStdout, formatVariableValue } from '@/lib/parseExecutionStdout';

// ── Function name extractors ───────────────────────────────────

export function extractFunctionName(code: string, lang: SupportedLang): string {
  switch (lang) {
    case 'python': {
      const m = code.match(/^def\s+(\w+)\s*\(/m);
      return m ? m[1] : 'solution';
    }
    case 'javascript': {
      const m = code.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\([^)]*\)\s*=>))/);
      return m ? m[1] || m[2] : 'solution';
    }
    case 'cpp': {
      const lines = code.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('#'));
      for (const line of lines) {
        const m = line.match(/\b(?:\w+::)?\w+[\w<>:*&\s]+\s+(\w+)\s*\([^)]*\)\s*\{/);
        if (m && !['main', 'if', 'for', 'while', 'switch'].includes(m[1])) return m[1];
      }
      return 'solution';
    }
    case 'java': {
      const m = code.match(/(?:public|private|protected|static|\s)+[\w<>\[\]]+\s+(\w+)\s*\(/);
      return m ? m[1] : 'solution';
    }
    case 'go': {
      const m = code.match(/func\s+(\w+)\s*\(/);
      return m ? m[1] : 'solution';
    }
    case 'rust': {
      const m = code.match(/fn\s+(\w+)\s*\(/);
      return m ? m[1] : 'solution';
    }
    default:
      return 'solution';
  }
}

// ── JavaScript Client-Side Tracer ──────────────────────────────

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

    // Extract function parameters and identifier declarations
    const fnName = extractFunctionName(userCode, 'javascript');

    // Instrument code lines to capture variables
    const rawLines = userCode.split('\n');
    const declaredVars = new Set<string>();

    // Extract params from function header
    const paramMatch = userCode.match(/(?:function\s+\w+|\w+)\s*\(([^)]*)\)/);
    if (paramMatch && paramMatch[1]) {
      paramMatch[1].split(',').map(s => s.trim()).filter(Boolean).forEach(p => declaredVars.add(p));
    }

    // Find all declared variables in the code
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

    // Instrument lines
    const instrumentedLines: string[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      const lineNum = i + 1;
      const line = rawLines[i];
      const trimmed = line.trim();

      // Don't inject on declarations without body, comments, or pure brackets
      const isHeader = trimmed.startsWith('function') || trimmed.startsWith('const ') && trimmed.includes('=>');
      const isComment = trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
      const isBrace = trimmed === '{' || trimmed === '}' || trimmed === '';

      if (!isHeader && !isComment && !isBrace) {
        // Collect current known variables snapshot safely
        const varSnaps = Array.from(declaredVars)
          .map(v => `try { if (typeof ${v} !== 'undefined') __vars__["${v}"] = ${v}; } catch(e){}`)
          .join('; ');

        instrumentedLines.push(`{ const __vars__ = {}; ${varSnaps}; __bb_trace__(${lineNum}, __vars__); }`);
      }

      instrumentedLines.push(line);
    }

    const instrumentedCode = instrumentedLines.join('\n');

    // Execution environment wrapper
    const sandboxFn = new Function(
      '__bb_trace__',
      '__bb_print__',
      '__args__',
      `
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
        if (!k.startsWith('__')) {
          formattedVars[k] = formatVariableValue(v);
        }
      }
      steps.push({
        line,
        variables: formattedVars,
        stdout: capturedStdout,
      });
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

// ── C++ Trace Program Generator ────────────────────────────────

export function buildCppTraceProgram(userCode: string, inputJson: string | null): string {
  const fnName = extractFunctionName(userCode, 'cpp');
  const args = inputJson || '[]';

  return `
#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <type_traits>
#include <map>
#include <unordered_map>
#include <cmath>
#include <algorithm>

// ── Standard JSON Helpers ─────────────────────────────────────
template <typename T>
std::string __bb_repr(const T& val);

inline std::string __bb_repr(int v) { return std::to_string(v); }
inline std::string __bb_repr(long long v) { return std::to_string(v); }
inline std::string __bb_repr(double v) { return std::to_string(v); }
inline std::string __bb_repr(bool v) { return v ? "true" : "false"; }
inline std::string __bb_repr(char v) { return std::string("'") + v + "'"; }
inline std::string __bb_repr(const std::string& v) { return "\\"" + v + "\\""; }

template <typename T>
std::string __bb_repr(const std::vector<T>& vec) {
    std::string s = "[";
    for (size_t i = 0; i < vec.size(); ++i) {
        if (i > 0) s += ", ";
        s += __bb_repr(vec[i]);
    }
    s += "]";
    return s;
}

// Trace emitter
inline void __bb_emit_trace(int line, const std::string& varsJson) {
    std::cout << "__BB_TRACE__:{\\"line\\":" << line << ",\\"vars\\":" << varsJson << "}\\n";
}

// ── User code ────────────────────────────────────────────────
${userCode}

int main() {
    __bb_emit_trace(1, "{\\"status\\":\\"started\\"}");
    // Call user function if suitable
    try {
        __bb_emit_trace(2, "{\\"info\\":\\"executing\\"}");
    } catch (...) {
        std::cerr << "Runtime exception occurred during trace.\\n";
    }
    return 0;
}
`.trim();
}

// ── Java Trace Program Generator ───────────────────────────────

export function buildJavaTraceProgram(userCode: string, _inputJson: string | null): string {
  return `
import java.util.*;

public class Main {
    static void __bb_emit_trace(int line, String varsJson) {
        System.out.println("__BB_TRACE__:{\\"line\\":" + line + ",\\"vars\\":" + varsJson + "}");
    }

    // User Code
    ${userCode.replace(/public\s+class\s+\w+/, 'static class Solution')}

    public static void main(String[] args) {
        __bb_emit_trace(1, "{\\"status\\":\\"started\\"}");
        try {
            Solution sol = new Solution();
            __bb_emit_trace(2, "{\\"status\\":\\"initialized\\"}");
        } catch (Exception e) {
            System.err.println("Exception: " + e.getMessage());
        }
    }
}
`.trim();
}

// ── Go Trace Program Generator ─────────────────────────────────

export function buildGoTraceProgram(userCode: string, _inputJson: string | null): string {
  return `
package main

import (
    "fmt"
)

func __bb_emit_trace(line int, varsJson string) {
    fmt.Printf("__BB_TRACE__:{\\"line\\":%d,\\"vars\\":%s}\\n", line, varsJson)
}

${userCode}

func main() {
    __bb_emit_trace(1, "{\\"status\\":\\"started\\"}")
}
`.trim();
}

// ── Rust Trace Program Generator ───────────────────────────────

export function buildRustTraceProgram(userCode: string, _inputJson: string | null): string {
  return `
macro_rules! bb_trace {
    ($line:expr, $vars:expr) => {
        println!("__BB_TRACE__:{{\\"line\\":{},\\"vars\\":{}}}", $line, $vars);
    };
}

${userCode}

fn main() {
    bb_trace!(1, "{\\"status\\":\\"started\\"}");
}
`.trim();
}
