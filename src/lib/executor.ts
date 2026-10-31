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
//
// FIX #1: argument types are inferred ONCE PER ARGUMENT POSITION across
// ALL test cases in the batch (not per-case), so an empty array `[]`
// in one case can't silently declare the wrong type (e.g. vector<int>
// instead of vector<vector<int>>) and break the whole compiled batch.
//
// FIX #2: each C++ test case's generated code is now wrapped in its own
// `{ }` block scope. Previously all cases were flattened directly into
// main()'s top-level scope, so any case using cppSerializer's vector-
// printing branch (which declares `auto __r__ = ...;`) would collide
// with every other vector-returning case's own `__r__` declaration —
// "conflicting declaration 'auto __r__'" compile errors. Scoping each
// case in braces gives every case's locals (including __r__ and the
// __aN_M__ argument variables) their own lifetime, eliminating the
// collision entirely.
// ════════════════════════════════════════════════════════════

export interface TestResult {
  input: string;
  expected: string;
  actual: string;
  ok: boolean;
  error?: string;
  time?: string;
  is_hidden?: boolean;
}

export interface RunResult {
  passed: number;
  total: number;
  results: TestResult[];
  hidden_passed?: number;
  hidden_total?: number;
  points_awarded?: number;
  is_first_solve?: boolean;
  streak?: number;
  isVictory?: boolean;
}

// Judge0 language IDs
const JUDGE0_LANGUAGE_ID: Record<string, number> = {
  cpp:        54,  // C++ (GCC 9.2.0)
  java:       62,  // Java (OpenJDK 13.0.1)
  rust:       73,  // Rust (1.40.0)
  go:         60,  // Go (1.13.5)
  python:     71,  // Python (3.8.1)
  javascript: 63,  // JavaScript (Node.js 12.14.0)
};

// Sentinel printed between test case outputs so we can split the stdout
const SENTINEL = "---CASE---";

// ── Extract function name from user code ─────────────────────

function extractFuncName(code: string, lang: string): string {
  if (lang === "python") {
    const m = code.match(/def\s+(\w+)\s*\(/);
    return m?.[1] || "solution";
  }
  if (lang === "javascript") {
    const m = code.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\([^)]*\)\s*=>))/);
    return m?.[1] || m?.[2] || "solution";
  }
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
        const innerType = first.length > 0 && typeof first[0] === "string" ? "string" : "int";
        const inner = value.map(
          (row) =>
            `[]${innerType}{${(row as any[]).map((v: any) => toNativeLiteral(v, lang)).join(", ")}}`,
        );
        return `[][]${innerType}{${inner.join(", ")}}`;
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

// ── Type inference helpers (single value) ────────────────────

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

// ── Infer a type per argument POSITION across ALL cases ───────
//
// Empty arrays carry no element-type information, so a single
// empty-array test case must never be allowed to decide the type
// for that argument position on its own. We scan every test case
// for that position and prefer the first one that gives us real
// (non-empty) type information. Only if EVERY case at that position
// is an empty array do we fall back to a generic type.

function inferArgTypesAcrossCases(
  parsedArgs: any[][],
  typeFn: (value: any) => string,
  fallback: string,
): string[] {
  const numArgs = parsedArgs.reduce(
    (max, args) => Math.max(max, args.length),
    0,
  );

  const argTypes: string[] = [];
  for (let i = 0; i < numArgs; i++) {
    let chosen: string | null = null;

    for (const args of parsedArgs) {
      const v = args[i];
      if (v === undefined) continue;

      const isEmptyArray = Array.isArray(v) && v.length === 0;
      if (isEmptyArray) {
        // Only use this as a last resort if nothing better is found
        if (chosen === null) chosen = typeFn(v);
        continue;
      }

      // Non-empty value: definitive type info, use it and stop.
      chosen = typeFn(v);
      break;
    }

    argTypes.push(chosen ?? fallback);
  }

  return argTypes;
}

// ── Serialize result back to JSON for comparison ─────────────

function cppSerializer(resultExpr: string, returnType: string): string {
  if (returnType.includes("vector<vector")) {
    return [
      `        auto __r__ = ${resultExpr};`,
      '        cout << "[";',
      "        for (size_t __i__ = 0; __i__ < __r__.size(); ++__i__) {",
      '            if (__i__) cout << ",";',
      '            cout << "[";',
      "            for (size_t __j__ = 0; __j__ < __r__[__i__].size(); ++__j__) {",
      '                if (__j__) cout << ",";',
      "                auto __val__ = __r__[__i__][__j__];",
      "                cout << __val__;",
      "            }",
      '            cout << "]";',
      "        }",
      '        cout << "]" << endl;',
    ].join("\n");
  }
  if (returnType.includes("vector<string")) {
    return [
      `        auto __r__ = ${resultExpr};`,
      '        cout << "[";',
      "        for (size_t __i__ = 0; __i__ < __r__.size(); ++__i__) {",
      '            if (__i__) cout << ",";',
      "            auto __val__ = __r__[__i__];",
      '            cout << "\\"" << __val__ << "\\"";',
      "        }",
      '        cout << "]" << endl;',
    ].join("\n");
  }
  if (returnType.includes("vector<bool")) {
    return [
      `        auto __r__ = ${resultExpr};`,
      '        cout << "[";',
      "        for (size_t __i__ = 0; __i__ < __r__.size(); ++__i__) {",
      '            if (__i__) cout << ",";',
      "            bool __val__ = __r__[__i__];",
      '            cout << (__val__ ? "true" : "false");',
      "        }",
      '        cout << "]" << endl;',
    ].join("\n");
  }
  if (returnType.includes("vector")) {
    return [
      `        auto __r__ = ${resultExpr};`,
      '        cout << "[";',
      "        for (size_t __i__ = 0; __i__ < __r__.size(); ++__i__) {",
      '            if (__i__) cout << ",";',
      "            auto __val__ = __r__[__i__];",
      "            cout << __val__;",
      "        }",
      '        cout << "]" << endl;',
    ].join("\n");
  }
  if (returnType === "string" || returnType === "std::string") {
    return `        cout << "\\"" << (${resultExpr}) << "\\"" << endl;`;
  }
  if (returnType === "bool") {
    return `        cout << ((${resultExpr}) ? "true" : "false") << endl;`;
  }
  return `        cout << (${resultExpr}) << endl;`;
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

export function buildBatchedProgram(
  userCode: string,
  lang: string,
  testCases: { input: string; expected: string; is_hidden?: boolean }[],
  includeSentinel = true,
): string {
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

      // Infer each argument position's type ONCE across all cases,
      // so an empty-array case can't clobber a nested-array type.
      const argTypes = inferArgTypesAcrossCases(
        parsedArgs,
        cppType,
        "std::vector<int>",
      );

      const caseBlocks = parsedArgs.map((args, idx) => {
        const decls = args
          .map((arg, i) => {
            const type    = argTypes[i] ?? cppType(arg);
            const literal = toNativeLiteral(arg, "cpp");
            return `        ${type} __a${idx}_${i}__ = ${literal};`;
          })
          .join("\n");
        const callArgs   = args.map((_, i) => `__a${idx}_${i}__`).join(", ");
        const printBlock = cppSerializer(`${fn}(${callArgs})`, returnType);
        // FIX: each case wrapped in its own { } block so locals like
        // __r__ and __aN_M__ don't collide with other cases' locals
        // in the same main() scope.
        return [
          `    { // case ${idx}`,
          decls,
          printBlock,
          ...(includeSentinel ? [`        cout << "${SENTINEL}" << endl;`] : []),
          `    }`,
        ].join("\n");
      });

      return [
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
              if (typeof v[0] === "boolean")
                return `new boolean[]{${v.join(",")}}`;
              if (Array.isArray(v[0])) {
                if (v[0].length > 0 && typeof v[0][0] === "string") {
                  const rows = v
                    .map((row: any[]) => `new String[]{${row.map((x) => JSON.stringify(x)).join(", ")}}`)
                    .join(", ");
                  return `new String[][]{${rows}}`;
                }
                const rows = v
                  .map((row: any[]) => `new int[]{${row.join(", ")}}`)
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
          ...(includeSentinel ? [`          System.out.println("${SENTINEL}"); }`] : ["        }"]),
        ].join("\n");
      });

      return [
        "import java.util.*;",
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
      // Infer each argument position's type ONCE across all cases.
      const argTypes = inferArgTypesAcrossCases(parsedArgs, goType, "[]int");

      // Go also flattens variable declarations (`var __aN_M__ ...`) into
      // one shared function scope, but since every variable name already
      // includes the unique case index `idx`, there's no name collision
      // risk here the way C++'s fixed `__r__` name created. Left as-is,
      // but wrapped in braces too for consistency and future-proofing.
      const caseBlocks = parsedArgs.map((args, idx) => {
        const decls = args
          .map((arg, i) => {
            const type    = argTypes[i] ?? goType(arg);
            const literal = toNativeLiteral(arg, "go");
            return `        var __a${idx}_${i}__ ${type} = ${literal}`;
          })
          .join("\n");
        const callArgs = args.map((_, i) => `__a${idx}_${i}__`).join(", ");
        return [
          `    { // case ${idx}`,
          decls,
          `        __out__, _ := json.Marshal(${fn}(${callArgs}))`,
          `        fmt.Println(string(__out__))`,
          ...(includeSentinel ? [`        fmt.Println("${SENTINEL}")`] : []),
          `    }`,
        ].join("\n");
      });

      return [
        "package main",
        "",
        "import (",
        '    "encoding/json"',
        '    "fmt"',
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

      // Infer each argument position's type ONCE across all cases.
      const argTypes = inferArgTypesAcrossCases(parsedArgs, rustType, "Vec<i32>");

      // Rust's `let` bindings are already uniquely named per case (via idx),
      // and Rust scoping/shadowing rules don't hard-error the way C++'s flat
      // `auto __r__` redeclaration did — but wrapped in braces anyway for
      // consistency and to guarantee each case's locals are dropped/cleaned
      // up immediately after that case runs.
      const caseBlocks = parsedArgs.map((args, idx) => {
        const decls = args
          .map((arg, i) => {
            const type    = argTypes[i] ?? rustType(arg);
            const literal = toNativeLiteral(arg, "rust");
            return `        let __a${idx}_${i}__: ${type} = ${literal};`;
          })
          .join("\n");
        const callArgs = args.map((_, i) => `__a${idx}_${i}__`).join(", ");
        return [
          `    { // case ${idx}`,
          decls,
          `        println!(${printFmt}, ${fn}(${callArgs}));`,
          ...(includeSentinel ? [`        println!("${SENTINEL}");`] : []),
          `    }`,
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

    case "python": {
      const caseBlocks = parsedArgs.map((args, idx) => {
        const argsJson = JSON.stringify(JSON.stringify(args));
        return [
          `# case ${idx}`,
          `__args__ = json.loads(${argsJson})`,
          `__res__ = ${fn}(*(__args__ if isinstance(__args__, list) else [__args__]))`,
          `print(json.dumps(__res__, separators=(",", ":")))`,
          ...(includeSentinel ? [`print("${SENTINEL}")`] : []),
        ].join("\n");
      });

      return [
        "import json",
        "",
        userCode,
        "",
        "if __name__ == '__main__':",
        caseBlocks.map(b => b.split("\n").map(l => `    ${l}`).join("\n")).join("\n"),
      ].join("\n");
    }

    case "javascript": {
      const caseBlocks = parsedArgs.map((args, idx) => {
        const argsJson = JSON.stringify(JSON.stringify(args));
        return [
          `// case ${idx}`,
          `(() => {`,
          `  const __args__ = JSON.parse(${argsJson});`,
          `  const __fn__ = typeof ${fn} !== 'undefined' ? ${fn} : solution;`,
          `  const __res__ = __fn__(...(Array.isArray(__args__) ? __args__ : [__args__]));`,
          `  console.log(JSON.stringify(__res__));`,
          ...(includeSentinel ? [`  console.log("${SENTINEL}");`] : []),
          `})();`,
        ].join("\n");
      });

      return [
        userCode,
        "",
        caseBlocks.join("\n"),
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

let judge0OfflineUntil = 0;

export async function submitToJudge0(
  fullCode: string,
  language: string,
): Promise<{ token: string }> {
  const languageId = JUDGE0_LANGUAGE_ID[language];
  if (!languageId) throw new Error(`Unsupported language: ${language}`);

  const base = process.env.JUDGE0_URL || "http://localhost:2358";

  if (Date.now() < judge0OfflineUntil) {
    throw new Error("Judge0 recently unreachable; circuit open");
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (process.env.JUDGE0_AUTH_TOKEN) {
      headers["X-Auth-Token"] = process.env.JUDGE0_AUTH_TOKEN;
    }

    // Submit with wait=false to bypass Vercel 10s serverless timeout
    const submitRes = await fetch(`${base}/submissions?wait=false`, {
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
      signal: AbortSignal.timeout(15000),
    });

    if (!submitRes.ok) {
      const body = await submitRes.text();
      throw new Error(`Judge0 error ${submitRes.status}: ${body}`);
    }

    const data = await submitRes.json();
    if (!data.token) {
      throw new Error("Judge0 response missing submission token");
    }

    return { token: data.token };
  } catch (err) {
    judge0OfflineUntil = Date.now() + 60000;
    throw err;
  }
}

export interface Judge0SubmissionResult {
  token?: string;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  time: string | null;
  memory: number | null;
  status: {
    id: number;
    description: string;
  };
}

export async function getJudge0Submission(token: string): Promise<Judge0SubmissionResult> {
  const base = process.env.JUDGE0_URL || "http://localhost:2358";
  const headers: Record<string, string> = {};
  if (process.env.JUDGE0_AUTH_TOKEN) {
    headers["X-Auth-Token"] = process.env.JUDGE0_AUTH_TOKEN;
  }

  const res = await fetch(`${base}/submissions/${token}?base64_encoded=false`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Judge0 status error ${res.status}: ${text}`);
  }

  return await res.json();
}

export interface PendingSubmission {
  token: string;
  problem_id?: string;
  mode?: 'run' | 'submit' | 'duel';
  duel_id?: string;
  testCases: { input: string; expected: string; is_hidden?: boolean }[];
  user?: { github: string; name: string };
  code?: string;
  language?: string;
  problemTitle?: string;
  problemPoints?: number;
  isWeekly?: boolean;
  createdAt: number;
}

export const pendingSubmissions = new Map<string, PendingSubmission>();

export function prunePendingSubmissions(): void {
  const now = Date.now();
  for (const [token, item] of pendingSubmissions.entries()) {
    if (now - item.createdAt > 15 * 60 * 1000) {
      pendingSubmissions.delete(token);
    }
  }
}

export function evaluateJudge0Output(
  submission: Judge0SubmissionResult,
  testCases: { input: string; expected: string; is_hidden?: boolean }[],
): RunResult {
  const statusId = submission.status?.id ?? 0;
  const statusDesc = submission.status?.description || "Unknown";

  // Compilation Error (status id 6)
  if (statusId === 6) {
    const compileErr = (submission.compile_output || submission.stderr || statusDesc).trim();
    return {
      passed: 0,
      total: testCases.length,
      results: testCases.map(tc => ({
        input: tc.input,
        expected: String(tc.expected).trim(),
        actual: "",
        ok: false,
        error: compileErr || "Compilation error",
        is_hidden: tc.is_hidden,
      })),
    };
  }

  // Time Limit Exceeded (status id 5)
  if (statusId === 5) {
    return {
      passed: 0,
      total: testCases.length,
      results: testCases.map(tc => ({
        input: tc.input,
        expected: String(tc.expected).trim(),
        actual: "",
        ok: false,
        error: "Time Limit Exceeded (10s)",
        is_hidden: tc.is_hidden,
      })),
    };
  }

  const stdout = submission.stdout || "";
  const stderr = ((submission.stderr || "") + (submission.compile_output || "") + (submission.message || "")).trim();

  const rawBlocks = stdout.split(SENTINEL + "\n");
  if (rawBlocks[rawBlocks.length - 1]?.trim() === "") rawBlocks.pop();

  const totalTime = submission.time ? `${Math.round(parseFloat(submission.time) * 1000)}ms` : undefined;

  const results: TestResult[] = testCases.map((tc, idx) => {
    const rawOutput = (rawBlocks[idx] ?? "").trim();
    const actual    = rawOutput.replace(/\s+/g, "");
    const expected  = String(tc.expected).trim().replace(/\s+/g, "");
    const ok        = jsonEqual(actual, expected);

    return {
      input:     tc.input,
      expected:  String(tc.expected).trim(),
      actual:    rawOutput,
      ok,
      error:     ok ? undefined : (stderr || undefined),
      time:      totalTime ? `~${Math.round((parseFloat(submission.time || "0") * 1000) / testCases.length)}ms` : undefined,
      is_hidden: tc.is_hidden,
    };
  });

  return {
    passed: results.filter(r => r.ok).length,
    total:  results.length,
    results,
  };
}

async function executeWithJudge0(
  fullCode: string,
  language: string,
): Promise<{ stdout: string; stderr: string }> {
  const languageId = JUDGE0_LANGUAGE_ID[language];
  if (!languageId) throw new Error(`Unsupported language: ${language}`);

  const base = process.env.JUDGE0_URL || "http://localhost:2358";

  if (Date.now() < judge0OfflineUntil) {
    throw new Error("Judge0 recently unreachable; circuit open");
  }

  try {
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
      signal: AbortSignal.timeout(2500),
    });

    if (!submitRes.ok) {
      const body = await submitRes.text();
      throw new Error(`Judge0 error ${submitRes.status}: ${body}`);
    }

    const data = await submitRes.json();
    const stdout = data.stdout ?? "";
    const stderr =
      (data.stderr ?? "") +
      (data.compile_output ?? "");

    return { stdout, stderr };
  } catch (err) {
    judge0OfflineUntil = Date.now() + 60000;
    throw err;
  }
}

// ── Wandbox language compiler map ────────────────────────────

const WANDBOX_COMPILER: Record<string, string> = {
  cpp:        "gcc-head",
  java:       "openjdk-jdk-22+36",
  rust:       "rust-1.82.0",
  go:         "go-1.23.2",
  python:     "cpython-3.12.7",
  javascript: "nodejs-20.17.0",
};

// ── Wandbox fallback execution ────────────────────────────────

async function executeWithWandbox(
  fullCode: string,
  language: string,
  stdin?: string,
): Promise<{ stdout: string; stderr: string }> {
  const compiler = WANDBOX_COMPILER[language];
  if (!compiler) throw new Error(`Wandbox: unsupported language: ${language}`);

  let lastErr: any;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const payload: Record<string, any> = { compiler, code: fullCode };
      if (stdin !== undefined) {
        payload.stdin = stdin;
      }
      const res = await fetch("https://wandbox.org/api/compile.json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      const bodyText = await res.text();

      if (!res.ok) {
        if (res.status >= 500 && attempt < 3) {
          await new Promise((r) => setTimeout(r, attempt * 500));
          continue;
        }
        throw new Error(`Wandbox error ${res.status}: ${bodyText}`);
      }

      let data: any;
      try {
        data = JSON.parse(bodyText);
      } catch {
        throw new Error(`Wandbox invalid response: ${bodyText.slice(0, 200)}`);
      }

      return {
        stdout: data.program_output ?? "",
        stderr: (data.compiler_error ?? "") + (data.program_error ?? ""),
      };
    } catch (err: any) {
      lastErr = err;
      if (
        attempt < 3 &&
        (err.name === "AbortError" ||
          err.name === "TypeError" ||
          err.message?.includes("fetch failed") ||
          err.message?.includes("timeout"))
      ) {
        await new Promise((r) => setTimeout(r, attempt * 500));
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error("Wandbox execution failed after retries");
}

// ── Public API ───────────────────────────────────────────────

/**
 * Execute raw source code directly via Judge0 (with Wandbox fallback).
 * Used for compiled language logic visualizer traces and arbitrary single-file runs.
 */
export async function executeRawProgram(
  fullCode: string,
  language: string,
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await executeWithJudge0(fullCode, language);
  } catch (e: any) {
    console.warn('[executor] Judge0 raw execution failed, falling back to Wandbox:', e.message);
    return await executeWithWandbox(fullCode, language);
  }
}

// runAgainstTestCases:
// 1. Primary path: Judge0 fully batched (all cases in a single compile + run, separated by SENTINEL)
// 2. Fallback path: Wandbox sequential single-case execution (running cases one by one without SENTINEL)

export async function runAgainstTestCases(
  userCode: string,
  language: string,
  testCases: { input: string; expected: string; is_hidden?: boolean }[],
  options?: { allowFallback?: boolean },
): Promise<RunResult> {
  if (!testCases.length) return { passed: 0, total: 0, results: [] };

  const allowFallback = options?.allowFallback ?? true;

  // 1. Primary Judge0 execution path (fully batched with SENTINEL)
  const batchedCode = buildBatchedProgram(userCode, language, testCases, true);
  const t0 = Date.now();

  try {
    const out = await executeWithJudge0(batchedCode, language);
    const totalMs = Date.now() - t0;

    const rawBlocks = (out.stdout || "").split(SENTINEL + "\n");
    if (rawBlocks[rawBlocks.length - 1]?.trim() === "") rawBlocks.pop();

    const results: TestResult[] = testCases.map((tc, idx) => {
      const rawOutput = (rawBlocks[idx] ?? "").trim();
      const actual    = rawOutput.replace(/\s+/g, "");
      const expected  = String(tc.expected).trim().replace(/\s+/g, "");
      const ok        = jsonEqual(actual, expected);

      return {
        input:     tc.input,
        expected:  String(tc.expected).trim(),
        actual:    rawOutput,
        ok,
        error:     out.stderr || undefined,
        time:      `~${Math.round(totalMs / testCases.length)}ms`,
        is_hidden: tc.is_hidden,
      };
    });

    return {
      passed: results.filter((r) => r.ok).length,
      total:  results.length,
      results,
    };
  } catch (e: any) {
    if (!allowFallback) {
      throw new Error("Execution service temporarily unavailable for this challenge. Please retry in a moment.");
    }
    console.warn("[executor] Judge0 failed, falling back to sequential Wandbox execution:", e.message);
    return await runWandboxSequential(userCode, language, testCases);
  }
}

export async function runWandboxSequential(
  userCode: string,
  language: string,
  testCases: { input: string; expected: string; is_hidden?: boolean }[],
): Promise<RunResult> {
  const results: TestResult[] = [];

  for (let idx = 0; idx < testCases.length; idx++) {
    const tc = testCases[idx];
    const caseT0 = Date.now();
    try {
      const singleProgram = buildBatchedProgram(userCode, language, [tc], false);
      const out = await executeWithWandbox(singleProgram, language);
      const caseMs = Date.now() - caseT0;

      const rawOutput = (out.stdout || "").trim();
      const actual    = rawOutput.replace(/\s+/g, "");
      const expected  = String(tc.expected).trim().replace(/\s+/g, "");
      const ok        = jsonEqual(actual, expected);

      results.push({
        input:     tc.input,
        expected:  String(tc.expected).trim(),
        actual:    rawOutput,
        ok,
        error:     out.stderr || undefined,
        time:      `${caseMs}ms`,
        is_hidden: tc.is_hidden,
      });
    } catch (err: any) {
      results.push({
        input:     tc.input,
        expected:  String(tc.expected).trim(),
        actual:    "",
        ok:        false,
        error:     err.message || "Execution error",
        is_hidden: tc.is_hidden,
      });
    }
  }

  return {
    passed: results.filter((r) => r.ok).length,
    total:  results.length,
    results,
  };
}
