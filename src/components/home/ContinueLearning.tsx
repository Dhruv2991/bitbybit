'use client';

import SpotlightCard from '@/components/ui/SpotlightCard';

interface TopicItem {
  id: string;
  name: string;
  solved: number;
  total: number;
  icon: string;
}

interface ContinueLearningProps {
  topics: TopicItem[];
  loading?: boolean;
  onSelectTopic: (topicId: string) => void;
  onViewAllTopics: () => void;
}

export default function ContinueLearning({
  topics,
  loading = false,
  onSelectTopic,
  onViewAllTopics,
}: ContinueLearningProps) {
  if (loading) {
    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3.5">
          <div className="h-5 w-40 bg-zinc-800/60 rounded-lg animate-pulse" />
          <div className="h-4 w-20 bg-zinc-800/60 rounded-md animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-zinc-900/30 border border-white/[0.04] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (topics.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <h2 className="font-display font-medium text-base sm:text-lg text-slate-900 dark:text-zinc-100 tracking-tight">
            Continue Learning
          </h2>
          <p className="font-sans text-xs text-slate-600 dark:text-zinc-400">
            Master essential data structures and algorithms by topic
          </p>
        </div>
        <button
          onClick={onViewAllTopics}
          className="text-xs font-mono text-sky-600 dark:text-cyan-400 hover:text-sky-700 dark:hover:text-cyan-300 font-medium transition-colors"
        >
          Explore all topics →
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {topics.map((topic) => {
          const percent = topic.total > 0 ? Math.round((topic.solved / topic.total) * 100) : 0;
          return (
            <button
              key={topic.id}
              onClick={() => onSelectTopic(topic.name)}
              className="text-left w-full group"
            >
              <SpotlightCard
                spotlightColor="rgba(2, 132, 199, 0.08)"
                className="p-6 rounded-2xl transition-all duration-200 flex flex-col justify-between h-full"
              >
                <div>
                  <div className="flex items-center justify-between mb-3.5">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] flex items-center justify-center text-base group-hover:scale-105 transition-transform">
                      {topic.icon}
                    </div>
                    <span className="text-xs font-mono font-semibold text-slate-700 dark:text-zinc-300 group-hover:text-slate-900 dark:group-hover:text-zinc-100 transition-colors">
                      {topic.solved}/{topic.total}
                    </span>
                  </div>

                  <h3 className="font-sans font-semibold text-[15px] text-slate-900 dark:text-zinc-100 mb-1 group-hover:text-sky-600 dark:group-hover:text-cyan-300 transition-colors truncate">
                    {topic.name}
                  </h3>
                </div>

                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-zinc-400">
                    <span>Mastery</span>
                    <span className="text-slate-700 dark:text-zinc-300 font-medium">{percent}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-zinc-950/60 h-2 rounded-full overflow-hidden border border-slate-200/80 dark:border-white/[0.04]">
                    <div
                      className="h-full bg-sky-600 dark:bg-cyan-500 rounded-full transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              </SpotlightCard>
            </button>
          );
        })}
      </div>
    </div>
  );
}
