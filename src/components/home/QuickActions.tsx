'use client';

import SpotlightCard from '@/components/ui/SpotlightCard';

interface QuickActionsProps {
  onNavigate: (page: string) => void;
}

export default function QuickActions({ onNavigate }: QuickActionsProps) {
  const actions = [
    {
      id: 'problems',
      title: 'Problem Set',
      description: 'Filter by difficulty, tag, and solve algorithmic challenges',
      icon: (
        <svg className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      ),
      badge: 'Core',
      badgeColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
      spotlightColor: 'rgba(99, 102, 241, 0.08)',
      action: () => onNavigate('problems'),
    },
    {
      id: 'arena',
      title: 'Contest Arena',
      description: 'Join real-time proctored contests with live leaderboard scoring',
      icon: (
        <svg className="w-5 h-5 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.45 1-1 1H7" />
          <path d="M14 14.66V17c0 .55.45 1 1 1h2" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      ),
      badge: 'Live Contests',
      badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
      spotlightColor: 'rgba(244, 63, 94, 0.08)',
      action: () => onNavigate('arena'),
    },
    {
      id: 'ai',
      title: 'AI Code Coach',
      description: 'Get progressive hints, approach reviews, and test case breakdowns',
      icon: (
        <svg className="w-5 h-5 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
          <path d="m4.93 10.93 1.41 1.41" />
          <path d="M2 18h2" />
          <path d="M20 18h2" />
          <path d="m19.07 10.93-1.41 1.41" />
          <path d="M22 22H2" />
          <path d="m8 22 4-10 4 10" />
        </svg>
      ),
      badge: 'Gemini AI',
      badgeColor: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
      spotlightColor: 'rgba(56, 189, 248, 0.08)',
      action: () => onNavigate('problems'),
    },
    {
      id: 'certificates',
      title: 'Certificates',
      description: 'View and download digitally verified achievement certificates',
      icon: (
        <svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
      badge: 'Verified',
      badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      spotlightColor: 'rgba(251, 191, 36, 0.08)',
      action: () => onNavigate('profile'),
    },
  ];

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <h2 className="font-display font-medium text-base sm:text-lg text-zinc-100 tracking-tight">
            Quick Actions
          </h2>
          <p className="font-sans text-xs text-zinc-400">
            Fast shortcuts to platform tools and features
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {actions.map((act) => (
          <button
            key={act.id}
            onClick={act.action}
            className="text-left w-full group"
          >
            <SpotlightCard
              spotlightColor={act.spotlightColor}
              className="p-6 rounded-2xl bg-zinc-900/40 backdrop-blur-xl border border-white/[0.06] hover:border-white/[0.14] transition-all duration-200 flex flex-col justify-between h-full"
            >
              <div>
                <div className="flex items-center justify-between mb-3.5">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    {act.icon}
                  </div>
                  <span className={`text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full border ${act.badgeColor}`}>
                    {act.badge}
                  </span>
                </div>

                <h3 className="font-sans font-semibold text-[15px] text-zinc-100 mb-1.5 group-hover:text-indigo-300 transition-colors">
                  {act.title}
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {act.description}
                </p>
              </div>

              <div className="mt-5 pt-3.5 border-t border-white/[0.04] flex items-center justify-between text-xs font-mono text-zinc-400 group-hover:text-zinc-200 transition-colors font-medium">
                <span>Open</span>
                <span className="group-hover:translate-x-0.5 transition-transform">→</span>
              </div>
            </SpotlightCard>
          </button>
        ))}
      </div>
    </div>
  );
}
