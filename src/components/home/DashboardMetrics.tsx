'use client';

import { useState, useEffect } from 'react';

interface DashboardMetricsProps {
  problemsSolved: number;
  totalProblems: number;
  totalPoints: number;
  rank: number | null;
  streak: number;
  loading?: boolean;
}

function useCountUp(target: number, duration = 1000) {
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (target === undefined || target === null || target === 0) {
      setVal(0);
      return;
    }
    const start = performance.now();
    let frameId: number;

    function step(now: number) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.floor(eased * target));
      if (p < 1) {
        frameId = requestAnimationFrame(step);
      }
    }
    frameId = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frameId);
  }, [target, duration]);

  return val;
}

import SpotlightCard from '@/components/ui/SpotlightCard';

export default function DashboardMetrics({
  problemsSolved,
  totalProblems,
  totalPoints,
  rank,
  streak,
  loading = false,
}: DashboardMetricsProps) {
  const solvedCounted = useCountUp(problemsSolved);
  const pointsCounted = useCountUp(totalPoints);
  const streakCounted = useCountUp(streak);

  const metrics = [
    {
      id: 'solved',
      label: 'Problems Solved',
      value: loading ? null : solvedCounted.toLocaleString(),
      subtext: totalProblems > 0 ? `out of ${totalProblems} total` : 'curated problem set',
      icon: (
        <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ),
      accentBg: 'rgba(16, 185, 129, 0.1)',
      spotlight: 'rgba(16, 185, 129, 0.12)',
    },
    {
      id: 'points',
      label: 'Total Points',
      value: loading ? null : pointsCounted.toLocaleString(),
      subtext: 'across all categories',
      icon: (
        <svg className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ),
      accentBg: 'rgba(99, 102, 241, 0.1)',
      spotlight: 'rgba(99, 102, 241, 0.12)',
    },
    {
      id: 'rank',
      label: 'Global Rank',
      value: loading ? null : rank ? `#${rank}` : 'Unranked',
      subtext: rank ? 'on global leaderboard' : 'solve 1 problem to rank',
      icon: (
        <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.45 1-1 1H7" />
          <path d="M14 14.66V17c0 .55.45 1 1 1h2" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      ),
      accentBg: 'rgba(245, 158, 11, 0.1)',
      spotlight: 'rgba(245, 158, 11, 0.12)',
    },
    {
      id: 'streak',
      label: 'Current Streak',
      value: loading ? null : `${streakCounted}d`,
      subtext: streak > 0 ? 'active coding streak' : 'solve today to start',
      icon: <span className="text-sm leading-none">🔥</span>,
      accentBg: 'rgba(244, 63, 94, 0.1)',
      spotlight: 'rgba(244, 63, 94, 0.12)',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-8">
      {metrics.map((m) => (
        <SpotlightCard
          key={m.id}
          spotlightColor={m.spotlight}
          className="p-6 rounded-2xl hover:border-white/[0.15] transition-all duration-200"
        >
          <div className="flex items-center justify-between mb-3.5">
            <span className="text-sm font-sans text-zinc-300 font-medium">
              {m.label}
            </span>
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border border-white/[0.08]"
              style={{ background: m.accentBg }}
            >
              {m.icon}
            </div>
          </div>

          <div className="flex flex-col">
            {loading ? (
              <div className="h-8 w-24 rounded-lg bg-zinc-800/60 animate-pulse mb-1" />
            ) : (
              <span
                className="text-3xl font-sans font-bold text-zinc-100 tracking-tight tabular-nums"
              >
                {m.value}
              </span>
            )}
            <span className="text-xs font-sans text-zinc-400 mt-1.5 truncate">
              {m.subtext}
            </span>
          </div>
        </SpotlightCard>
      ))}
    </div>
  );
}
