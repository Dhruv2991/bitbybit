import {
  inspectSignature,
  JAVA_PREAMBLE,
  CPP_PREAMBLE,
  GO_PREAMBLE,
  RUST_PREAMBLE,
  PYTHON_PREAMBLE,
  JS_PREAMBLE,
  generateArgDeserializer,
  parseHarnessArgs,
} from './leetCodeHarness';
// ------------------------------------------------------------
// src/lib/visualizerInstrumenter.ts
// Multi-language code instrumenter and test harness builder
// for the Line-by-Line Logic Visualizer.
//
// Supports: Python (Pyodide), JavaScript (Browser),
//           C++, Java, Go, Rust (Judge0/Wandbox Server).
//
// Key design rules for compiled language builders:
//   1. HEADER PRESERVATION � user #include / import / use statements
//      are extracted and placed BEFORE any injected helpers so the
//      compiler sees them in the right order.
//   2. REAL PER-LINE TRACE INJECTION � every non-blank, non-comment
//      statement line inside user functions gets a __BB_TRACE__ call
//      appended after it.
//   3. CORRECT ESCAPING � JSON payloads inside language string literals
//      use the minimal escaping required by that language, not JS escapes.
// ------------------------------------------------------------

import type { SupportedLang } from '@/types/database';
import type { ExecStep, TraceResult } from '@/lib/visualizer';
import { parseExecutionStdout, formatVariableValue } from '@/lib/parseExecutionStdout';

export const BB_TRACE_PREFIX = '__BB_TRACE__:';

// -- Function name extractors -----------------------------------

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

// -- Parameter Count Extractor & Arg Parser -------------------

export function extractParamCount(code: string, lang: SupportedLang): number {
  switch (lang) {
    case 'java': {
      const m = code.match(/(?:public|private|protected|static|\s)+[\w<>\[\]]+\s+\w+\s*\(([^)]*)\)/);
      if (!m || !m[1].trim()) return 0;
      return m[1].split(',').filter(s => s.trim().length > 0).length;
    }
    case 'cpp': {
      const lines = code.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('#'));
      for (const line of lines) {
        const m = line.match(/\b(?:\w+::)?\w+[\w<>:*&\s]+\s+(\w+)\s*\(([^)]*)\)\s*\{/);
        if (m && !['main', 'if', 'for', 'while', 'switch'].includes(m[1])) {
          if (!m[2].trim()) return 0;
          return m[2].split(',').filter(s => s.trim().length > 0).length;
        }
      }
      return 0;
    }
    case 'rust': {
      const m = code.match(/fn\s+\w+\s*(?:<[^>]*>)?\s*\(([^)]*)\)/);
      if (!m || !m[1].trim()) return 0;
      return m[1].split(',').filter(s => s.trim().length > 0 && !s.includes('&self') && s.trim() !== 'self').length;
    }
    case 'go': {
      const m = code.match(/func\s+(?:\([^)]*\)\s*)?\w+\s*\(([^)]*)\)/);
      if (!m || !m[1].trim()) return 0;
      return m[1].split(',').filter(s => s.trim().length > 0).length;
    }
    default:
      return 0;
  }
}

// -- JavaScript Client-Side Tracer ------------------------------

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
    for (let i = 0; i < rawLines.length; i++) {
      const lineNum = i + 1;
      const line = rawLines[i];
      const trimmed = line.trim();

      const isHeader  = trimmed.startsWith('function') || (trimmed.startsWith('const ') && trimmed.includes('=>'));
      const isComment = trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
      const isBrace   = trimmed === '{' || trimmed === '}' || trimmed === '';

      if (!isHeader && !isComment && !isBrace) {
        const varSnaps = Array.from(declaredVars)
          .map(v => `try { if (typeof ${v} !== 'undefined') __vars__["${v}"] = ${v}; } catch(e){}`)
          .join('; ');
        instrumentedLines.push(`{ const __vars__ = {}; ${varSnaps}; __bb_trace__(${lineNum}, __vars__); }`);
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
        if (!k.startsWith('__')) {
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

// ------------------------------------------------------------
// -- Shared header / import extraction utilities -----------
// ------------------------------------------------------------

function splitCppHeaders(code: string): { headers: string; body: string } {
  const lines = code.split('\n');
  let i = 0;
  const headerLines: string[] = [];

  while (i < lines.length) {
    const t = lines[i].trim();
    if (
      t.startsWith('#include') || t.startsWith('#define') || t.startsWith('#pragma') ||
      t.startsWith('#ifndef') || t.startsWith('#ifdef') || t.startsWith('#endif') ||
      t.startsWith('#undef') || t === ''
    ) {
      headerLines.push(lines[i]);
      i++;
    } else {
      break;
    }
  }

  return { headers: headerLines.join('\n').trimEnd(), body: lines.slice(i).join('\n') };
}

function splitJavaImports(code: string): { imports: string; body: string } {
  const lines = code.split('\n');
  let i = 0;
  const importLines: string[] = [];

  while (i < lines.length) {
    const t = lines[i].trim();
    if (t.startsWith('import ') || t.startsWith('package ') || t === '') {
      importLines.push(lines[i]);
      i++;
    } else {
      break;
    }
  }

  return { imports: importLines.join('\n').trimEnd(), body: lines.slice(i).join('\n') };
}

function splitGoImports(code: string): { packageLine: string; imports: string; body: string } {
  const lines = code.split('\n');
  let i = 0;

  while (i < lines.length && lines[i].trim() === '') i++;

  let packageLine = '';
  if (i < lines.length && lines[i].trim().startsWith('package ')) {
    packageLine = lines[i].trim();
    i++;
  }

  while (i < lines.length && lines[i].trim() === '') i++;

  const importLines: string[] = [];

  if (i < lines.length && /^import\s+"/.test(lines[i].trim())) {
    importLines.push(lines[i]);
    i++;
  } else if (i < lines.length && /^import\s*\(/.test(lines[i].trim())) {
    importLines.push(lines[i]);
    i++;
    while (i < lines.length && !lines[i].includes(')')) {
      importLines.push(lines[i]);
      i++;
    }
    if (i < lines.length) { importLines.push(lines[i]); i++; }
  }

  return { packageLine, imports: importLines.join('\n'), body: lines.slice(i).join('\n') };
}

function splitRustUses(code: string): { uses: string; body: string } {
  const lines = code.split('\n');
  let i = 0;
  const useLines: string[] = [];

  while (i < lines.length) {
    const t = lines[i].trim();
    if (t.startsWith('use ') || t.startsWith('extern crate') || t.startsWith('#![') || t === '') {
      useLines.push(lines[i]);
      i++;
    } else {
      break;
    }
  }

  return { uses: useLines.join('\n').trimEnd(), body: lines.slice(i).join('\n') };
}

// ------------------------------------------------------------
// -- C++ Trace Program Generator ---------------------------
// ------------------------------------------------------------

export function buildCppTraceProgram(userCode: string, inputJson: string | null): string {
  const { headers: userHeaders, body: userBody } = splitCppHeaders(userCode);

  const REQUIRED = [
    '#include <iostream>',
    '#include <vector>',
    '#include <string>',
    '#include <sstream>',
    '#include <map>',
    '#include <unordered_map>',
    '#include <algorithm>',
    '#include <cmath>',
    '#include <initializer_list>',
  ];

  const existingHeaders = new Set(userHeaders.split('\n').map(l => l.trim()).filter(Boolean));
  const extraHeaders = REQUIRED.filter(h => !existingHeaders.has(h));

  // C++ string literals: use \" for embedded quotes.
  // In a JS template string, we write \\\" to get \" in the output.
  const traceHelper = `
// -- BB Trace Helpers ------------------------------------------
template<typename T>
std::string __bb_repr(const T& v) { std::ostringstream s; s << v; return s.str(); }
template<> std::string __bb_repr(const bool& v) { return v ? "true" : "false"; }
template<> std::string __bb_repr(const std::string& v) { return "\\"" + v + "\\""; }
template<> inline std::string __bb_repr(ListNode* const& v) { return serializeList(v); }
template<> inline std::string __bb_repr(TreeNode* const& v) { return serializeTree(v); }
template<typename T>
std::string __bb_repr(const std::vector<T>& vec) {
    std::string s = "[";
    for (size_t i = 0; i < vec.size(); ++i) { if (i) s += ","; s += __bb_repr(vec[i]); }
    return s + "]";
}
inline void __bb_emit(int line, const std::string& vars) {
    std::cout << "__BB_TRACE__:{\\"line\\":" << line << ",\\"vars\\":" << vars << "}" << std::endl;
}
inline std::string __bb_vars(std::initializer_list<std::pair<const char*, std::string>> kv) {
    std::string s = "{";
    bool first = true;
    for (auto& p : kv) {
        if (!first) s += ","; first = false;
        s += "\\""; s += p.first; s += "\\":"; s += p.second;
    }
    return s + "}";
}`;

  const instrumentedBody = instrumentCppBody(userBody);

  const sig = inspectSignature(userCode, 'cpp');
  const fnName = sig.name;
  const paramCount = sig.params.length || 1;
  const args = parseHarnessArgs(inputJson, paramCount, sig.params);

  const argDecls = args.map((a, i) => {
    const param = sig.params[i] || { name: `arg${i}`, rawType: 'int', kind: 'primitive' };
    return generateArgDeserializer(param, a, 'cpp', i).decl;
  }).join('\n');
  const callArgs = args.map((_, i) => `__bb_a${i}__`).join(', ');

  const classMatch = userBody.match(/class\s+(\w+)\b/);
  const callInvocation = classMatch
    ? `${classMatch[1]} __sol__;\n        __sol__.${fnName}(${callArgs});`
    : `${fnName}(${callArgs});`;

  const mainBlock = `
int main() {
${argDecls}
    __bb_emit(0, "{}");
    try {
        ${callInvocation}
    } catch (const std::exception& e) {
        std::cerr << "RuntimeError: " << e.what() << std::endl;
    } catch (...) {
        std::cerr << "RuntimeError: unknown exception" << std::endl;
    }
    return 0;
}`;
  return [
    userHeaders,
    extraHeaders.join('\n'),
    '#include <queue>',
    '#include <unordered_set>',
    CPP_PREAMBLE,
    '',
    traceHelper,
    'using namespace std;',
    '',
    instrumentedBody,
    mainBlock,
  ].filter(s => s.trim() !== '').join('\n');
}


// ── Universal Variable Extractors for Compiled Languages ────────

const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
  'volatile', 'while', 'true', 'false', 'null', 'var', 'record', 'yield', 'sealed', 'non-sealed'
]);

function extractJavaVars(line: string): string[] {
  const vars: string[] = [];
  const trimmed = line.trim();

  // For-each loop: for (Type var : expr)
  const forEachMatch = trimmed.match(/for\s*\(\s*(?:final\s+)?(?:[\w<>\[\],\s?]+?)\s+([a-zA-Z_]\w*)\s*:/);
  if (forEachMatch && !JAVA_KEYWORDS.has(forEachMatch[1])) {
    vars.push(forEachMatch[1]);
  }

  // Standard for loop: for (Type i = 0, j = n; ...)
  const forStandardMatch = trimmed.match(/for\s*\(\s*(?:final\s+)?(?:[\w<>\[\],\s?]+?)\s+([^;]+);/);
  if (forStandardMatch) {
    const decls = forStandardMatch[1].split(',');
    for (const d of decls) {
      const vMatch = d.trim().match(/(?:[\w<>\[\],\s?]+\s+)?([a-zA-Z_]\w*)\s*=/);
      if (vMatch && !JAVA_KEYWORDS.has(vMatch[1])) vars.push(vMatch[1]);
    }
  }

  // Regular declarations: Type var1 = val, var2 = val; or Type var;
  if (
    !trimmed.startsWith('return') &&
    !trimmed.startsWith('throw') &&
    !trimmed.startsWith('System.') &&
    !trimmed.startsWith('if') &&
    !trimmed.startsWith('while') &&
    !trimmed.startsWith('for') &&
    !trimmed.startsWith('switch') &&
    !trimmed.startsWith('case') &&
    !trimmed.startsWith('break') &&
    !trimmed.startsWith('continue') &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('/*')
  ) {
    const declMatch = trimmed.match(/^(?:final\s+)?(?:[\w<>\[\],\s?]+?)\s+([a-zA-Z_]\w*(?:\s*=\s*[^,;]+)?(?:\s*,\s*[a-zA-Z_]\w*(?:\s*=\s*[^,;]+)?)*)\s*;/);
    if (declMatch) {
      const declList = declMatch[1].split(',');
      for (const d of declList) {
        const v = d.trim().split(/\s*=/)[0].trim().split(/\s+/).pop();
        if (v && /^[a-zA-Z_]\w*$/.test(v) && !JAVA_KEYWORDS.has(v)) {
          vars.push(v);
        }
      }
    }
  }

  return vars;
}

const CPP_KEYWORDS = new Set([
  'alignas', 'alignof', 'and', 'and_eq', 'asm', 'atomic_cancel', 'atomic_commit', 'atomic_noexcept',
  'auto', 'bitand', 'bitor', 'bool', 'break', 'case', 'catch', 'char', 'char8_t', 'char16_t',
  'char32_t', 'class', 'compl', 'concept', 'const', 'consteval', 'constexpr', 'constinit',
  'const_cast', 'continue', 'co_await', 'co_return', 'co_yield', 'decltype', 'default', 'delete',
  'do', 'double', 'dynamic_cast', 'else', 'enum', 'explicit', 'export', 'extern', 'false',
  'float', 'for', 'friend', 'goto', 'if', 'inline', 'int', 'long', 'mutable', 'namespace',
  'new', 'noexcept', 'not', 'not_eq', 'nullptr', 'operator', 'or', 'or_eq', 'private',
  'protected', 'public', 'reflexpr', 'register', 'reinterpret_cast', 'requires', 'return',
  'short', 'signed', 'sizeof', 'static', 'static_assert', 'static_cast', 'struct', 'switch',
  'synchronized', 'template', 'this', 'thread_local', 'throw', 'true', 'try', 'typedef',
  'typeid', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void', 'volatile', 'wchar_t',
  'while', 'xor', 'xor_eq', 'std', 'vector', 'string', 'map', 'unordered_map', 'set', 'unordered_set', 'queue', 'stack', 'pair'
]);

function extractCppVars(line: string): string[] {
  const vars: string[] = [];
  const trimmed = line.trim();

  // Range-based for: for (auto& x : vec) or for (int x : vec)
  const rangeFor = trimmed.match(/for\s*\(\s*(?:const\s+)?(?:auto|[\w<>:*&\s]+?)\s+([*&]?\s*([a-zA-Z_]\w*))\s*:/);
  if (rangeFor && !CPP_KEYWORDS.has(rangeFor[2])) vars.push(rangeFor[2]);

  // Standard for loop: for (int i = 0, j = 1; ...)
  const standardFor = trimmed.match(/for\s*\(\s*([^;]+);/);
  if (standardFor) {
    const decls = standardFor[1].split(',');
    for (const d of decls) {
      const vMatch = d.trim().match(/(?:[\w<>:*&\s]+\s+)?([*&]?\s*([a-zA-Z_]\w*))\s*=/);
      if (vMatch && !CPP_KEYWORDS.has(vMatch[2])) vars.push(vMatch[2]);
    }
  }

  // Regular declarations: Type var1 = val, var2 = val; or Type var(arg);
  if (
    !trimmed.startsWith('return') &&
    !trimmed.startsWith('cout') &&
    !trimmed.startsWith('cin') &&
    !trimmed.startsWith('if') &&
    !trimmed.startsWith('while') &&
    !trimmed.startsWith('for') &&
    !trimmed.startsWith('using') &&
    !trimmed.startsWith('#') &&
    !trimmed.startsWith('//')
  ) {
    const declMatch = trimmed.match(/^(?:const\s+)?(?:[\w<>:*&\s]+?)\s+([*&]?\s*[a-zA-Z_]\w*(?:\s*=\s*[^,;]+|\s*\([^)]*\))?(?:\s*,\s*[*&]?\s*[a-zA-Z_]\w*(?:\s*=\s*[^,;]+|\s*\([^)]*\))?)*)\s*;/);
    if (declMatch) {
      const declList = declMatch[1].split(',');
      for (const d of declList) {
        const cleaned = d.trim().replace(/[*&]/g, '').split(/\s*=/)[0].split(/\s*\(/)[0].trim().split(/\s+/).pop();
        if (cleaned && /^[a-zA-Z_]\w*$/.test(cleaned) && !CPP_KEYWORDS.has(cleaned)) {
          vars.push(cleaned);
        }
      }
    }
  }

  return vars;
}

function extractGoVars(line: string): string[] {
  const vars: string[] = [];
  const trimmed = line.trim();

  // Range loop: for i, v := range nums / for _, v := range nums / for i := range nums
  const rangeMatch = trimmed.match(/for\s+([a-zA-Z0-9_,\s]+)\s*:=\s*range\b/);
  if (rangeMatch) {
    const names = rangeMatch[1].split(',').map(s => s.trim()).filter(s => s && s !== '_');
    vars.push(...names);
  }

  // Standard for loop: for i := 0; ...
  const forMatch = trimmed.match(/for\s+([a-zA-Z0-9_,\s]+)\s*:=/);
  if (forMatch && !trimmed.includes('range')) {
    const names = forMatch[1].split(',').map(s => s.trim()).filter(s => s && s !== '_');
    vars.push(...names);
  }

  // Short variable declarations: a, b := 1, 2
  const shortDecl = trimmed.match(/^([a-zA-Z0-9_,\s]+)\s*:=/);
  if (shortDecl && !trimmed.startsWith('for')) {
    const names = shortDecl[1].split(',').map(s => s.trim()).filter(s => s && s !== '_');
    vars.push(...names);
  }

  // Var declarations: var a, b int = 1, 2 or var a int
  const varDecl = trimmed.match(/^var\s+([a-zA-Z0-9_,\s]+)(?:\s+[\w*\[\]]+|\s*=)/);
  if (varDecl) {
    const names = varDecl[1].split(',').map(s => s.trim()).filter(s => s && s !== '_');
    vars.push(...names);
  }

  return vars;
}

function extractRustVars(line: string): string[] {
  const vars: string[] = [];
  const trimmed = line.trim();

  // For loop: for (i, x) in ... or for x in ...
  const forMatch = trimmed.match(/for\s+(?:&|mut\s+)?([a-zA-Z0-9_,\s()&]+)\s+in\b/);
  if (forMatch) {
    const raw = forMatch[1].replace(/[()&]/g, '');
    const names = raw.split(',').map(s => s.trim()).filter(s => s && s !== '_' && !s.startsWith('mut '));
    for (const n of names) {
      const clean = n.replace(/^mut\s+/, '').trim();
      if (clean && clean !== '_') vars.push(clean);
    }
  }

  // Let bindings: let mut a = ..., let (a, b) = ..., let a: i32 = ...
  const letMatch = trimmed.match(/^let\s+(?:mut\s+)?([a-zA-Z0-9_,\s()&]+?)(?::\s*[^=]+)?\s*=/);
  if (letMatch) {
    const raw = letMatch[1].replace(/[()&]/g, '');
    const names = raw.split(',').map(s => s.trim()).filter(s => s && s !== '_');
    for (const n of names) {
      const clean = n.replace(/^mut\s+/, '').trim();
      if (clean && clean !== '_' && /^[a-zA-Z_]\w*$/.test(clean)) vars.push(clean);
    }
  }

  return vars;
}

function instrumentCppBody(body: string): string {
  const lines = body.split('\n');
  const result: string[] = [];
  let depth = 0;
  let userLineNum = 0;
  const varStack: string[][] = [[]];

  for (const line of lines) {
    userLineNum++;
    const trimmed = line.trim();
    result.push(line);

    const opens  = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    // Track parameters in method signatures at depth 0 or 1
    if (depth <= 1 && opens > 0) {
      const methodMatch = trimmed.match(/\b(?:\w+::)?(?:[\w<>:*&\s]+)\s+(\w+)\s*\(([^)]*)\)\s*\{/);
      if (methodMatch && methodMatch[2] && !['if', 'for', 'while', 'switch'].includes(methodMatch[1])) {
        const params = methodMatch[2]
          .split(',')
          .map(p => p.trim().replace(/[*&]/g, '').split(/\s*=/)[0].trim().split(/\s+/).pop())
          .filter((p): p is string => Boolean(p && /^[a-zA-Z_]\w*$/.test(p) && !CPP_KEYWORDS.has(p)));
        if (params.length > 0) {
          (varStack[varStack.length - 1] || []).push(...params);
        }
      }
    }

    if (depth >= 1) {
      const newVars = extractCppVars(line);
      if (newVars.length > 0) {
        (varStack[varStack.length - 1] || []).push(...newVars);
      }
    }

    if (
      depth >= 1 &&
      trimmed.endsWith(';') &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('using ')
    ) {
      const allVars = [...new Set(varStack.flat())];
      const kvPairs = allVars.map(v => `{"${v}", __bb_repr(${v})}`).join(', ');
      const varsExpr = allVars.length > 0 ? `__bb_vars({${kvPairs}})` : '"{}"';
      result.push(`    __bb_emit(${userLineNum}, ${varsExpr});`);
    }

    depth += opens;
    depth -= closes;
    if (opens > 0) for (let i = 0; i < opens; i++) varStack.push([]);
    if (closes > 0) for (let i = 0; i < closes; i++) { if (varStack.length > 1) varStack.pop(); }
  }

  return result.join('\n');
}

function cppArgType(v: any): string {
  if (v === null) return 'void*';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double';
  if (typeof v === 'string') return 'std::string';
  if (Array.isArray(v)) {
    if (v.length === 0) return 'std::vector<int>';
    const f = v[0];
    if (Array.isArray(f)) return 'std::vector<std::vector<int>>';
    if (typeof f === 'string') return 'std::vector<std::string>';
    return 'std::vector<int>';
  }
  return 'auto';
}

function cppLiteral(v: any): string {
  if (v === null || v === undefined) return 'nullptr';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return `std::string("${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
  if (Array.isArray(v)) {
    if (v.length === 0) return '{}';
    return `{${v.map(cppLiteral).join(', ')}}`;
  }
  return String(v);
}

// ------------------------------------------------------------
// -- Java Trace Program Generator --------------------------
// ------------------------------------------------------------

export function buildJavaTraceProgram(userCode: string, inputJson: string | null): string {
  const { imports: userImports, body: userBody } = splitJavaImports(userCode);

  const REQUIRED_IMPORTS = ['import java.util.*;', 'import java.util.stream.*;'];
  const existingImportSet = new Set(userImports.split('\n').map(l => l.trim()).filter(Boolean));
  const extraImports = REQUIRED_IMPORTS.filter(im => !existingImportSet.has(im));

  // Build the Java trace helper as an array of Java source lines,
  // one JS string per Java line — no template-literal nesting.
  const traceHelper = [
    "    // ── BB Trace Helpers ──────────────────────────────────────────────────",
    "",
    "    private static void __bb_emit(int line, String vars) {",
    "        System.out.println(\"__BB_TRACE__:{\\\"line\\\":\" + line + \",\\\"vars\\\":\" + vars + \"}\");",
    "    }",
    "",
    "    private static String __bb_vars(String... pairs) {",
    "        StringBuilder sb = new StringBuilder(\"{\");",
    "        for (int i = 0; i < pairs.length; i += 2) {",
    "            if (i > 0) sb.append(\",\");",
    "            sb.append(\"\\\"\").append(pairs[i]).append(\"\\\":\").append(pairs[i + 1]);",
    "        }",
    "        return sb.append(\"}\").toString();",
    "    }",
    "",
    "    private static String __bb_escapeStr(String v) {",
    "        return v.replace(\"\\\\\", \"\\\\\\\\\").replace(\"\\\"\", \"\\\\\\\"\");",
    "    }",
    "",
    "    private static String __bb_repr(Object v) {",
    "        if (v == null) return \"null\";",
    "        if (v instanceof String) return \"\\\"\" + __bb_escapeStr((String) v) + \"\\\"\";",
    "        if (v instanceof int[]) return Arrays.toString((int[]) v).replace(\" \", \"\");",
    "        if (v instanceof int[][]) return Arrays.deepToString((int[][]) v).replace(\" \", \"\");",
    "        if (v instanceof boolean[]) return Arrays.toString((boolean[]) v).replace(\" \", \"\");",
    "        return String.valueOf(v);",
    "    }",
  ].join('\n');

  // Check if the user code contains a class declaration
  const hasClassDecl = /(?:public\s+|private\s+|protected\s+|static\s+|abstract\s+|final\s+)*class\s+\w+/.test(userBody);

  let cleanBody: string;
  let lineOffset = 0;

  if (!hasClassDecl) {
    // User provided method-only code (LeetCode style method submission).
    // Automatically wrap in static class Solution.
    cleanBody = `    static class Solution {\n${userBody}\n    }`;
    lineOffset = 1; // 1 prepended line before user code
  } else {
    // User provided class(es).
    // 1. Strip any existing public static void main so it does not conflict with our harness
    let processed = userBody.replace(
      /public\s+static\s+void\s+main\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/g,
      ''
    );

    // 2. Check if there is a class named Solution
    const hasSolutionClass = /\bclass\s+Solution\b/.test(processed);

    if (hasSolutionClass) {
      // Make `public class Solution` or `class Solution` -> `static class Solution`
      processed = processed.replace(
        /(?:public\s+|private\s+|protected\s+)?class\s+Solution\b/g,
        'static class Solution'
      );
    } else {
      // Rename the first class to `static class Solution` so harness Solution instantiates cleanly
      processed = processed.replace(
        /(?:public\s+|private\s+|protected\s+)?class\s+\w+/,
        'static class Solution'
      );
    }

    // Ensure any auxiliary classes (e.g. TreeNode, ListNode) are also static inner classes
    processed = processed.replace(
      /(^|\n)\s*(?:public\s+|private\s+|protected\s+)?class\s+((?!Solution\b)\w+)/g,
      '$1    static class $2'
    );

    cleanBody = processed;
  }

  const instrumentedBody = instrumentJavaBody(cleanBody, lineOffset);

  const sig = inspectSignature(userCode, 'java');
  const fnName = sig.name;
  const paramCount = sig.params.length || 1;
  const args = parseHarnessArgs(inputJson, paramCount, sig.params);

  const argDecls = args.map((a, i) => {
    const param = sig.params[i] || { name: `arg${i}`, rawType: 'int', kind: 'primitive' };
    return generateArgDeserializer(param, a, 'java', i).decl;
  }).join('\n');
  const callArgs = args.map((_, i) => `__bb_a${i}__`).join(', ');

  return [
    userImports,
    extraImports.join('\n'),
    '',
    'public class Main {',
    traceHelper,
    '',
    instrumentedBody,
    '',
        JAVA_PREAMBLE,
    '    public static void main(String[] args) {',
    '        try {',
    argDecls,
    '            Solution __sol__ = new Solution();',
    '            __bb_emit(0, "{}");',
    `            __sol__.${fnName}(${callArgs});`,
    '            System.err.flush();',
    '        } catch (Exception e) {',
    '            System.err.println("RuntimeError: " + e.getMessage());',
    '        }',
    '    }',
    '}',
  ].join('\n');
}

function instrumentJavaBody(body: string, lineOffset: number = 0): string {
  const lines = body.split('\n');
  const result: string[] = [];
  let depth = 0;
  let rawLineNum = 0;
  const varStack: string[][] = [[]];

  for (const line of lines) {
    rawLineNum++;
    const userLineNum = Math.max(1, rawLineNum - lineOffset);
    const trimmed = line.trim();
    result.push(line);

    const opens  = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    // Track parameters in method signatures at depth 1
    if (depth === 1 && opens > 0) {
      const methodMatch = trimmed.match(/(?:public|private|protected|static|\s)+[\w<>\[\]]+\s+(\w+)\s*\(([^)]*)\)/);
      if (methodMatch && methodMatch[2]) {
        const params = methodMatch[2]
          .split(',')
          .map(p => p.trim().split(/\s*=/)[0].trim().split(/\s+/).pop())
          .filter((p): p is string => Boolean(p && /^[a-zA-Z_]\w*$/.test(p) && !JAVA_KEYWORDS.has(p)));
        if (params.length > 0) {
          (varStack[varStack.length - 1] || []).push(...params);
        }
      }
    }

    if (depth >= 2) {
      const newVars = extractJavaVars(line);
      if (newVars.length > 0) {
        (varStack[varStack.length - 1] || []).push(...newVars);
      }
    }

    if (
      depth >= 2 &&
      trimmed.endsWith(';') &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('import') &&
      !trimmed.startsWith('package')
    ) {
      const allVars = [...new Set(varStack.flat())];
      const pairs = allVars.map(v => `"${v}", __bb_repr(${v})`).join(', ');
      const varsExpr = allVars.length > 0 ? `__bb_vars(${pairs})` : '"{}"';
      const indent = line.match(/^(\s*)/)?.[1] ?? '        ';
      result.push(`${indent}__bb_emit(${userLineNum}, ${varsExpr});`);
    }

    depth += opens;
    depth -= closes;
    if (opens > 0) for (let i = 0; i < opens; i++) varStack.push([]);
    if (closes > 0) for (let i = 0; i < closes; i++) { if (varStack.length > 1) varStack.pop(); }
  }

  return result.join('\n');
}

function javaArgType(v: any): string {
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'double';
  if (typeof v === 'string') return 'String';
  if (Array.isArray(v)) {
    if (v.length === 0) return 'int[]';
    const f = v[0];
    if (Array.isArray(f)) return 'int[][]';
    if (typeof f === 'string') return 'String[]';
    return 'int[]';
  }
  return 'Object';
}

function javaLiteral(v: any): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  if (Array.isArray(v)) {
    if (v.length === 0) return 'new int[]{}';
    const f = v[0];
    if (Array.isArray(f)) {
      const rows = v.map(r => `new int[]{${(r as number[]).join(',')}}`).join(',');
      return `new int[][]{${rows}}`;
    }
    if (typeof f === 'string') return `new String[]{${v.map(x => javaLiteral(x)).join(',')}}`;
    return `new int[]{${v.join(',')}}`;
  }
  return JSON.stringify(v);
}

// ------------------------------------------------------------
// -- Go Trace Program Generator ----------------------------
// ------------------------------------------------------------

export function buildGoTraceProgram(userCode: string, inputJson: string | null): string {
  const { packageLine, imports: userImports, body: userBody } = splitGoImports(userCode);

  const REQUIRED_PKGS = ['fmt', 'strings'];
  const mergedImports = mergeGoImports(userImports, REQUIRED_PKGS);

  // Go string literals: use \" for embedded double-quotes, \n for newline.
  // Note: in Go raw string literals (backtick) no escaping is needed,
  // but we use interpreted string literals here for cross-version compat.
  const traceHelper = `
func __bb_emit(line int, vars string) {
\tfmt.Printf("__BB_TRACE__:{\\\"line\\\":%d,\\\"vars\\\":%s}\\n", line, vars)
}

func __bb_repr(v interface{}) string {
\tswitch val := v.(type) {
\tcase string:
\t\treturn "\\\"" + strings.ReplaceAll(val, "\\\"", "\\\\\\\"") + "\\\""
\tcase bool:
\t\tif val { return "true" }
\t\treturn "false"
\tcase []int:
\t\tparts := make([]string, len(val))
\t\tfor i, x := range val { parts[i] = fmt.Sprintf("%d", x) }
\t\treturn "[" + strings.Join(parts, ",") + "]"
\tcase []string:
\t\tparts := make([]string, len(val))
\t\tfor i, x := range val { parts[i] = "\\\"" + x + "\\\"" }
\t\treturn "[" + strings.Join(parts, ",") + "]"
\tdefault:
\t\treturn fmt.Sprintf("%v", val)
\t}
}

func __bb_vars(pairs ...string) string {
\tvar sb strings.Builder
\tsb.WriteString("{")
\tfor i := 0; i+1 < len(pairs); i += 2 {
\t\tif i > 0 { sb.WriteString(",") }
\t\tsb.WriteString("\\\"" + pairs[i] + "\\\":" + pairs[i+1])
\t}
\tsb.WriteString("}")
\treturn sb.String()
}
`;

  const instrumentedBody = instrumentGoBody(userBody);

  const sig = inspectSignature(userCode, 'go');
  const fnName = sig.name;
  const paramCount = sig.params.length || 1;
  const args = parseHarnessArgs(inputJson, paramCount, sig.params);

  const argDecls = args.map((a, i) => {
    const param = sig.params[i] || { name: `arg${i}`, rawType: 'int', kind: 'primitive' };
    return generateArgDeserializer(param, a, 'go', i).decl;
  }).join('\n');
  const callArgs = args.map((_, i) => `__bb_a${i}__`).join(', ');

  const fnSig = userCode.match(new RegExp(`func\\s+${fnName}\\s*\\([^)]*\\)\\s*([^{]*)`));
  const hasReturn = fnSig && fnSig[1] && fnSig[1].trim() !== '';
  const callInvocation = hasReturn ? `_ = ${fnName}(${callArgs})` : `${fnName}(${callArgs})`;

  const mainFn = `
func main() {
${argDecls}
\t__bb_emit(0, "{}")
\t${callInvocation}
}
`;
  return [
    packageLine || 'package main',
    '',
    mergedImports,
    GO_PREAMBLE,
    '',
    traceHelper,
    instrumentedBody,
    mainFn,
  ].join('\n');
}

function mergeGoImports(userImports: string, required: string[]): string {
  const existingPkgs = new Set<string>();
  const pkgRe = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = pkgRe.exec(userImports)) !== null) existingPkgs.add(m[1]);

  const toAdd = required.filter(p => !existingPkgs.has(p));

  if (userImports.trim() === '') {
    const all = [...new Set([...required])];
    return `import (\n${all.map(p => `\t"${p}"`).join('\n')}\n)`;
  }

  if (toAdd.length === 0) return userImports;

  if (userImports.includes('(')) {
    return userImports.replace(')', toAdd.map(p => `\t"${p}"`).join('\n') + '\n)');
  }

  return `import (\n${[...existingPkgs, ...toAdd].map(p => `\t"${p}"`).join('\n')}\n)`;
}

function instrumentGoBody(body: string): string {
  const lines = body.split('\n');
  const result: string[] = [];
  let userLineNum = 0;
  let depth = 0;
  const varStack: string[][] = [[]];

  for (const line of lines) {
    userLineNum++;
    const trimmed = line.trim();
    result.push(line);

    const opens  = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    // Track parameters in func signatures at depth 0
    if (depth === 0 && opens > 0) {
      const fnMatch = trimmed.match(/func\s+(?:\([^)]*\)\s*)?\w+\s*\(([^)]*)\)/);
      if (fnMatch && fnMatch[1]) {
        const params = fnMatch[1]
          .split(',')
          .map(p => p.trim().split(/\s+/)[0])
          .filter((p): p is string => Boolean(p && /^[a-zA-Z_]\w*$/.test(p) && p !== '_'));
        if (params.length > 0) {
          (varStack[varStack.length - 1] || []).push(...params);
        }
      }
    }

    if (depth >= 1) {
      const newVars = extractGoVars(line);
      if (newVars.length > 0) {
        (varStack[varStack.length - 1] || []).push(...newVars);
      }

      const isTraceable =
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('/*') &&
        trimmed !== '' && trimmed !== '{' && trimmed !== '}' &&
        (trimmed.includes(':=') || trimmed.startsWith('var ') || trimmed.startsWith('return') || trimmed.includes('=') || (trimmed.endsWith('}') && !trimmed.startsWith('func')));

      if (isTraceable) {
        const allVars = [...new Set(varStack.flat())];
        const pairs = allVars.map(v => `"${v}", __bb_repr(${v})`).join(', ');
        const varsExpr = allVars.length > 0 ? `__bb_vars(${pairs})` : '"{}"';
        const indent = line.match(/^(\s*)/)?.[1] ?? '\t';
        result.push(`${indent}__bb_emit(${userLineNum}, ${varsExpr})`);
      }
    }

    depth += opens;
    depth -= closes;
    if (opens > 0) for (let i = 0; i < opens; i++) varStack.push([]);
    if (closes > 0) for (let i = 0; i < closes; i++) { if (varStack.length > 1) varStack.pop(); }
  }

  return result.join('\n');
}

function goArgType(v: any): string {
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float64';
  if (typeof v === 'string') return 'string';
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]int';
    const f = v[0];
    if (Array.isArray(f)) return '[][]int';
    if (typeof f === 'string') return '[]string';
    return '[]int';
  }
  return 'interface{}';
}

function goLiteral(v: any, type: string): string {
  if (v === null || v === undefined) return 'nil';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  if (Array.isArray(v)) {
    if (v.length === 0) return `${type}{}`;
    const f = v[0];
    if (Array.isArray(f)) {
      const rows = v.map(row => `{${(row as number[]).join(',')}}`).join(',');
      return `[][]int{${rows}}`;
    }
    if (typeof f === 'string') return `[]string{${v.map(x => `"${x}"`).join(',')}}`;
    return `[]int{${v.join(',')}}`;
  }
  return JSON.stringify(v);
}

// ------------------------------------------------------------
// -- Rust Trace Program Generator --------------------------
// ------------------------------------------------------------

export function buildRustTraceProgram(userCode: string, inputJson: string | null): string {
  const { uses: userUses, body: userBody } = splitRustUses(userCode);

  const hasImplSolution = /impl\s+Solution\b/.test(userBody);
  const hasStructSolution = /struct\s+Solution\b/.test(userBody);
  const prefixStruct = (hasImplSolution && !hasStructSolution) ? 'struct Solution;\n' : '';

  const traceHelper = `
macro_rules! bb_emit {
    ($line:expr, $vars:expr) => {
        println!("__BB_TRACE__:{{\\"line\\":{},\\"vars\\":{}}}", $line, $vars);
    };
}

fn bb_repr<T: std::fmt::Debug>(v: &T) -> String {
    format!("{:?}", v)
}

macro_rules! bb_vars {
    () => { "{}".to_string() };
    ($($k:literal => $v:expr),* $(\,)?) => {{
        let mut __s = String::from("{");
        let mut __first = true;
        $(
            if !__first { __s.push(','); }
            __first = false;
            __s.push_str(&format!("\\\"{}\\\":{}", $k, bb_repr(&$v)));
        )*
        __s.push('}');
        __s
    }};
}
`;

  const instrumentedBody = instrumentRustBody(userBody);

  const sig = inspectSignature(userCode, 'rust');
  const fnName = sig.name;
  const paramCount = sig.params.length || 1;
  const args = parseHarnessArgs(inputJson, paramCount, sig.params);

  const argDecls = args.map((a, i) => {
    const param = sig.params[i] || { name: `arg${i}`, rawType: 'i32', kind: 'primitive' };
    return generateArgDeserializer(param, a, 'rust', i).decl;
  }).join('\n');
  const callArgs = args.map((_, i) => `__bb_a${i}__`).join(', ');

  const callInvocation = hasImplSolution
    ? `Solution::${fnName}(${callArgs});`
    : `let _ = ${fnName}(${callArgs});`;

  const mainFn = `
fn main() {
${argDecls}
    bb_emit!(0, "{}");
    ${callInvocation}
}
`;

  return [
    userUses,
    prefixStruct,
    RUST_PREAMBLE,
    traceHelper,
    instrumentedBody,
    mainFn,
  ].filter(s => s.trim() !== '').join('\n');
}

function instrumentRustBody(body: string): string {
  const lines = body.split('\n');
  const result: string[] = [];
  let userLineNum = 0;
  let depth = 0;
  const varStack: string[][] = [[]];

  for (const line of lines) {
    userLineNum++;
    const trimmed = line.trim();
    result.push(line);

    const opens  = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    // Track parameters in fn signatures
    if (depth <= 1 && opens > 0) {
      const fnMatch = trimmed.match(/fn\s+\w+\s*(?:<[^>]*>)?\s*\(([^)]*)\)/);
      if (fnMatch && fnMatch[1]) {
        const params = fnMatch[1]
          .split(',')
          .map(p => p.trim())
          .filter(p => p && !p.includes('&self') && p !== 'self')
          .map(p => p.split(':')[0].replace(/^mut\s+/, '').trim())
          .filter((p): p is string => Boolean(p && /^[a-zA-Z_]\w*$/.test(p) && p !== '_'));
        if (params.length > 0) {
          (varStack[varStack.length - 1] || []).push(...params);
        }
      }
    }

    if (depth >= 1) {
      const newVars = extractRustVars(line);
      if (newVars.length > 0) {
        (varStack[varStack.length - 1] || []).push(...newVars);
      }

      const isStatement =
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('/*') &&
        trimmed !== '' && trimmed !== '{' && trimmed !== '}' &&
        (trimmed.endsWith(';') || trimmed.startsWith('return'));

      if (isStatement) {
        const allVars = [...new Set(varStack.flat())];
        const pairs = allVars.map(v => `"${v}" => ${v}`).join(', ');
        const varsExpr = allVars.length > 0 ? `bb_vars!(${pairs})` : '"{}".to_string()';
        const indent = line.match(/^(\s*)/)?.[1] ?? '    ';
        result.push(`${indent}bb_emit!(${userLineNum}, &${varsExpr});`);
      }
    }

    depth += opens;
    depth -= closes;
    if (opens > 0) for (let i = 0; i < opens; i++) varStack.push([]);
    if (closes > 0) for (let i = 0; i < closes; i++) { if (varStack.length > 1) varStack.pop(); }
  }

  return result.join('\n');
}

function rustArgType(v: any): string {
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'i32' : 'f64';
  if (typeof v === 'string') return 'String';
  if (Array.isArray(v)) {
    if (v.length === 0) return 'Vec<i32>';
    const f = v[0];
    if (Array.isArray(f)) return 'Vec<Vec<i32>>';
    if (typeof f === 'string') return 'Vec<String>';
    return 'Vec<i32>';
  }
  return 'i32';
}

function rustLiteral(v: any): string {
  if (v === null || v === undefined) return 'None';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return `String::from("${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
  if (Array.isArray(v)) {
    if (v.length === 0) return 'vec![]';
    return `vec![${v.map(rustLiteral).join(', ')}]`;
  }
  return JSON.stringify(v);
}
