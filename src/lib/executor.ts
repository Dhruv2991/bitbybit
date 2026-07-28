// ════════════════════════════════════════════════════════════
// src/lib/executor.ts
// Multi-language execution via Judge0 (self-hosted)
//
// All test cases are batched into a single Judge0 call.
// The generated program loops through every test case, printing
// results separated by a sentinel line.
//
// All languages use LeetCode-style harness:
//   - Args are injected as native literals at build time (no runtime JSON parsing)
//   - User writes real typed functions (no json/Value/interface{} wrappers)
//   - Output is serialized with each language's stdlib only
// ════════════════════════════════════════════════════════════

export interface TestResult {
  input: string;
  expected: string;
  actual: string;
  ok: boolean;
  error?: string;
  time?: string;
}

export interface RunResult {
  passed: number;
  total: number;
  results: TestResult[];
}

// Judge0 language IDs
const JUDGE0_LANGUAGE_ID: Record<string, number> = {
  cpp:  54,  // C++ (GCC 9.2.0)
  java: 62,  // Java (OpenJDK 13.0.1)
  rust: 73,  // Rust (1.40.0)
  go:   60,  // Go (1.13.5)
};

// Sentinel printed between test case outputs so we can split the stdout
const SENTINEL = "---CASE---";

// ── Strip user-written headers/imports ────────────────────────
// The harness already supplies its own includes/imports/package
// declaration for cpp/java/go/rust. If the user also writes their
// own (#include, import, package, using namespace) it either
// duplicates what we add or — worse — breaks compilation entirely
// (e.g. an `import` statement inside the generated Java class body,
// or a second `package main` in Go). So for these four languages we
// strip those lines out before embedding the user's code, merging
// any extra imports the user needed into our own header block.
// Python and JS are left completely untouched — the user's own
// imports are kept exactly as written.

interface SanitizedCode {
  body:  string;    // user code with header lines removed
  extra: string[];  // any additional import/package identifiers found (go/java only)
}

function sanitizeUserCode(code: string, lang: string): SanitizedCode {
  if (lang === "cpp") {
    // We no longer include the catch-all <bits/stdc++.h> (see buildBatchedProgram),
    // so any specific header the user wrote (e.g. <cstring>, <tuple>) might be one
    // we don't already provide — collect it instead of silently discarding it.
    const extra: string[] = [];
    const body = code
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        if (/^using\s+namespace\s+std\s*;?$/.test(t)) return false;
        const m = t.match(/^#include\s*[<"]([^">]+)[">]\s*$/);
        if (m) { extra.push(m[1]); return false; }
        return true;
      })
      .join("\n");
    return { body, extra: Array.from(new Set(extra)) };
  }

  if (lang === "java") {
    const extra: string[] = [];
    const body = code
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        if (/^package\s+[\w.]+\s*;$/.test(t)) return false;
        const m = t.match(/^import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;$/);
        if (m) {
          if (m[1] !== "java.util.*") extra.push(m[1]);
          return false;
        }
        return true;
      })
      .join("\n");
    return { body, extra };
  }

  if (lang === "go") {
    const extra: string[] = [];
    // Strip a multi-line `import ( ... )` block, collecting the paths inside it.
    let stripped = code.replace(/import\s*\(([\s\S]*?)\)/g, (_m, inner: string) => {
      const paths = inner.match(/"[^"]+"/g) || [];
      for (const p of paths) {
        const pkg = p.slice(1, -1);
        if (pkg !== "encoding/json" && pkg !== "fmt") extra.push(pkg);
      }
      return "";
    });
    // Strip single-line `import "pkg"`.
    stripped = stripped.replace(/^\s*import\s+"([^"]+)"\s*$/gm, (_m, pkg: string) => {
      if (pkg !== "encoding/json" && pkg !== "fmt") extra.push(pkg);
      return "";
    });
    // Strip the package declaration (we always declare `package main` ourselves).
    stripped = stripped.replace(/^\s*package\s+\w+\s*$/m, "");
    return { body: stripped, extra: Array.from(new Set(extra)) };
  }

  if (lang === "rust") {
    // Rust doesn't get wrapped in a class/package, so there's no structural
    // conflict — but strip crate-level attributes some users paste in from
    // LeetCode/Codeforces templates, since those must appear first in the file.
    const body = code
      .split("\n")
      .filter((line) => !/^\s*#!\[.*\]\s*$/.test(line))
      .join("\n");
    return { body, extra: [] };
  }

  // python / javascript: leave completely untouched
  return { body: code, extra: [] };
}

// ── Extract function name from user code ─────────────────────

function extractFuncName(code: string, lang: string): string {
  if (lang === "java") {
    const m = code.match(
      /(?:public|private|protected|static|\s)+[\w<>\[\]]+\s+(\w+)\s*\(/,
    );
    return m?.[1] || "solution";
  }
  if (lang === "cpp") {
    const lines = code
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("#"));
    for (const line of lines) {
      const m = line.match(/\w[\w<>:*&\s]+\s+(\w+)\s*\([^)]*\)\s*\{/);
      if (m && !["main", "if", "for", "while", "switch"].includes(m[1])) {
        return m[1];
      }
    }
    return "solution";
  }
  if (lang === "go") {
    const m = code.match(/func\s+(\w+)\s*\(/);
    return m?.[1] || "solution";
  }
  if (lang === "rust") {
    const m = code.match(/fn\s+(\w+)\s*\(/);
    return m?.[1] || "solution";
  }
  return "solution";
}

// ── Convert a parsed JS value into a native language literal ─

function toNativeLiteral(value: any, lang: string): string {
  if (value === null || value === undefined) {
    switch (lang) {
      case "cpp":  return "nullptr";
      case "rust": return "None";
      case "go":   return "nil";
      case "java": return "null";
      default:     return "null";
    }
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(value);
  }

  if (typeof value === "string") {
    const escaped = value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");
    if (lang === "cpp")  return `std::string("${escaped}")`;
    if (lang === "rust") return `String::from("${escaped}")`;
    return `"${escaped}"`;
  }

  if (Array.isArray(value)) {
    const items = value.map((v) => toNativeLiteral(v, lang));

    if (lang === "cpp") {
      if (value.length === 0) return "{}";
      return `{${items.join(", ")}}`;
    }

    if (lang === "go") {
      if (value.length === 0) return "[]interface{}{}";
      const first = value[0];
      if (typeof first === "number" && Number.isInteger(first)) {
        if (Array.isArray(first)) return `[][]int{${items.join(", ")}}`;
        return `[]int{${items.join(", ")}}`;
      }
      if (typeof first === "string") return `[]string{${items.join(", ")}}`;
      if (typeof first === "boolean") return `[]bool{${items.join(", ")}}`;
      if (Array.isArray(first)) {
        const inner = value.map(
          (row) =>
            `[]int{${(row as any[]).map((v: any) => toNativeLiteral(v, lang)).join(", ")}}`,
        );
        return `[][]int{${inner.join(", ")}}`;
      }
      return `[]interface{}{${items.join(", ")}}`;
    }

    if (lang === "rust") {
      if (value.length === 0) return "vec![]";
      return `vec![${items.join(", ")}]`;
    }

    if (lang === "java") {
      return `new int[]{${items.join(", ")}}`;
    }
  }

  return JSON.stringify(value);
}

// ── Type inference helpers ───────────────────────────────────

function cppType(value: any): string {
  if (value === null || value === undefined) return "void*";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number")
    return Number.isInteger(value) ? "int" : "double";
  if (typeof value === "string") return "std::string";
  if (Array.isArray(value)) {
    if (value.length === 0) return "std::vector<int>";
    const first = value[0];
    if (Array.isArray(first)) {
      const inner =
        first.length > 0 && typeof first[0] === "string"
          ? "std::string"
          : "int";
      return `std::vector<std::vector<${inner}>>`;
    }
    if (typeof first === "string") return "std::vector<std::string>";
    if (typeof first === "boolean") return "std::vector<bool>";
    return "std::vector<int>";
  }
  return "auto";
}

function goType(value: any): string {
  if (value === null || value === undefined) return "interface{}";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number")
    return Number.isInteger(value) ? "int" : "float64";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]int";
    const first = value[0];
    if (Array.isArray(first)) {
      return `[][]${goType(first[0] ?? 0)}`;
    }
    return `[]${goType(first)}`;
  }
  return "interface{}";
}

function rustType(value: any): string {
  if (value === null || value === undefined) return "Option<i32>";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "i32" : "f64";
  if (typeof value === "string") return "String";
  if (Array.isArray(value)) {
    if (value.length === 0) return "Vec<i32>";
    const first = value[0];
    if (Array.isArray(first)) {
      return `Vec<Vec<${rustType(first[0] ?? 0)}>>`;
    }
    return `Vec<${rustType(first)}>`;
  }
  return "i32";
}

// ── Serialize result back to JSON for comparison ─────────────

function cppSerializer(resultExpr: string, returnType: string): string {
  if (returnType.includes("vector<vector")) {
    return [
      `    auto __r__ = ${resultExpr};`,
      '    cout << "[";',
      "    for (size_t __i__ = 0; __i__ < __r__.size(); ++__i__) {",
      '        if (__i__) cout << ",";',
      '        cout << "[";',
      "        for (size_t __j__ = 0; __j__ < __r__[__i__].size(); ++__j__) {",
      '            if (__j__) cout << ",";',
      "            cout << __r__[__i__][__j__];",
      "        }",
      '        cout << "]";',
      "    }",
      '    cout << "]" << endl;',
    ].join("\n");
  }
  if (returnType.includes("vector<string")) {
    return [
      `    auto __r__ = ${resultExpr};`,
      '    cout << "[";',
      "    for (size_t __i__ = 0; __i__ < __r__.size(); ++__i__) {",
      '        if (__i__) cout << ",";',
      '        cout << "\\"" << __r__[__i__] << "\\"";',
      "    }",
      '    cout << "]" << endl;',
    ].join("\n");
  }
  if (returnType.includes("vector")) {
    return [
      `    auto __r__ = ${resultExpr};`,
      '    cout << "[";',
      "    for (size_t __i__ = 0; __i__ < __r__.size(); ++__i__) {",
      '        if (__i__) cout << ",";',
      "        cout << __r__[__i__];",
      "    }",
      '    cout << "]" << endl;',
    ].join("\n");
  }
  if (returnType === "string" || returnType === "std::string") {
    return `    cout << "\\"" << (${resultExpr}) << "\\"" << endl;`;
  }
  if (returnType === "bool") {
    return `    cout << ((${resultExpr}) ? "true" : "false") << endl;`;
  }
  return `    cout << (${resultExpr}) << endl;`;
}

function detectCppReturnType(code: string): string {
  const lines = code
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("#"));
  for (const line of lines) {
    const m = line.match(/^([\w:<>\*&\s]+?)\s+\w+\s*\(/);
    if (m) {
      const rt = m[1].trim();
      if (!["if", "for", "while", "switch", "return"].includes(rt)) {
        return rt;
      }
    }
  }
  return "auto";
}

// ── Build a single batched program (all test cases, one compile) ─

function buildBatchedProgram(
  rawUserCode: string,
  lang: string,
  testCases: { input: string; expected: string }[],
): string {
  const { body: userCode, extra: extraImports } = sanitizeUserCode(rawUserCode, lang);
  const fn = extractFuncName(userCode, lang);

  const parsedArgs: any[][] = testCases.map((tc) => {
    try {
      const v = JSON.parse(tc.input);
      return Array.isArray(v) ? v : [v];
    } catch {
      return [];
    }
  });

  switch (lang) {
    case "cpp": {
      const returnType = detectCppReturnType(userCode);

      const caseBlocks = parsedArgs.map((args, idx) => {
        const decls = args
          .map((arg, i) => {
            const type    = cppType(arg);
            const literal = toNativeLiteral(arg, "cpp");
            return `    ${type} __a${idx}_${i}__ = ${literal};`;
          })
          .join("\n");
        const callArgs   = args.map((_, i) => `__a${idx}_${i}__`).join(", ");
        const printBlock = cppSerializer(`${fn}(${callArgs})`, returnType);
        return [
          `    // case ${idx}`,
          decls,
          printBlock,
          `    cout << "${SENTINEL}" << endl;`,
        ].join("\n");
      });

      return [
        // Deliberately using the catch-all <bits/stdc++.h> here rather than
        // a hand-picked list of headers: it's slightly slower to parse, but
        // it guarantees every standard-library facility a solution might use
        // (memset, INT_MAX, tuple, pair helpers, etc.) is always available,
        // even if the user's own code never explicitly included it — which
        // is how most LeetCode-style starter code is written. A narrower
        // header set was tried and caused real solutions to silently fail
        // to compile, which is far worse than a bit of extra compile time.
        "#include <bits/stdc++.h>",
        "using namespace std;",
        "",
        userCode,
        "",
        "int main() {",
        caseBlocks.join("\n"),
        "    return 0;",
        "}",
      ].join("\n");
    }

    case "java": {
      const caseBlocks = parsedArgs.map((args, idx) => {
        const javaArgs = args
          .map((v) => {
            if (typeof v === "string") return JSON.stringify(v);
            if (typeof v === "number") return String(v);
            if (typeof v === "boolean") return v ? "true" : "false";
            if (Array.isArray(v)) {
              if (!v.length) return "new int[]{}";
              if (typeof v[0] === "number") return `new int[]{${v.join(",")}}`;
              if (typeof v[0] === "string")
                return `new String[]{${v.map((x) => JSON.stringify(x)).join(",")}}`;
              if (Array.isArray(v[0])) {
                const rows = v
                  .map((row: any[]) => `new int[]{${row.join(",")}}`)
                  .join(", ");
                return `new int[][]{${rows}}`;
              }
            }
            return JSON.stringify(v);
          })
          .join(", ");

        return [
          `        // case ${idx}`,
          `        { Object __r__ = sol.${fn}(${javaArgs});`,
          "          if (__r__ instanceof int[][]) {",
          '              System.out.println(Arrays.deepToString((int[][]) __r__).replace(" ", ""));',
          "          } else if (__r__ instanceof int[]) {",
          '              System.out.println(Arrays.toString((int[]) __r__).replace(" ", ""));',
          "          } else if (__r__ instanceof String[]) {",
          '              System.out.println(Arrays.toString((String[]) __r__).replace(" ", ""));',
          "          } else {",
          "              System.out.println(__r__);",
          "          }",
          `          System.out.println("${SENTINEL}"); }`,
        ].join("\n");
      });

      const extraJavaImports = extraImports.map((p) => `import ${p};`).join("\n");
      return [
        "import java.util.*;",
        extraJavaImports,
        "",
        "class Main {",
        "",
        userCode,
        "",
        "    public static void main(String[] args) {",
        "        Main sol = new Main();",
        caseBlocks.join("\n"),
        "    }",
        "}",
      ].join("\n");
    }

    case "go": {
      const caseBlocks = parsedArgs.map((args, idx) => {
        const decls = args
          .map((arg, i) => {
            const type    = goType(arg);
            const literal = toNativeLiteral(arg, "go");
            return `    var __a${idx}_${i}__ ${type} = ${literal}`;
          })
          .join("\n");
        const callArgs = args.map((_, i) => `__a${idx}_${i}__`).join(", ");
        return [
          `    // case ${idx}`,
          decls,
          `    { __out__, _ := json.Marshal(${fn}(${callArgs})); fmt.Println(string(__out__)) }`,
          `    fmt.Println("${SENTINEL}")`,
        ].join("\n");
      });

      const extraGoImports = extraImports.map((p) => `    "${p}"`).join("\n");
      return [
        "package main",
        "",
        "import (",
        '    "encoding/json"',
        '    "fmt"',
        extraGoImports,
        ")",
        "",
        userCode,
        "",
        "func main() {",
        caseBlocks.join("\n"),
        "}",
      ].join("\n");
    }

    case "rust": {
      const rustReturnMatch = userCode.match(/fn\s+\w+[^)]*\)\s*->\s*([\w<>]+)/);
      const rustReturnHint  = rustReturnMatch?.[1] || "";
      const isVec           = rustReturnHint.startsWith("Vec");
      const printFmt        = isVec ? '"{:?}"' : '"{}"';

      const caseBlocks = parsedArgs.map((args, idx) => {
        const decls = args
          .map((arg, i) => {
            const type    = rustType(arg);
            const literal = toNativeLiteral(arg, "rust");
            return `    let __a${idx}_${i}__: ${type} = ${literal};`;
          })
          .join("\n");
        const callArgs = args.map((_, i) => `__a${idx}_${i}__`).join(", ");
        return [
          `    // case ${idx}`,
          decls,
          `    println!(${printFmt}, ${fn}(${callArgs}));`,
          `    println!("${SENTINEL}");`,
        ].join("\n");
      });

      return [
        userCode,
        "",
        "fn main() {",
        caseBlocks.join("\n"),
        "}",
      ].join("\n");
    }

    default:
      return userCode;
  }
}

// ── JSON equality (order-insensitive for objects) ────────────

function jsonEqual(a: string, b: string): boolean {
  try {
    const normalize = (v: any): any => {
      if (Array.isArray(v)) return v.map(normalize);
      if (v !== null && typeof v === "object")
        return Object.fromEntries(
          Object.entries(v)
            .sort()
            .map(([k, val]) => [k, normalize(val)]),
        );
      return v;
    };
    const cleanA = a.replace(/\s+/g, "");
    const cleanB = b.replace(/\s+/g, "");
    return (
      JSON.stringify(normalize(JSON.parse(cleanA))) ===
      JSON.stringify(normalize(JSON.parse(cleanB)))
    );
  } catch {
    return a.trim() === b.trim();
  }
}

// ── Judge0 execution ─────────────────────────────────────────

async function executeWithJudge0(
  fullCode: string,
  language: string,
): Promise<{ stdout: string; stderr: string }> {
  const languageId = JUDGE0_LANGUAGE_ID[language];
  if (!languageId) throw new Error(`Unsupported language: ${language}`);

  const base = process.env.JUDGE0_URL || "http://localhost:2358";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.JUDGE0_AUTH_TOKEN) {
    headers["X-Auth-Token"] = process.env.JUDGE0_AUTH_TOKEN;
  }

  const submitRes = await fetch(`${base}/submissions?wait=true`, {
    method: "POST",
    headers,
    body: JSON.stringify({
  source_code: fullCode,
  language_id: languageId,
  stdin: "",
  cpu_time_limit: 10,
  compile_timeout: 30,
  wall_time_limit: 15,
}),
    signal: AbortSignal.timeout(30000),
  });

  if (!submitRes.ok) {
    const body = await submitRes.text();
    throw new Error(`Judge0 error ${submitRes.status}: ${body}`);
  }

  const data = await submitRes.json();
const stdout = data.stdout ?? "";
const stderr =
  (data.stderr ?? "") +
  (data.compile_output ??"");

  return { stdout, stderr };
}

// ── Wandbox language compiler map ────────────────────────────

const WANDBOX_COMPILER: Record<string, string> = {
  cpp:  "gcc-head",
  java: "openjdk-jdk-22+36",
  rust: "rust-1.82.0",
  go:   "go-1.23.2",
};

// ── Wandbox fallback execution ────────────────────────────────

async function executeWithWandbox(
  fullCode: string,
  language: string,
): Promise<{ stdout: string; stderr: string }> {
  const compiler = WANDBOX_COMPILER[language];
  if (!compiler) throw new Error(`Wandbox: unsupported language: ${language}`);

  const res = await fetch("https://wandbox.org/api/compile.json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ compiler, code: fullCode }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Wandbox error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return {
    stdout: data.program_output ?? "",
    stderr: (data.compiler_error ?? "") + (data.program_error ?? ""),
  };
}

// ── Public API ───────────────────────────────────────────────
//
// IMPORTANT: compiled languages (cpp/java/go/rust) are compiled
// ONCE and all test cases run inside that same binary in a single
// Judge0 call. Compilation is by far the slowest part of running
// C++/Java/Go/Rust — recompiling per test case (one full compile
// per case) multiplies total run time by the number of cases for
// no benefit, since the cases themselves execute in milliseconds.
// So we batch them together like before, and report progress by
// revealing each parsed result in turn once the single call returns.
//
// runSingleTestCase() below still exists (e.g. for isolated re-runs
// of a single case) but the main multi-case path uses one call.

export async function runSingleTestCase(
  userCode: string,
  language: string,
  testCase: { input: string; expected: string },
): Promise<TestResult> {
  const program = buildBatchedProgram(userCode, language, [testCase]);
  const t0 = Date.now();
  let stdout = "";
  let stderr = "";

  try {
    const out = await executeWithJudge0(program, language);
    stdout = out.stdout;
    stderr = out.stderr;
  } catch (e: any) {
    console.warn("[executor] Judge0 failed, trying Wandbox fallback:", e.message);
    try {
      const out = await executeWithWandbox(program, language);
      stdout = out.stdout;
      stderr = out.stderr;
    } catch (e2: any) {
      return {
        input:    testCase.input,
        expected: String(testCase.expected).trim(),
        actual:   "",
        ok:       false,
        error:    e2.message || "Execution error",
      };
    }
  }

  const ms = Date.now() - t0;
  const rawOutput = stdout.split(SENTINEL + "\n")[0]?.trim() ?? "";
  const actual    = rawOutput.replace(/\s+/g, "");
  const expected  = String(testCase.expected).trim().replace(/\s+/g, "");
  const ok        = jsonEqual(actual, expected);

  return {
    input:    testCase.input,
    expected: String(testCase.expected).trim(),
    actual:   rawOutput,
    ok,
    error:    stderr || undefined,
    time:     `${ms}ms`,
  };
}

export async function runAgainstTestCases(
  userCode: string,
  language: string,
  testCases: { input: string; expected: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<RunResult> {
  if (!testCases.length) return { passed: 0, total: 0, results: [] };

  const batchedCode = buildBatchedProgram(userCode, language, testCases);
  const t0 = Date.now();
  let stdout = "";
  let stderr = "";

  try {
    const out = await executeWithJudge0(batchedCode, language);
    stdout = out.stdout;
    stderr = out.stderr;
  } catch (e: any) {
    console.warn("[executor] Judge0 failed, trying Wandbox fallback:", e.message);
    try {
      const out = await executeWithWandbox(batchedCode, language);
      stdout = out.stdout;
      stderr = out.stderr;
    } catch (e2: any) {
      const errMsg = e2.message || "Execution error";
      const results = testCases.map((tc) => ({
        input:    tc.input,
        expected: String(tc.expected).trim(),
        actual:   "",
        ok:       false,
        error:    errMsg,
      }));
      results.forEach((_, i) => onProgress?.(i + 1, testCases.length));
      return { passed: 0, total: testCases.length, results };
    }
  }

  const totalMs = Date.now() - t0;
  const rawBlocks = stdout.split(SENTINEL + "\n");
  if (rawBlocks[rawBlocks.length - 1].trim() === "") rawBlocks.pop();

  const results: TestResult[] = testCases.map((tc, idx) => {
    const rawOutput = (rawBlocks[idx] ?? "").trim();
    const actual    = rawOutput.replace(/\s+/g, "");
    const expected  = String(tc.expected).trim().replace(/\s+/g, "");
    const ok        = jsonEqual(actual, expected);

    const result: TestResult = {
      input:    tc.input,
      expected: String(tc.expected).trim(),
      actual:   rawOutput,
      ok,
      error:    stderr || undefined,
      time:     `~${Math.round(totalMs / testCases.length)}ms`,
    };
    onProgress?.(idx + 1, testCases.length);
    return result;
  });

  return {
    passed: results.filter((r) => r.ok).length,
    total:  results.length,
    results,
  };
}