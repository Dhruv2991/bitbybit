// ════════════════════════════════════════════════════════════
// src/lib/parseExecutionStdout.ts
// Standardized stdout trace parser for compiled & interpreted
// execution outputs. Extracts __BB_TRACE__ tokens and returns
// clean user stdout and structured step arrays.
// ════════════════════════════════════════════════════════════

import type { ExecStep } from '@/lib/visualizer';

export interface ParsedTraceOutput {
  steps: ExecStep[];
  cleanStdout: string;
}

const TRACE_PREFIX = '__BB_TRACE__:';

/**
 * Format any variable value to a safe readable representation for the inspector.
 */
export function formatVariableValue(val: any): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'string') {
    return val.startsWith('"') || val.startsWith("'") ? val : `"${val}"`;
  }
  if (typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  if (Array.isArray(val)) {
    const items = val.map(formatVariableValue);
    const joined = `[${items.join(', ')}]`;
    return joined.length > 300 ? joined.slice(0, 297) + '…]' : joined;
  }
  if (typeof val === 'object') {
    try {
      const s = JSON.stringify(val);
      return s.length > 300 ? s.slice(0, 297) + '…}' : s;
    } catch {
      return '<object>';
    }
  }
  return String(val);
}

/**
 * Parses stdout from an instrumented compiler execution.
 * Extracts all __BB_TRACE__ markers and produces structured steps.
 */
export function parseExecutionStdout(rawStdout: string): ParsedTraceOutput {
  const steps: ExecStep[] = [];
  const cleanStdoutLines: string[] = [];

  const lines = rawStdout.split(/\r?\n/);
  let cumulativeStdout = '';

  for (const line of lines) {
    const traceIdx = line.indexOf(TRACE_PREFIX);

    if (traceIdx !== -1) {
      // Extract prefix text if user printed something on the same line before trace
      const prefixText = line.slice(0, traceIdx).trim();
      if (prefixText) {
        cleanStdoutLines.push(prefixText);
        cumulativeStdout += (cumulativeStdout ? '\n' : '') + prefixText;
      }

      const payloadStr = line.slice(traceIdx + TRACE_PREFIX.length).trim();
      try {
        const parsed = JSON.parse(payloadStr);
        const lineNum = Number(parsed.line || parsed.lineNo || 1);
        const rawVars = parsed.vars || parsed.variables || {};

        const formattedVars: Record<string, string> = {};
        for (const [k, v] of Object.entries(rawVars)) {
          // Skip internal or empty keys
          if (k.startsWith('__')) continue;
          formattedVars[k] = typeof v === 'string' ? v : formatVariableValue(v);
        }

        steps.push({
          line: lineNum,
          variables: formattedVars,
          stdout: cumulativeStdout,
        });
      } catch {
        // Skip malformed trace lines gracefully
      }
    } else {
      cleanStdoutLines.push(line);
      cumulativeStdout += (cumulativeStdout ? '\n' : '') + line;
    }
  }

  return {
    steps,
    cleanStdout: cleanStdoutLines.join('\n').trim(),
  };
}
