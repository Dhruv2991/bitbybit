'use client';

import SpotlightCard from '@/components/ui/SpotlightCard';

interface LeaderboardUser {
  rank: number;
  github: string;
  name: string;
  points: number;
  solved: number;
}

interface LeaderboardPreviewProps {
  topUsers: LeaderboardUser[];
  currentUserGithub?: string;
  currentUserRank?: number | null;
  loading?: boolean;
  onViewFullLeaderboard: () => void;
}

export default function LeaderboardPreview({
  topUsers,
  currentUserGithub,
  currentUserRank,
  loading = false,
  onViewFullLeaderboard,
}: LeaderboardPreviewProps) {
  if (loading) {
    return (
      <div className="p-6 rounded-2xl bg-zinc-900/40 backdrop-blur-xl border border-white/[0.06] shadow-sm h-full">
        <div className="h-4 w-36 bg-zinc-800/60 rounded-lg animate-pulse mb-4" />
        <div className="space-y-2.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 bg-zinc-800/40 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const rankBadges: Record<number, string> = {
    1: '🥇',
    2: '🥈',
    3: '🥉',
  };

  return (
    <SpotlightCard
      spotlightColor="rgba(2, 132, 199, 0.06)"
      className="p-6 rounded-2xl flex flex-col justify-between h-full"
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-medium text-base text-slate-900 dark:text-zinc-100 tracking-tight">
            Leaderboard Top 5
          </h2>
          <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-500 uppercase tracking-wider font-semibold">
            Rankings
          </span>
        </div>

        {topUsers.length === 0 ? (
          <div className="py-8 text-center text-xs font-mono text-slate-500 dark:text-zinc-400">
            Leaderboard is currently updating.
          </div>
        ) : (
          <div className="space-y-1.5">
            {topUsers.slice(0, 5).map((user) => {
              const isCurrentUser = user.github === currentUserGithub;
              return (
                <div
                  key={user.github}
                  className={`flex items-center justify-between p-2.5 rounded-xl font-mono text-xs transition-colors
                    ${isCurrentUser
                      ? 'bg-sky-50 dark:bg-cyan-500/10 border border-sky-200 dark:border-cyan-500/25 text-sky-950 dark:text-zinc-100 font-medium'
                      : 'bg-slate-50 dark:bg-zinc-950/30 border border-slate-200/80 dark:border-white/[0.04] hover:border-slate-300 dark:hover:border-white/[0.1] text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 text-center font-medium text-xs shrink-0 text-slate-700 dark:text-zinc-300">
                      {rankBadges[user.rank] || `#${user.rank}`}
                    </span>
                    <img
                      src={`https://github.com/${user.github}.png?size=32`}
                      alt={user.name}
                      className="w-5 h-5 rounded-full object-cover ring-1 ring-slate-300 dark:ring-white/10 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <span className="truncate text-xs font-medium text-slate-800 dark:text-zinc-200">
                      {user.name}
                    </span>
                    {isCurrentUser && (
                      <span className="text-[9px] font-medium text-sky-700 dark:text-cyan-400 bg-sky-100 dark:bg-cyan-500/15 px-1.5 py-0.5 rounded-full border border-sky-200 dark:border-cyan-500/20">
                        You
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 text-right">
                    <span className="text-xs font-medium text-sky-600 dark:text-cyan-400 tabular-nums">
                      {user.points.toLocaleString()} pts
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-4 mt-4 border-t border-slate-200 dark:border-white/[0.04] flex items-center justify-between">
        {currentUserRank && currentUserRank > 5 ? (
          <span className="text-xs font-mono text-slate-500 dark:text-zinc-400">
            Your Rank: <strong className="text-sky-600 dark:text-cyan-400 font-medium">#{currentUserRank}</strong>
          </span>
        ) : (
          <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">
            Updated in real-time
          </span>
        )}
        <button
          onClick={onViewFullLeaderboard}
          className="text-xs font-mono text-sky-600 dark:text-cyan-400 hover:text-sky-700 dark:hover:text-cyan-300 font-medium transition-colors"
        >
          View all →
        </button>
      </div>
    </SpotlightCard>
  );
}
