'use client';

import SpotlightCard from '@/components/ui/SpotlightCard';

interface ActivityItem {
  id: string;
  type: 'solve' | 'weekly' | 'arena' | 'certificate';
  title: string;
  points?: number;
  date: string;
}

interface RecentActivityProps {
  activities: ActivityItem[];
  loading?: boolean;
  onExploreProblems: () => void;
}

function formatRelativeTime(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const now = Date.now();
    const diff = Math.max(0, Math.floor((now - d.getTime()) / 1000));

    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'recently';
  }
}

export default function RecentActivity({
  activities,
  loading = false,
  onExploreProblems,
}: RecentActivityProps) {
  if (loading) {
    return (
      <div className="p-6 rounded-2xl bg-zinc-900/40 backdrop-blur-xl border border-white/[0.06] shadow-sm h-full">
        <div className="h-4 w-32 bg-zinc-800/60 rounded-lg animate-pulse mb-4" />
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-11 bg-zinc-800/40 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <SpotlightCard
      spotlightColor="rgba(255, 255, 255, 0.04)"
      className="p-6 rounded-2xl bg-zinc-900/40 backdrop-blur-xl border border-white/[0.06] flex flex-col justify-between h-full"
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-medium text-base text-zinc-100 tracking-tight">
            Recent Activity
          </h2>
          <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">
            Timeline
          </span>
        </div>

        {activities.length === 0 ? (
          <div className="py-8 px-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-lg mx-auto mb-3">
              🌱
            </div>
            <p className="text-xs font-sans font-medium text-zinc-200 mb-1">
              Your first solve is waiting
            </p>
            <p className="text-xs text-zinc-400 mb-4 max-w-xs mx-auto">
              Start coding on the platform to build your activity timeline and earn points.
            </p>
            <button
              onClick={onExploreProblems}
              className="btn-primary text-xs py-1.5 px-3.5"
            >
              Explore Problems →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {activities.slice(0, 5).map((act) => (
              <div key={act.id + act.date} className="py-2.5 flex items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 text-xs">
                    {act.type === 'certificate' ? '📜' : act.type === 'arena' ? '🏆' : act.type === 'weekly' ? '🏅' : '✓'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-zinc-200 font-sans font-medium truncate">
                      {act.title}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {act.type === 'certificate'
                        ? 'Certificate Earned'
                        : act.type === 'arena'
                        ? 'Arena Submission'
                        : act.type === 'weekly'
                        ? 'Weekly Challenge'
                        : 'Problem Solved'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 text-right">
                  {act.points ? (
                    <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      +{act.points} pts
                    </span>
                  ) : null}
                  <span className="text-[10px] text-zinc-500">
                    {formatRelativeTime(act.date)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activities.length > 0 && (
        <div className="pt-4 mt-4 border-t border-white/[0.04] text-right">
          <button
            onClick={onExploreProblems}
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
          >
            Practice more →
          </button>
        </div>
      )}
    </SpotlightCard>
  );
}
