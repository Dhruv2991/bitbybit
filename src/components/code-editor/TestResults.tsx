'use client';
// src/components/code-editor/TestResults.tsx

import type { TestResult } from '@/lib/executor';

interface TestResultsProps {
  results: TestResult[];
  passed:  number;
  total:   number;
  loading: boolean;
}

export default function TestResults({ results, passed, total, loading }: TestResultsProps) {
  if (loading) {
    return (
      <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl px-4 py-3 text-xs font-mono text-zinc-400 flex items-center gap-2.5">
        <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <span>Running test suite…</span>
      </div>
    );
  }
  if (!results.length) return null;

  const allPassed = passed === total;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl overflow-hidden">
      {/* Summary bar */}
      <div className={`px-4 py-2.5 border-b border-zinc-800/80 flex items-center justify-between
        ${allPassed ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
        <span className={`text-xs font-mono font-semibold flex items-center gap-1.5 ${allPassed ? 'text-emerald-400' : 'text-rose-400'}`}>
          <span>{allPassed ? '✓' : '✗'}</span>
          <span>{allPassed ? 'All tests passed' : `${passed}/${total} test cases passed`}</span>
        </span>
        <div className="flex gap-1.5 items-center">
          {results.map((r, i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full transition-transform ${r.ok ? 'bg-emerald-500 shadow-sm' : 'bg-rose-500 shadow-sm'}`}
              title={`Test ${i + 1}: ${r.ok ? 'Pass' : 'Fail'}`}
            />
          ))}
        </div>
      </div>

      {/* Per-case rows */}
      <div className="divide-y divide-zinc-800/60">
        {results.map((r, i) => (
          <div key={i} className="px-4 py-3 hover:bg-zinc-900/40 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-mono font-semibold flex items-center gap-1.5 ${r.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                <span>{r.ok ? '✓' : '✗'}</span>
                <span>Case {i + 1}</span>
              </span>
              {r.time && <span className="text-[11px] text-zinc-500 font-mono">{r.time}</span>}
            </div>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex gap-2">
                <span className="text-zinc-500 w-20 shrink-0 font-sans text-[11px]">Input:</span>
                <code className="text-zinc-300 truncate bg-zinc-950/60 px-1.5 py-0.5 rounded border border-zinc-800/50">{r.input || '(empty)'}</code>
              </div>
              <div className="flex gap-2">
                <span className="text-zinc-500 w-20 shrink-0 font-sans text-[11px]">Expected:</span>
                <code className="text-emerald-400 bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-900/40">{r.expected}</code>
              </div>
              <div className="flex gap-2">
                <span className="text-zinc-500 w-20 shrink-0 font-sans text-[11px]">Got:</span>
                <code className={`px-1.5 py-0.5 rounded border ${
                  r.ok 
                    ? 'text-emerald-400 bg-emerald-950/30 border-emerald-900/40' 
                    : 'text-rose-400 bg-rose-950/30 border-rose-900/40'
                }`}>
                  {r.actual || '(no output)'}
                </code>
              </div>
              {r.error && (
                <div className="flex gap-2 mt-1.5 pt-1.5 border-t border-zinc-800/50">
                  <span className="text-amber-500 w-20 shrink-0 font-sans text-[11px]">Error:</span>
                  <code className="text-amber-400 text-[11px] leading-relaxed bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-900/40 flex-1">{r.error}</code>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
