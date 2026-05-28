// ════════════════════════════════════════════════════════════
// src/lib/executor.ts — Server-side Code Execution (Wandbox)
// ════════════════════════════════════════════════════════════
//
// Handles C++, Java, Go, Rust.
// Python and JavaScript run client-side via browserExecutor.ts.
//
// Each language gets a generated main() that:
//   1. Parses the JSON input object.
//   2. Calls the user's function with the extracted args.
//   3. Prints the return value as JSON to stdout.
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

// ── Deep-equal for JSON values ────────────────────────────────
// Order-insensitive for arrays so [0,1] === [1,0] when problem
// allows any valid answer (e.g. Two Sum).
// If a problem requires ordered output, store expected in the same
// order and this will still work correctly.
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

// ── Wandbox compiler IDs ──────────────────────────────────────
const WANDBOX_COMPILER: Record<string, string> = {
  cpp:  'gcc-head',
  java: 'openjdk-head',
  rust: 'rust-head',
  go:   'go-head',
};

// ── Build complete runnable source for each language ──────────
function buildSource(
  userCode:  string,
  language:  string,
  fnName:    string,
  params:    string[],
  inputJson: string,
): string {
  // Escape the JSON string so it's safe to embed inside source code
  const jsonLiteral = JSON.stringify(inputJson);

  switch (language) {

    // ── C++ ──────────────────────────────────────────────────
    // nlohmann/json ships with GCC on Wandbox.
    // Compiled with -std=c++20 so structured bindings and concepts work.
    // User writes:  json fnName(json param1, json param2) { ... }
    // They cast with .get<T>() inside the body.
    case 'cpp': {
      const paramDecls = params.map(p => `json ${p} = __in__["${p}"];`).join('\n    ');
      const callArgs   = params.join(', ');
      return `
#include <bits/stdc++.h>
#include <nlohmann/json.hpp>
using namespace std;
using json = nlohmann::json;

${userCode}

int main() {
    json __in__ = json::parse(${jsonLiteral});
    ${paramDecls}
    json __result__ = ${fnName}(${callArgs});
    cout << __result__.dump() << endl;
    return 0;
}
`.trim();
    }

    // ── Java ─────────────────────────────────────────────────
    // Gson is available on Wandbox OpenJDK.
    // User writes:  public static Object fnName(Object p1, Object p2) { ... }
    // At runtime each param is the natural Java type Gson deserialises to:
    //   JSON array   → List<Object>    (elements may be Double, String, List…)
    //   JSON number  → Double
    //   JSON string  → String
    //   JSON boolean → Boolean
    // Cast inside the body: int t = ((Double) target).intValue();
    case 'java': {
      // Strip "public class Main {" wrapper if user accidentally left it,
      // so we can re-wrap cleanly.
      const cleanCode = userCode
        .replace(/public\s+class\s+Main\s*\{/, 'class Solution {')
        .replace(/\bMain\b/g, 'Solution');

      const paramDecls = params
        .map(p => `Object ${p} = __in__.get("${p}");`)
        .join('\n            ');
      const callArgs = params.join(', ');

      return `
import com.google.gson.*;
import com.google.gson.reflect.TypeToken;
import java.util.*;

${cleanCode}

public class Main {
    public static void main(String[] args) {
        Gson __gson__ = new Gson();
        Map<String, Object> __in__ = __gson__.fromJson(
            ${jsonLiteral},
            new TypeToken<Map<String, Object>>(){}.getType()
        );
        ${paramDecls}
        Object __result__ = Solution.${fnName}(${callArgs});
        System.out.println(__gson__.toJson(__result__));
    }
}
`.trim();
    }

    // ── Go ───────────────────────────────────────────────────
    // Standard library encoding/json only.
    // User writes:  func fnName(p1 interface{}, p2 interface{}) interface{} { ... }
    // JSON numbers decode as float64, arrays as []interface{},
    // objects as map[string]interface{}.
    // Type-assert inside the body: target_ := int(target.(float64))
    case 'go': {
      // Strip "package main" if the user wrote it (we add it ourselves)
      const cleanCode = userCode.replace(/^\s*package\s+main\s*/m, '').trim();

      const paramDecls = params
        .map(p => `${p} := __in__["${p}"]`)
        .join('\n    ');
      const callArgs = params.join(', ');

      return `
package main

import (
    "encoding/json"
    "fmt"
    "os"
)

${cleanCode}

func main() {
    var __in__ map[string]interface{}
    if err := json.Unmarshal([]byte(${jsonLiteral}), &__in__); err != nil {
        fmt.Fprintln(os.Stderr, "input parse error:", err)
        os.Exit(1)
    }
    ${paramDecls}
    __result__ := ${fnName}(${callArgs})
    __out__, _ := json.Marshal(__result__)
    fmt.Println(string(__out__))
}
`.trim();
    }

    // ── Rust ─────────────────────────────────────────────────
    // serde + serde_json ship with Rust on Wandbox.
    // User writes:  fn fnName(p1: Value, p2: Value) -> Value { ... }
    // Extract with .as_array(), .as_i64(), .as_str(), etc.
    case 'rust': {
      const paramDecls = params
        .map(p => `let ${p} = __in__["${p}"].clone();`)
        .join('\n    ');
      const callArgs = params.join(', ');

      return `
use serde_json::Value;

${userCode}

fn main() {
    let __in__: Value = serde_json::from_str(${jsonLiteral}).expect("invalid input JSON");
    ${paramDecls}
    let __result__ = ${fnName}(${callArgs});
    println!("{}", serde_json::to_string(&__result__).unwrap());
}
`.trim();
    }

    default:
      throw new Error(`Unsupported language for server execution: ${language}`);
  }
}

// ── Compiler options per language ────────────────────────────
function compilerOptions(language: string): Record<string, string> {
  switch (language) {
    case 'cpp':  return { 'compiler-option-raw': '-std=c++20' };
    case 'rust': return { 'compiler-option-raw': '--edition 2021' };
    default:     return {};
  }
}

// ── Execute via Wandbox ───────────────────────────────────────
async function executeWithWandbox(
  fullSource: string,
  language:   string,
): Promise<{ stdout: string; stderr: string }> {
  const compiler = WANDBOX_COMPILER[language];
  if (!compiler) throw new Error(`Unsupported language: ${language}`);

  const res = await fetch('https://wandbox.org/api/compile.json', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      compiler,
      code:  fullSource,
      stdin: '',
      ...compilerOptions(language),
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Wandbox error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return {
    stdout: (data.program_output  || '').trim(),
    stderr: ((data.compiler_error || '') + (data.program_error || '')).trim(),
  };
}

// ── Clean up compiler error for display ──────────────────────
// Strip noisy internal paths, keep only the first meaningful line.
function cleanError(stderr: string): string | undefined {
  if (!stderr) return undefined;
  return stderr
    .split('\n')
    .filter(l => l.trim() && !l.includes('wandbox') && !l.startsWith('In file included'))
    .slice(0, 3)
    .join('\n') || stderr.split('\n')[0];
}

// ── Public API ────────────────────────────────────────────────
export async function runAgainstTestCases(
  userCode:  string,
  language:  string,
  fnName:    string,
  params:    string[],
  testCases: { input: string; expected: string }[],
): Promise<RunResult> {
  if (!testCases.length) return { passed: 0, total: 0, results: [] };

  const results: TestResult[] = await Promise.all(
    testCases.map(async (tc): Promise<TestResult> => {
      try {
        const fullSource = buildSource(userCode, language, fnName, params, tc.input);
        const t0  = Date.now();
        const out = await executeWithWandbox(fullSource, language);
        const ms  = Date.now() - t0;

        let actual: unknown;
        try   { actual = JSON.parse(out.stdout); }
        catch { actual = out.stdout; }

        let expected: unknown;
        try   { expected = JSON.parse(tc.expected); }
        catch { expected = tc.expected; }

        const ok = jsonEqual(actual, expected);

        return {
          input:    tc.input,
          expected: tc.expected,
          actual:   out.stdout,
          ok,
          error:    cleanError(out.stderr),
          time:     `${ms}ms`,
        };
      } catch (e: any) {
        return {
          input:    tc.input,
          expected: tc.expected,
          actual:   '',
          ok:       false,
          error:    e.message || 'Execution error',
        };
      }
    })
  );

  return { passed: results.filter(r => r.ok).length, total: results.length, results };
}