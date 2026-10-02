'use client';
// ════════════════════════════════════════════════════════════
// src/components/profile/ContributionHeatmap.tsx
// GitHub-style contribution heatmap — takes an array of ISO date
// strings (one per solve) and renders a 26-week grid of squares,
// darker green = more solves that day.
// ════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react';

interface Props {
  dates: string[]; // ISO timestamps, one per solved submission
}

const WEEKS = 26; // ~6 months, fits nicely on a profile card
const DAY_MS = 86400000;

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export default function ContributionHeatmap({ dates }: Props) {
  const [hovered, setHovered] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  const { grid, max, totalDays } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of dates) {
      const key = startOfDay(new Date(d)).toISOString().slice(0, 10);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const today = startOfDay(new Date());
    // Align the grid so the last column ends on today, first column
    // starts WEEKS*7 days back, and rows are Sun(0)..Sat(6).
    const endOfGridWeek = new Date(today);
    endOfGridWeek.setDate(endOfGridWeek.getDate() + (6 - today.getDay()));
    const start = new Date(endOfGridWeek);
    start.setDate(start.getDate() - (WEEKS * 7 - 1));

    const cols: { date: string; count: number; inFuture: boolean }[][] = [];
    let cursor = new Date(start);
    for (let w = 0; w < WEEKS; w++) {
      const col: { date: string; count: number; inFuture: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const key = cursor.toISOString().slice(0, 10);
        col.push({ date: key, count: counts.get(key) || 0, inFuture: cursor.getTime() > today.getTime() });
        cursor = new Date(cursor.getTime() + DAY_MS);
      }
      cols.push(col);
    }

    const max = Math.max(1, ...Array.from(counts.values()));
    return { grid: cols, max, totalDays: counts.size };
  }, [dates]);

  function colorFor(count: number) {
    if (count === 0) return '#27272a'; // zinc-800
    const ratio = count / max;
    if (ratio > 0.75) return '#10b981'; // emerald-500
    if (ratio > 0.5) return '#059669'; // emerald-600
    if (ratio > 0.25) return '#047857'; // emerald-700
    return '#064e3b'; // emerald-900
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 mb-6 relative">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-sm text-zinc-100">
          Activity <span className="text-zinc-500 font-mono font-normal text-xs">({totalDays} active days, last {WEEKS} weeks)</span>
        </h2>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
          <span>Less</span>
          {[0, 0.2, 0.4, 0.6, 0.8].map((r) => (
            <div key={r} className="w-2.5 h-2.5 rounded-sm" style={{ background: colorFor(r * max || (r === 0 ? 0 : 1)) }} />
          ))}
          <span>More</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-[3px] w-max">
          {grid.map((col, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {col.map((cell, di) => (
                <div
                  key={di}
                  className={`w-2.5 h-2.5 rounded-sm transition-transform ${cell.inFuture ? 'opacity-0' : 'hover:scale-125 cursor-pointer'}`}
                  style={{ background: cell.inFuture ? 'transparent' : colorFor(cell.count) }}
                  onMouseEnter={(e) => {
                    if (cell.inFuture) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHovered({ date: cell.date, count: cell.count, x: rect.left, y: rect.top });
                  }}
                  onMouseLeave={() => setHovered(null)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {hovered && (
        <div
          className="fixed z-50 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-700 text-[11px] font-mono text-zinc-200 shadow-lg pointer-events-none"
          style={{ left: hovered.x, top: hovered.y - 32 }}
        >
          {hovered.count} solve{hovered.count === 1 ? '' : 's'} on {new Date(hovered.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      )}
    </div>
  );
}
