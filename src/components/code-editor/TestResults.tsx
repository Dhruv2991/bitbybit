'use client';
// ════════════════════════════════════════════════════════════
// src/components/code-editor/TestResults.tsx
// ════════════════════════════════════════════════════════════

import type { TestResult } from '@/lib/executor';
import { formatTestCaseInput } from '@/lib/testCaseFormatter';

interface TestResultsProps {
  results: TestResult[];
  passed:  number;
  total:   number;
  loading: boolean;
  starterCode?: string;
  paramNames?: string[];
}

export default function TestResults({
  results,
  passed,
  total,
  loading,
  starterCode,
  paramNames,
}: TestResultsProps) {
  if (loading) {
    return (
      <div className="bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/80 rounded-xl px-4 py-3 text-xs font-mono text-slate-600 dark:text-zinc-400 flex items-center gap-2.5 shadow-xs">
        <div className="w-3.5 h-3.5 border-2 border-cyan-500 dark:border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <span>Running test suite…</span>
      </div>
    );
  }
  if (!results.length) return null;

  const allPassed = passed === total;

  return (
    <div className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/80 rounded-xl overflow-hidden shadow-xs">
      {/* Summary bar */}
      <div
        className={`px-4 py-2.5 border-b border-slate-200 dark:border-zinc-800/80 flex items-center justify-between
        ${allPassed ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}
      >
        <span
          className={`text-xs font-mono font-semibold flex items-center gap-1.5 ${
            allPassed ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
          }`}
        >
          <span>{allPassed ? '✓' : '✗'}</span>
          <span>
            {allPassed
              ? 'All test cases passed!'
              : `${passed}/${total} test cases passed`}
          </span>
        </span>
        <div className="flex gap-1.5 items-center flex-wrap max-w-[200px] justify-end">
          {results.map((r, i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full transition-transform ${
                r.ok ? 'bg-emerald-500 shadow-xs' : 'bg-rose-500 shadow-xs'
              }`}
              title={`Test ${i + 1}: ${r.ok ? 'Pass' : 'Fail'}${r.is_hidden || r.input.includes('Hidden') ? ' (Hidden)' : ''}`}
            />
          ))}
        </div>
      </div>

      {/* Per-case rows */}
      <div className="divide-y divide-slate-100 dark:divide-zinc-800/60 max-h-[380px] overflow-y-auto">
        {results.map((r, i) => {
          const isHidden = Boolean(r.is_hidden) || r.input === '[Hidden]' || r.input.includes('Hidden');
          const formattedInput = isHidden
            ? 'Hidden Test Case'
            : formatTestCaseInput(r.input, paramNames || starterCode || '');

          return (
            <div key={i} className="px-4 py-3 hover:bg-slate-50/80 dark:hover:bg-zinc-900/40 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-xs font-mono font-semibold flex items-center gap-1.5 ${
                    r.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                  }`}
                >
                  <span>{r.ok ? '✓' : '✗'}</span>
                  <span>Case {i + 1}</span>
                  {isHidden && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 ml-1">
                      🔒 Hidden
                    </span>
                  )}
                </span>
                {r.time && (
                  <span className="text-[11px] text-slate-500 dark:text-zinc-500 font-mono">{r.time}</span>
                )}
              </div>

              <div className="space-y-1.5 text-xs font-mono">
                {/* Input row */}
                <div className="flex gap-2 items-start">
                  <span className="text-slate-500 dark:text-zinc-500 w-20 shrink-0 font-sans text-[11px] select-none pt-0.5">
                    Input:
                  </span>
                  {isHidden ? (
                    <span className="text-slate-500 dark:text-zinc-500 italic text-[11px]">
                      [Hidden test inputs are masked for security]
                    </span>
                  ) : (
                    <code className="text-slate-800 dark:text-zinc-300 break-all bg-slate-50 dark:bg-zinc-950/60 px-2 py-0.5 rounded border border-slate-200 dark:border-zinc-800/50 flex-1">
                      {formattedInput}
                    </code>
                  )}
                </div>

                {/* Expected row (if visible) */}
                {!isHidden && (
                  <div className="flex gap-2 items-start">
                    <span className="text-slate-500 dark:text-zinc-500 w-20 shrink-0 font-sans text-[11px] select-none pt-0.5">
                      Expected:
                    </span>
                    <code className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-900/40 break-all flex-1">
                      {r.expected}
                    </code>
                  </div>
                )}

                {/* Got/Actual row */}
                <div className="flex gap-2 items-start">
                  <span className="text-slate-500 dark:text-zinc-500 w-20 shrink-0 font-sans text-[11px] select-none pt-0.5">
                    Got:
                  </span>
                  {isHidden ? (
                    <span className={`text-[11px] font-semibold ${r.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                      {r.ok ? 'Passed' : 'Failed'}
                    </span>
                  ) : (
                    <code
                      className={`px-2 py-0.5 rounded border break-all flex-1 ${
                        r.ok
                          ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40'
                          : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/40'
                      }`}
                    >
                      {r.actual || (r.ok ? '(empty output)' : '(no output)')}
                    </code>
                  )}
                </div>

                {/* Error row */}
                {r.error && (
                  <div className="flex gap-2 mt-1.5 pt-1.5 border-t border-slate-200 dark:border-zinc-800/50">
                    <span className="text-amber-600 dark:text-amber-500 w-20 shrink-0 font-sans text-[11px] select-none">
                      Error:
                    </span>
                    <code className="text-amber-800 dark:text-amber-400 text-[11px] leading-relaxed bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-900/40 flex-1 break-all">
                      {r.error}
                    </code>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
