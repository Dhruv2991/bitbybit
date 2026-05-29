// ════════════════════════════════════════════════════════════
// src/lib/executor.ts
// Multi-language execution via Wandbox
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

const WANDBOX_COMPILER: Record<string, string> = {
  cpp: "gcc-13.2.0",
  java: "openjdk-jdk-22+36",
  rust: "rust-1.82.0",
  go: "go-1.23.2",
};

// ── Extract function name from user code ─────────────────────

function extractFuncName(code: string, lang: string): string {
  if (lang === "java") {
    const m = code.match(
      /(?:public\s+)?(?:static\s+)?[\w<>\[\]]+\s+(\w+)\s*\(/,
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
// This is the key to the LeetCode-style approach:
// instead of shipping JSON to the compiled program and parsing it
// at runtime, we embed the actual native literal in the source code
// at harness-build time — exactly what Java does with JSON.stringify.

function toNativeLiteral(value: any, lang: string): string {
  // null / undefined
  if (value === null || value === undefined) {
    switch (lang) {
      case "cpp":
        return "nullptr";
      case "rust":
        return "None";
      case "go":
        return "nil";
      case "java":
        return "null";
      default:
        return "null";
    }
  }

  // boolean
  if (typeof value === "boolean") {
    if (lang === "cpp" || lang === "go" || lang === "rust")
      return value ? "true" : "false";
    return value ? "true" : "false"; // java too
  }

  // number
  if (typeof value === "number") {
    // Preserve integer vs float distinction
    return Number.isInteger(value) ? String(value) : String(value);
  }

  // string
  if (typeof value === "string") {
    const escaped = value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");
    if (lang === "cpp") return `std::string("${escaped}")`;
    if (lang === "rust") return `String::from("${escaped}")`;
    return `"${escaped}"`; // go, java
  }

  // array
  if (Array.isArray(value)) {
    const items = value.map((v) => toNativeLiteral(v, lang));

    if (lang === "cpp") {
      if (value.length === 0) return "{}";
      const inner = items.join(", ");
      // Detect element type from first element
      const first = value[0];
      if (Array.isArray(first)) {
        return `{${inner}}`; // nested — outer type declared in variable
      }
      return `{${inner}}`;
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
        // 2-D int slice
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
      const first = value[0];
      if (typeof first === "number" && Number.isInteger(first)) {
        return `vec![${items.join(", ")}]`;
      }
      if (typeof first === "string") return `vec![${items.join(", ")}]`;
      if (typeof first === "boolean") return `vec![${items.join(", ")}]`;
      if (Array.isArray(first)) {
        return `vec![${items.join(", ")}]`;
      }
      return `vec![${items.join(", ")}]`;
    }

    if (lang === "java") {
      // Java already handled separately — kept for completeness
      return `new int[]{${items.join(", ")}}`;
    }
  }

  // Fallback: JSON stringify (should not normally be reached)
  return JSON.stringify(value);
}

// ── Infer C++ type string from a JS value ───────────────────
// Used to declare typed variables in main() so the user's
// function receives proper C++ types, not json objects.

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
      // Detect inner type
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

// ── Infer Go type string from a JS value ────────────────────

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

// ── Infer Rust type string from a JS value ──────────────────

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
// Each language prints its result using stdlib only.
// We wrap the function call in a small serializer so the output
// matches the expected JSON string stored in the test case.

function cppSerializer(resultExpr: string, returnType: string): string {
  // For common return types, emit a compact inline serializer.
  // The user's return type is detected from their function signature.
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
  // int, long, double, etc.
  return `    cout << (${resultExpr}) << endl;`;
}

// ── Detect C++ return type from user's function signature ────

function detectCppReturnType(code: string): string {
  const lines = code
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("#"));
  for (const line of lines) {
    // Match: returnType funcName(
    const m = line.match(/^([\w:<>*&\s]+?)\s+\w+\s*\(/);
    if (m) {
      const rt = m[1].trim();
      if (!["if", "for", "while", "switch", "return"].includes(rt)) {
        return rt;
      }
    }
  }
  return "auto";
}

// ── Build full compilable program from user code + args ──────

function buildFullProgram(
  userCode: string,
  lang: string,
  argsJson: string,
): string {
  const fn = extractFuncName(userCode, lang);
  let args: any[] = [];
  try {
    args = JSON.parse(argsJson);
  } catch {
    args = [];
  }
  if (!Array.isArray(args)) args = [args];

  switch (lang) {
    // ─────────────────────────────────────────────────────────
    // C++  — No nlohmann/json in user code.
    //        Harness declares typed variables from inferred types
    //        and passes them directly. Output via custom serializer.
    // ─────────────────────────────────────────────────────────
    case "cpp": {
      const returnType = detectCppReturnType(userCode);

      // Build typed variable declarations for each arg
      const decls = args
        .map((arg, i) => {
          const type = cppType(arg);
          const literal = toNativeLiteral(arg, "cpp");
          return `    ${type} __a${i}__ = ${literal};`;
        })
        .join("\n");

      const callArgs = args.map((_, i) => `__a${i}__`).join(", ");
      const printBlock = cppSerializer(`${fn}(${callArgs})`, returnType);

      return [
        "#include <bits/stdc++.h>",
        "using namespace std;",
        "",
        userCode,
        "",
        "int main() {",
        decls,
        printBlock,
        "    return 0;",
        "}",
      ].join("\n");
    }

    // ─────────────────────────────────────────────────────────
    // Java — Already LeetCode-style. No changes to logic;
    //         just cleaned up from the old dead-code branch.
    // ─────────────────────────────────────────────────────────
    case "java": {
      const javaArgs = args
        .map((v) => {
          if (typeof v === "string") {
            return JSON.stringify(v);
          }

          if (typeof v === "number") {
            return String(v);
          }

          if (typeof v === "boolean") {
            return v ? "true" : "false";
          }

          if (Array.isArray(v)) {
            if (!v.length) {
              return "new int[]{}";
            }

            if (typeof v[0] === "number") {
              return `new int[]{${v.join(",")}}`;
            }

            if (typeof v[0] === "string") {
              return `new String[]{${v
                .map((x) => JSON.stringify(x))
                .join(",")}}`;
            }
          }

          return JSON.stringify(v);
        })
        .join(", ");

      return [
        "import java.util.*;",
        "",
        "class Main {",
        "",
        userCode,
        "",
        "    public static void main(String[] args) {",
        "        Main sol = new Main();",
        `        Object __result__ = sol.${fn}(${javaArgs});`,
        "",
        "        if (__result__ instanceof int[]) {",
        '            System.out.println(Arrays.toString((int[]) __result__).replace(" ", ""));',
        "        } else if (__result__ instanceof String[]) {",
        '            System.out.println(Arrays.toString((String[]) __result__).replace(" ", ""));',
        "        } else {",
        "            System.out.println(__result__);",
        "        }",
        "    }",
        "}",
      ].join("\n");
    }

    // ─────────────────────────────────────────────────────────
    // Go  — No encoding/json for user params.
    //        Harness injects typed Go literals; result serialized
    //        with encoding/json (stdlib, no extra deps).
    // ─────────────────────────────────────────────────────────
    case "go": {
      const decls = args
        .map((arg, i) => {
          const type = goType(arg);
          const literal = toNativeLiteral(arg, "go");
          return `    var __a${i}__ ${type} = ${literal}`;
        })
        .join("\n");

      const callArgs = args.map((_, i) => `__a${i}__`).join(", ");

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
        decls,
        `    __result__ := ${fn}(${callArgs})`,
        "    __out__, _ := json.Marshal(__result__)",
        "    fmt.Println(string(__out__))",
        "}",
      ].join("\n");
    }

    // ─────────────────────────────────────────────────────────
    // Rust — No serde_json::Value in user params.
    //         Harness injects typed Rust literals; result serialized
    //         with serde_json (already in Wandbox's Rust env).
    //         User writes fn solution(nums: Vec<i32>, target: i32) -> Vec<i32>
    // ─────────────────────────────────────────────────────────
    case "rust": {
      const decls = args
        .map((arg, i) => {
          const type = rustType(arg);
          const literal = toNativeLiteral(arg, "rust");
          return `    let __a${i}__: ${type} = ${literal};`;
        })
        .join("\n");

      const callArgs = args.map((_, i) => `__a${i}__`).join(", ");

      return [
        userCode,
        "",
        "fn main() {",
        decls,
        `    let __result__ = ${fn}(${callArgs});`,
        '    println!("{:?}", __result__);',
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
    return (
      JSON.stringify(normalize(JSON.parse(a))) ===
      JSON.stringify(normalize(JSON.parse(b)))
    );
  } catch {
    return a.trim() === b.trim();
  }
}

// ── Wandbox execution ────────────────────────────────────────

async function executeWithWandbox(
  fullCode: string,
  language: string,
): Promise<{ stdout: string; stderr: string }> {
  const compiler = WANDBOX_COMPILER[language];
  if (!compiler) throw new Error(`Unsupported language: ${language}`);

  const res = await fetch("https://wandbox.org/api/compile.json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      compiler,
      code: fullCode,
      stdin: "",
      ...(language === "cpp" && { "compiler-option-raw": "-std=c++17" }),
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Wandbox error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return {
    stdout: data.program_output || "",
    stderr: (data.compiler_error || "") + (data.program_error || ""),
  };
}

// ── Public API ───────────────────────────────────────────────

export async function runAgainstTestCases(
  userCode: string,
  language: string,
  testCases: { input: string; expected: string }[],
): Promise<RunResult> {
  if (!testCases.length) return { passed: 0, total: 0, results: [] };

  const results: TestResult[] = [];

  for (const tc of testCases) {
    try {
      const fullCode = buildFullProgram(userCode, language, tc.input);

      const t0 = Date.now();
      const out = await executeWithWandbox(fullCode, language);
      const ms = Date.now() - t0;

      const actual = (out.stdout || "").trim().replace(/\s+/g, "");
      const expected = String(tc.expected).trim();
      const ok = jsonEqual(actual, expected);
      const error = out.stderr || undefined;

      results.push({
        input: tc.input,
        expected,
        actual,
        ok,
        error,
        time: `${ms}ms`,
      });
    } catch (e: any) {
      results.push({
        input: tc.input,
        expected: String(tc.expected).trim(),
        actual: "",
        ok: false,
        error: e.message || "Execution error",
      });
    }
  }

  return {
    passed: results.filter((r) => r.ok).length,
    total: results.length,
    results,
  };
}
