'use client';
// src/components/editor/TestResults.tsx

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
      <div className="card px-4 py-3 text-xs font-mono text-[#666] flex items-center gap-2">
        <div className="spinner" /> Running tests…
      </div>
    );
  }
  if (!results.length) return null;

  const allPassed = passed === total;

  return (
    <div className="card overflow-hidden">
      {/* Summary bar */}
      <div className={`px-4 py-2.5 border-b border-[#1a1a1a] flex items-center justify-between
        ${allPassed ? 'bg-[#00e87a08]' : 'bg-[#ff4d4d08]'}`}>
        <span className={`text-xs font-mono font-bold ${allPassed ? 'text-[#00e87a]' : 'text-[#ff4d4d]'}`}>
          {allPassed ? '✓ All tests passed' : `✗ ${passed}/${total} tests passed`}
        </span>
        <div className="flex gap-1">
          {results.map((r, i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full ${r.ok ? 'bg-[#00e87a]' : 'bg-[#ff4d4d]'}`}
              title={`Test ${i + 1}: ${r.ok ? 'Pass' : 'Fail'}`}
            />
          ))}
        </div>
      </div>

      {/* Per-case rows */}
      <div className="divide-y divide-[#161616]">
        {results.map((r, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-xs font-mono font-bold ${r.ok ? 'text-[#00e87a]' : 'text-[#ff4d4d]'}`}>
                {r.ok ? '✓' : '✗'} Case {i + 1}
              </span>
              {r.time && <span className="text-[10px] text-[#333] font-mono">{r.time}</span>}
            </div>
            <div className="space-y-0.5 text-xs font-mono">
              <div className="flex gap-2">
                <span className="text-[#444] w-16 shrink-0">Input:</span>
                <code className="text-[#888] truncate">{r.input || '(empty)'}</code>
              </div>
              <div className="flex gap-2">
                <span className="text-[#444] w-16 shrink-0">Expected:</span>
                <code className="text-[#00e87a]">{r.expected}</code>
              </div>
              <div className="flex gap-2">
                <span className="text-[#444] w-16 shrink-0">Got:</span>
                <code className={r.ok ? 'text-[#00e87a]' : 'text-[#ff4d4d]'}>{r.actual || '(no output)'}</code>
              </div>
              {r.error && (
                <div className="flex gap-2 mt-0.5">
                  <span className="text-[#444] w-16 shrink-0">Error:</span>
                  <code className="text-[#f0b429] text-[10px] leading-relaxed">{r.error}</code>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
