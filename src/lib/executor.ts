// ════════════════════════════════════════════════════════════
// src/lib/executor.ts — Server-side Code Execution via Wandbox
// LeetCode-style: user writes function only, we wrap with harness
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

// Verified Wandbox compiler IDs — see https://wandbox.org/api/list.json
const WANDBOX_COMPILER: Record<string, string> = {
  cpp:  'gcc-head',
  java: 'openjdk-21',
  rust: 'rust-head',
  go:   'go-head',
};

// ── Extract function name from user code ─────────────────────
function extractFuncName(code: string, lang: string): string {
  if (lang === 'java') {
    const m = code.match(/public\s+\w[\w<>\[\]]*\s+(\w+)\s*\(/);
    return m?.[1] || 'solution';
  }
  if (lang === 'cpp') {
    const lines = code.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('#'));
    for (const line of lines) {
      const m = line.match(/\w[\w<>:*&\s]+\s+(\w+)\s*\([^)]*\)\s*\{/);
      if (m && !['main','if','for','while','switch'].includes(m[1])) return m[1];
    }
    return 'solution';
  }
  if (lang === 'go') {
    const m = code.match(/func\s+(\w+)\s*\(/);
    return m?.[1] || 'solution';
  }
  if (lang === 'rust') {
    const m = code.match(/fn\s+(\w+)\s*\(/);
    return m?.[1] || 'solution';
  }
  return 'solution';
}

// ── Build complete runnable program with harness ──────────────
// argsJson: JSON array of args e.g. [[2,7,11,15], 9]
function buildFullProgram(userCode: string, lang: string, argsJson: string): string {
  const fn = extractFuncName(userCode, lang);
  const escapedArgs = argsJson.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  switch (lang) {
    case 'java':
      // Wandbox's OpenJDK includes Gson in the classpath
      return [
        'import java.util.*;',
        'import com.google.gson.*;',
        'import com.google.gson.reflect.TypeToken;',
        '',
        userCode.replace(/class\s+\w+/, 'class Main'),
        '',
        '// ── Harness (added by BitByBit) ──',
        'class Runner {',
        '    public static void main(String[] args) throws Exception {',
        `        Gson gson = new Gson();`,
        `        JsonArray __arr__ = JsonParser.parseString("${escapedArgs}").getAsJsonArray();`,
        `        Main sol = new Main();`,
        `        Object result = sol.${fn}(gson.fromJson(__arr__.get(0), Object.class)${argsJson.startsWith('[[') ? ', gson.fromJson(__arr__.get(1), Object.class)' : ''});`,
        `        System.out.println(gson.toJson(result));`,
        '    }',
        '}',
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
        '// ── Harness (added by BitByBit) ──',
        'int main() {',
        `    json __args__ = json::parse("${escapedArgs}");`,
        `    auto __result__ = ${fn}(__args__[0]${argsJson.startsWith('[[') ? ', __args__[1]' : ''});`,
        '    cout << json(__result__).dump() << endl;',
        '    return 0;',
        '}',
      ].join('\n');

    case 'go': {
      // Parse arg count from JSON
      const argCount = (() => { try { return JSON.parse(argsJson).length; } catch { return 1; } })();
      const argRefs = Array.from({ length: argCount }, (_, i) => `args[${i}]`).join(', ');
      return [
        'package main',
        '',
        'import (',
        '    "encoding/json"',
        '    "fmt"',
        ')',
        '',
        userCode,
        '',
        '// ── Harness (added by BitByBit) ──',
        'func main() {',
        `    var args []interface{}`,
        `    json.Unmarshal([]byte(\`${argsJson}\`), &args)`,
        `    result := ${fn}(${argRefs})`,
        '    out, _ := json.Marshal(result)',
        '    fmt.Println(string(out))',
        '}',
      ].join('\n');
    }

    case 'rust':
      return [
        'use serde_json::{Value, json};',
        '',
        userCode,
        '',
        '// ── Harness (added by BitByBit) ──',
        'fn main() {',
        `    let args: Value = serde_json::from_str(r#"${argsJson}"#).unwrap();`,
        `    let result = ${fn}(&args[0], &args[1]);`,
        '    println!("{}", serde_json::to_string(&result).unwrap());',
        '}',
      ].join('\n');

    default:
      return userCode;
  }
}

// ── JSON comparison (handles ordering, whitespace, etc.) ─────
function jsonEqual(a: string, b: string): boolean {
  try {
    const normalize = (v: any): any => {
      if (Array.isArray(v)) return v.map(normalize);
      if (v !== null && typeof v === 'object')
        return Object.fromEntries(Object.entries(v).sort().map(([k, val]) => [k, normalize(val)]));
      return v;
    };
    return JSON.stringify(normalize(JSON.parse(a))) === JSON.stringify(normalize(JSON.parse(b)));
  } catch {
    return a.trim() === b.trim();
  }
}

// ── Execute via Wandbox ───────────────────────────────────────
async function executeWithWandbox(
  fullCode: string,
  language: string,
): Promise<{ stdout: string; stderr: string }> {
  const compiler = WANDBOX_COMPILER[language];
  if (!compiler) throw new Error(`Unsupported language: ${language}`);

  const res = await fetch('https://wandbox.org/api/compile.json', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      compiler,
      code:  fullCode,
      stdin: '',
      ...(language === 'cpp'  && { 'compiler-option-raw': '-std=c++17' }),
      ...(language === 'rust' && { 'compiler-option-raw': '--edition 2021' }),
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Wandbox error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return {
    stdout: data.program_output || '',
    stderr: (data.compiler_error || '') + (data.program_error || ''),
  };
}

// ── Main export ───────────────────────────────────────────────
export async function runAgainstTestCases(
  userCode:  string,
  language:  string,
  testCases: { input: string; expected: string }[]
): Promise<RunResult> {
  if (!testCases.length) return { passed: 0, total: 0, results: [] };

  const results: TestResult[] = await Promise.all(
    testCases.map(async (tc): Promise<TestResult> => {
      try {
        const fullCode = buildFullProgram(userCode, language, tc.input);
        const t0  = Date.now();
        const out = await executeWithWandbox(fullCode, language);
        const ms  = Date.now() - t0;

        const actual   = (out.stdout || '').trim();
        const expected = String(tc.expected).trim();
        const ok       = jsonEqual(actual, expected);
        const error    = out.stderr ? out.stderr.split('\n').filter(Boolean)[0] : undefined;

        return { input: tc.input, expected, actual, ok, error, time: `${ms}ms` };
      } catch (e: any) {
        return {
          input:    tc.input,
          expected: String(tc.expected).trim(),
          actual:   '',
          ok:       false,
          error:    e.message || 'Execution error',
        };
      }
    })
  );

  return { passed: results.filter(r => r.ok).length, total: results.length, results };
}