'use client';
// ════════════════════════════════════════════════════════════
// src/components/profile/ContributionHeatmap.tsx
// Clean, high-density developer activity heatmap
// ════════════════════════════════════════════════════════════
import { useMemo, useState } from 'react';
import { Calendar } from 'lucide-react';

interface Props {
  dates: string[];
}

const WEEKS = 26;
const DAY_MS = 86400000;

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export default function ContributionHeatmap({ dates }: Props) {
  const [hovered, setHovered] = useState<{
    date: string;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  const { grid, max, totalDays, totalSolves, monthLabels } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of dates) {
      const key = startOfDay(new Date(d)).toISOString().slice(0, 10);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const today = startOfDay(new Date());
    const endOfGridWeek = new Date(today);
    endOfGridWeek.setDate(endOfGridWeek.getDate() + (6 - today.getDay()));
    const start = new Date(endOfGridWeek);
    start.setDate(start.getDate() - (WEEKS * 7 - 1));

    const cols: { date: string; count: number; inFuture: boolean }[][] = [];
    const months: { label: string; colIndex: number }[] = [];
    let lastMonth = -1;

    let cursor = new Date(start);
    for (let w = 0; w < WEEKS; w++) {
      const col: { date: string; count: number; inFuture: boolean }[] = [];
      const colMonth = cursor.getMonth();
      if (colMonth !== lastMonth) {
        months.push({
          label: cursor.toLocaleString('default', { month: 'short' }),
          colIndex: w,
        });
        lastMonth = colMonth;
      }

      for (let d = 0; d < 7; d++) {
        const key = cursor.toISOString().slice(0, 10);
        col.push({
          date: key,
          count: counts.get(key) || 0,
          inFuture: cursor.getTime() > today.getTime(),
        });
        cursor = new Date(cursor.getTime() + DAY_MS);
      }
      cols.push(col);
    }

    const max = Math.max(1, ...Array.from(counts.values()));
    return {
      grid: cols,
      max,
      totalDays: counts.size,
      totalSolves: dates.length,
      monthLabels: months,
    };
  }, [dates]);

  function getLevel(count: number): number {
    if (count === 0) return 0;
    const ratio = count / max;
    if (ratio >= 0.8) return 4;
    if (ratio >= 0.5) return 3;
    if (ratio >= 0.25) return 2;
    return 1;
  }

  function getCellColor(level: number, inFuture: boolean): string {
    if (inFuture) return 'opacity-0 pointer-events-none';
    switch (level) {
      case 4:
        return 'bg-emerald-500 dark:bg-emerald-400 border border-emerald-600 dark:border-emerald-300';
      case 3:
        return 'bg-emerald-600 dark:bg-emerald-500 border border-emerald-700 dark:border-emerald-400/80';
      case 2:
        return 'bg-emerald-700/80 dark:bg-emerald-700 border border-emerald-800/60 dark:border-emerald-600/60';
      case 1:
        return 'bg-emerald-200 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800/60';
      default:
        return 'bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800/80 hover:border-slate-400 dark:hover:border-zinc-600';
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/50 backdrop-blur-xl p-5 transition-all duration-200 hover:border-slate-300 dark:hover:border-zinc-700/80 flex flex-col justify-between h-full shadow-xs">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-zinc-800/70">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Contribution Activity</h2>
              <span className="text-xs font-mono text-slate-500 dark:text-zinc-500 font-normal">
                ({totalDays} active days, {totalSolves} solves)
              </span>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-600 dark:text-zinc-400">
          <span className="text-slate-500 dark:text-zinc-500 text-[10px]">Less</span>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-[3px] bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800" />
            <div className="w-2.5 h-2.5 rounded-[3px] bg-emerald-200 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800" />
            <div className="w-2.5 h-2.5 rounded-[3px] bg-emerald-700/80 dark:bg-emerald-700 border border-emerald-800 dark:border-emerald-600" />
            <div className="w-2.5 h-2.5 rounded-[3px] bg-emerald-600 dark:bg-emerald-500 border border-emerald-700 dark:border-emerald-400" />
            <div className="w-2.5 h-2.5 rounded-[3px] bg-emerald-500 dark:bg-emerald-400 border border-emerald-600 dark:border-emerald-300" />
          </div>
          <span className="text-slate-700 dark:text-zinc-300 text-[10px]">More</span>
        </div>
      </div>

      {/* Heatmap Grid with Month / Day Axes */}
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent pb-1">
        <div className="min-w-max">
          {/* Month Axis */}
          <div className="flex gap-[3.5px] ml-7 mb-1.5 text-[10px] font-mono text-slate-500 dark:text-zinc-400">
            {grid.map((_, wi) => {
              const month = monthLabels.find((m) => m.colIndex === wi);
              return (
                <div key={wi} className="w-3 text-left">
                  {month ? <span className="text-slate-600 dark:text-zinc-400 font-medium">{month.label}</span> : null}
                </div>
              );
            })}
          </div>

          {/* Days + Grid Body */}
          <div className="flex items-start gap-1.5">
            {/* Weekday axis labels */}
            <div className="flex flex-col justify-between h-[96px] text-[9.5px] font-mono text-slate-400 dark:text-zinc-500 pr-1 select-none">
              <span>Mon</span>
              <span>Wed</span>
              <span>Fri</span>
            </div>

            {/* Contribution Cells */}
            <div className="flex gap-[3.5px]">
              {grid.map((col, wi) => (
                <div key={wi} className="flex flex-col gap-[3.5px]">
                  {col.map((cell, di) => {
                    const level = getLevel(cell.count);
                    return (
                      <div
                        key={di}
                        className={`w-3 h-3 rounded-[3px] transition-all duration-150 ${getCellColor(
                          level,
                          cell.inFuture
                        )} ${!cell.inFuture ? 'hover:scale-125 cursor-pointer' : ''}`}
                        onMouseEnter={(e) => {
                          if (cell.inFuture) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHovered({
                            date: cell.date,
                            count: cell.count,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }}
                        onMouseLeave={() => setHovered(null)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Clean Tooltip */}
      {hovered && (
        <div
          className="fixed z-50 -translate-x-1/2 -translate-y-full mb-2 pointer-events-none animate-in fade-in zoom-in-95 duration-150"
          style={{ left: hovered.x, top: hovered.y - 6 }}
        >
          <div className="rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700/80 px-2.5 py-1.5 text-xs font-mono text-slate-800 dark:text-zinc-200 shadow-xl backdrop-blur-md">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {hovered.count} solve{hovered.count === 1 ? '' : 's'}
            </span>{' '}
            on {new Date(hovered.date).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
        </div>
      )}
    </div>
  );
}
