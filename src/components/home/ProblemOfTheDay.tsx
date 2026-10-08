'use client';

import { useState, useEffect } from 'react';
import type { Problem } from '@/types/database';

interface ProblemOfTheDayProps {
  problem: Problem | null;
  solvedToday: boolean;
  solverCount: number | null;
  loading?: boolean;
  onSolve: (problemId: string) => void;
}

import SpotlightCard from '@/components/ui/SpotlightCard';

export default function ProblemOfTheDay({
  problem,
  solvedToday,
  solverCount,
  loading = false,
  onSolve,
}: ProblemOfTheDayProps) {
  const [timeLeft, setTimeLeft] = useState('');

  // Live countdown to midnight UTC/local
  useEffect(() => {
    function updateCountdown() {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const ms = midnight.getTime() - now.getTime();
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setTimeLeft(`${h}h ${m}m`);
    }
    updateCountdown();
    const interval = setInterval(updateCountdown, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="p-6 rounded-2xl bg-zinc-900/40 border border-white/[0.06] backdrop-blur-xl animate-pulse">
        <div className="h-4 w-32 bg-zinc-800 rounded-full mb-4" />
        <div className="h-5 w-3/4 bg-zinc-800 rounded-lg mb-3" />
        <div className="h-4 w-1/2 bg-zinc-800 rounded-lg mb-6" />
        <div className="h-9 w-32 bg-zinc-800 rounded-lg" />
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="p-6 rounded-2xl bg-zinc-900/40 border border-white/[0.06] backdrop-blur-xl text-center text-xs font-mono text-zinc-400">
        No problem of the day available right now. Check the problem set!
      </div>
    );
  }

  const diffBadge =
    problem.difficulty === 'Easy'
      ? 'diff-easy'
      : problem.difficulty === 'Medium'
      ? 'diff-medium'
      : 'diff-hard';

  return (
    <SpotlightCard
      spotlightColor="rgba(245, 158, 11, 0.08)"
      className="p-6 flex flex-col justify-between h-full transition-all group"
    >
      <div>
        {/* Top metadata bar */}
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-mono font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-500/20">
              <span>⭐</span> Problem of the Day
            </span>
            <span className={diffBadge}>
              {problem.difficulty}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-zinc-300">
            <span>⏳ Resets in</span>
            <span className="text-slate-900 dark:text-zinc-100 font-semibold">{timeLeft}</span>
          </div>
        </div>

        {/* Problem Title & Description Preview */}
        <h2 className="font-semibold text-lg sm:text-xl text-slate-900 dark:text-zinc-100 mb-2 group-hover:text-sky-600 dark:group-hover:text-cyan-300 transition-colors line-clamp-1">
          {problem.title}
        </h2>

        <p className="font-sans text-sm text-slate-600 dark:text-zinc-300 line-clamp-2 leading-relaxed mb-4">
          {problem.description?.replace(/<[^>]*>?/gm, '').slice(0, 160) || 'Solve this algorithmic challenge to earn points and maintain your daily coding streak.'}
        </p>

        {/* Tags row */}
        {problem.tags && problem.tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-4">
            {problem.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-xs font-mono px-2.5 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-950/60 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-white/[0.06]"
              >
                #{tag}
              </span>
            ))}
            {problem.points ? (
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-md bg-sky-50 text-sky-700 dark:bg-cyan-500/10 dark:text-cyan-400 font-medium border border-sky-200 dark:border-cyan-500/20">
                +{problem.points} pts
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* Footer & CTA */}
      <div className="pt-4 border-t border-slate-200 dark:border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {solvedToday ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-mono font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-3 py-1.5 rounded-lg">
              <span>✓</span> Solved Today
            </span>
          ) : solverCount !== null && solverCount > 0 ? (
            <span className="text-sm font-mono text-slate-600 dark:text-zinc-300 flex items-center gap-1">
              <span>🔥</span> {solverCount} {solverCount === 1 ? 'coder' : 'coders'} solved
            </span>
          ) : (
            <span className="text-xs font-mono text-slate-500 dark:text-zinc-400">
              Be the first to solve today!
            </span>
          )}
        </div>

        <button
          onClick={() => onSolve(problem.id)}
          className={`text-sm font-mono font-medium px-4 py-2 rounded-xl transition-all flex items-center gap-2 shadow-sm
            ${solvedToday
              ? 'btn-ghost'
              : 'btn-primary'
            }`}
        >
          <span>{solvedToday ? 'Review Solution' : 'Solve Now'}</span>
          <span>→</span>
        </button>
      </div>
    </SpotlightCard>
  );
}
