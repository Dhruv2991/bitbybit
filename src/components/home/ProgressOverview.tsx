'use client';

interface DifficultyStat {
  solved: number;
  total: number;
}

interface ProgressOverviewProps {
  easy: DifficultyStat;
  medium: DifficultyStat;
  hard: DifficultyStat;
  loading?: boolean;
  onExplore: () => void;
}

import SpotlightCard from '@/components/ui/SpotlightCard';

export default function ProgressOverview({
  easy,
  medium,
  hard,
  loading = false,
  onExplore,
}: ProgressOverviewProps) {
  const totalSolved = easy.solved + medium.solved + hard.solved;
  const totalAvailable = easy.total + medium.total + hard.total;
  const overallPercent = totalAvailable > 0 ? Math.round((totalSolved / totalAvailable) * 100) : 0;

  const difficulties = [
    {
      label: 'Easy',
      solved: easy.solved,
      total: easy.total,
      percent: easy.total > 0 ? Math.round((easy.solved / easy.total) * 100) : 0,
      badgeClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      barClass: 'bg-emerald-500',
    },
    {
      label: 'Medium',
      solved: medium.solved,
      total: medium.total,
      percent: medium.total > 0 ? Math.round((medium.solved / medium.total) * 100) : 0,
      badgeClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      barClass: 'bg-amber-500',
    },
    {
      label: 'Hard',
      solved: hard.solved,
      total: hard.total,
      percent: hard.total > 0 ? Math.round((hard.solved / hard.total) * 100) : 0,
      badgeClass: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      barClass: 'bg-rose-500',
    },
  ];

  return (
    <SpotlightCard
      spotlightColor="rgba(16, 185, 129, 0.08)"
      className="p-6 flex flex-col justify-between h-full transition-all"
    >
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-base text-slate-900 dark:text-zinc-100">
            Your Progress
          </h2>
          <span className="text-xs font-mono font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-2 py-0.5 rounded-full">
            {overallPercent}% Solved
          </span>
        </div>

        {/* Overall Progress Bar */}
        <div className="w-full bg-slate-100 dark:bg-zinc-950/60 h-2 rounded-full overflow-hidden mb-5 border border-slate-200 dark:border-white/[0.06] flex">
          {loading ? (
            <div className="w-full h-full bg-slate-200 dark:bg-zinc-800 animate-pulse" />
          ) : (
            <>
              <div
                style={{ width: `${totalAvailable > 0 ? (easy.solved / totalAvailable) * 100 : 0}%` }}
                className="bg-emerald-500 h-full transition-all duration-500"
              />
              <div
                style={{ width: `${totalAvailable > 0 ? (medium.solved / totalAvailable) * 100 : 0}%` }}
                className="bg-amber-500 h-full transition-all duration-500"
              />
              <div
                style={{ width: `${totalAvailable > 0 ? (hard.solved / totalAvailable) * 100 : 0}%` }}
                className="bg-rose-500 h-full transition-all duration-500"
              />
            </>
          )}
        </div>

        {/* Breakdown by difficulty */}
        <div className="space-y-3 mb-4">
          {difficulties.map((d) => (
            <div key={d.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-800 dark:text-zinc-200 font-medium flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${d.barClass}`} />
                  {d.label}
                </span>
                <span className="text-slate-500 dark:text-zinc-400 tabular-nums text-[11px]">
                  {loading ? '...' : `${d.solved} / ${d.total}`} ({d.percent}%)
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-zinc-950/60 h-1.5 rounded-full overflow-hidden border border-slate-200/80 dark:border-white/[0.04]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${d.barClass}`}
                  style={{ width: `${d.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="pt-4 mt-2 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-between">
        <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-500">
          {totalSolved} of {totalAvailable} problems
        </span>
        <button
          onClick={onExplore}
          className="text-xs font-mono text-sky-600 dark:text-cyan-400 hover:text-sky-700 dark:hover:text-cyan-300 font-medium transition-colors"
        >
          View all →
        </button>
      </div>
    </SpotlightCard>
  );
}
