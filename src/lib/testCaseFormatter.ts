// ════════════════════════════════════════════════════════════
// src/lib/testCaseFormatter.ts
//
// Formats raw test case inputs (e.g. "[[1,2,1,3], 3]") into clean,
// LeetCode-style parameter key-value pairs (e.g. "readings = [1, 2, 1, 3], k = 3")
// based on the problem's function signature and starter code.
// ════════════════════════════════════════════════════════════

export interface ParamMapping {
  name: string;
  value: string;
  rawValue: any;
}

/**
 * Extracts parameter names from starter code in any supported language
 * (Python def, JavaScript function/arrow, C++, Java, Go, Rust).
 */
export function extractParamNames(
  problem?: { starter_code?: string; param_types?: string[] } | string | null
): string[] {
  if (!problem) return [];
  const code = typeof problem === 'string' ? problem : (problem.starter_code || '');

  if (!code.trim()) {
    return [];
  }

  // 1. Python: def solution(readings, k):
  const pyMatch = code.match(/def\s+\w+\s*\(([^)]*)\)/);
  if (pyMatch && pyMatch[1]) {
    const params = pyMatch[1]
      .split(',')
      .map(p => p.trim())
      .filter(p => p && p !== 'self')
      .map(p => p.split(':')[0].trim());
    if (params.length > 0) return params;
  }

  // 2. JavaScript: function solution(readings, k) or const solution = (readings, k) =>
  const jsMatch = code.match(/(?:function\s+\w+|\w+\s*=\s*(?:function|\([^)]*\)\s*=>))\s*\(([^)]*)\)/);
  if (jsMatch && jsMatch[1]) {
    const params = jsMatch[1]
      .split(',')
      .map(p => p.trim())
      .filter(Boolean);
    if (params.length > 0) return params;
  }

  // 3. C++: int solution(vector<int>& readings, int k)
  const cppMatch = code.match(/\w[\w<>:*&\s]+\s+\w+\s*\(([^)]*)\)\s*\{/);
  if (cppMatch && cppMatch[1]) {
    const params = cppMatch[1]
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        const parts = p.split(/\s+/);
        return parts[parts.length - 1].replace(/^[&*]+/, '');
      })
      .filter(Boolean);
    if (params.length > 0) return params;
  }

  // 4. Java: public int solution(int[] readings, int k)
  const javaMatch = code.match(/(?:public|private|protected|static|\s)+[\w<>\[\]]+\s+\w+\s*\(([^)]*)\)/);
  if (javaMatch && javaMatch[1]) {
    const params = javaMatch[1]
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        const parts = p.split(/\s+/);
        return parts[parts.length - 1];
      })
      .filter(Boolean);
    if (params.length > 0) return params;
  }

  // 5. Go: func solution(readings []int, k int)
  const goMatch = code.match(/func\s+\w+\s*\(([^)]*)\)/);
  if (goMatch && goMatch[1]) {
    const params = goMatch[1]
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => p.split(/\s+/)[0])
      .filter(Boolean);
    if (params.length > 0) return params;
  }

  // 6. Rust: fn solution(readings: Vec<i32>, k: i32)
  const rustMatch = code.match(/fn\s+\w+\s*(?:<[^>]*>)?\s*\(([^)]*)\)/);
  if (rustMatch && rustMatch[1]) {
    const params = rustMatch[1]
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => p.split(':')[0].trim())
      .filter(Boolean);
    if (params.length > 0) return params;
  }

  return [];
}

/**
 * Prettifies a JSON string value for inline display
 */
export function formatValue(val: any): string {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  if (typeof val === 'string') return JSON.stringify(val);
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);

  if (Array.isArray(val)) {
    const formatted = val.map(formatValue).join(', ');
    return `[${formatted}]`;
  }

  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }

  return String(val);
}

/**
 * Parses raw test case input JSON and maps each argument to its parameter name.
 */
export function parseTestCaseArguments(
  rawInput: string,
  problemOrParams?: { starter_code?: string; param_types?: string[] } | string[] | string | null
): ParamMapping[] {
  const paramNames: string[] = Array.isArray(problemOrParams)
    ? problemOrParams
    : extractParamNames(problemOrParams as any);

  let parsed: any;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    // If not valid JSON, treat as raw single value
    const name = paramNames[0] || 'input';
    return [{ name, value: rawInput, rawValue: rawInput }];
  }

  // Case A: parsed value is an array of arguments (standard platform format)
  if (Array.isArray(parsed)) {
    // If single parameter expected
    if (paramNames.length === 1) {
      // If input was wrapped in outer array [[1, 2, 3]], unwrap outer array
      if (parsed.length === 1 && Array.isArray(parsed[0])) {
        return [{
          name: paramNames[0],
          value: formatValue(parsed[0]),
          rawValue: parsed[0],
        }];
      }
      // If input is a 1D array [1, 2, 3] for a single array parameter, bind the entire array
      if (parsed.length > 1) {
        return [{
          name: paramNames[0],
          value: formatValue(parsed),
          rawValue: parsed,
        }];
      }
      return [{
        name: paramNames[0],
        value: formatValue(parsed[0]),
        rawValue: parsed[0],
      }];
    }

    // If multiple parameters
    if (paramNames.length > 0) {
      // If outer array contains arguments for each parameter
      if (parsed.length === paramNames.length) {
        return parsed.map((arg, idx) => ({
          name: paramNames[idx] || `arg${idx + 1}`,
          value: formatValue(arg),
          rawValue: arg,
        }));
      }

      // If array length is different from param count, map positional as far as possible
      return parsed.map((arg, idx) => ({
        name: paramNames[idx] || `arg${idx + 1}`,
        value: formatValue(arg),
        rawValue: arg,
      }));
    }

    // No parameter names known: if single element wrapped array [[1, 2, 3]], unwrap
    if (parsed.length === 1 && Array.isArray(parsed[0])) {
      return [{
        name: 'arg1',
        value: formatValue(parsed[0]),
        rawValue: parsed[0],
      }];
    }

    if (parsed.length === 1) {
      return [{
        name: 'arg1',
        value: formatValue(parsed[0]),
        rawValue: parsed[0],
      }];
    }

    return parsed.map((arg, idx) => ({
      name: `arg${idx + 1}`,
      value: formatValue(arg),
      rawValue: arg,
    }));
  }

  // Case B: parsed value is a primitive or object (not wrapped in array)
  const singleName = paramNames[0] || 'input';
  return [{
    name: singleName,
    value: formatValue(parsed),
    rawValue: parsed,
  }];
}

/**
 * Returns formatted string: "readings = [1, 2, 1, 3], k = 3"
 */
export function formatTestCaseInput(
  rawInput: string,
  problemOrParams?: { starter_code?: string; param_types?: string[] } | string[] | string | null
): string {
  if (!rawInput && rawInput !== '0' && rawInput !== 'false') return '(empty)';

  const mappings = parseTestCaseArguments(rawInput, problemOrParams);
  if (!mappings || mappings.length === 0) return rawInput;

  // Format as "name = value, name2 = value2"
  return mappings.map(m => `${m.name} = ${m.value}`).join(', ');
}
