'use client';

import { useState, useEffect } from 'react';
import type { User } from '@/types/database';
import { getSupabaseClient } from '@/lib/supabase';

interface WelcomeHeroProps {
  user: User | null;
  userStreak: number;
  onNavigate: (page: string) => void;
  announcement?: string;
  onDismissAnnouncement?: () => void;
  dismissedAnnouncement?: boolean;
}

export default function WelcomeHero({
  user,
  userStreak,
  onNavigate,
  announcement,
  onDismissAnnouncement,
  dismissedAnnouncement,
}: WelcomeHeroProps) {
  const [greeting, setGreeting] = useState('Welcome back');
  const [tickerItems, setTickerItems] = useState<string[]>([]);
  const [tickerIdx, setTickerIdx] = useState(0);
  const [tickerVisible, setTickerVisible] = useState(true);

  // Time-based personalized greeting
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 17) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  // Real-time activity ticker
  useEffect(() => {
    const db = getSupabaseClient();
    let isCancelled = false;

    async function loadRecentSolves() {
      try {
        const [{ data: subs }, { data: weekly }, { data: arena }] = await Promise.all([
          db.from('submissions').select('name, github, problem_id, problem_title, created_at')
            .eq('status', 'approved').order('created_at', { ascending: false }).limit(5),
          (db.from('weekly_submissions') as any).select('name, github, problem_id, problem_title, submitted_at')
            .eq('status', 'approved').order('submitted_at', { ascending: false }).limit(5),
          (db.from('arena_submissions') as any).select('name, github, problem_id, problem_title, created_at')
            .eq('status', 'reviewed').order('created_at', { ascending: false }).limit(5),
        ]);

        const combined = [
          ...(subs || []).map((s: any) => ({ who: s.name || s.github, title: s.problem_title, when: s.created_at })),
          ...(weekly || []).map((s: any) => ({ who: s.name || s.github, title: s.problem_title, when: s.submitted_at })),
          ...(arena || []).map((s: any) => ({ who: s.name || s.github, title: s.problem_title, when: s.created_at })),
        ]
          .filter(r => r.who && r.title)
          .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
          .slice(0, 6)
          .map(r => `🔥 ${r.who} solved ${r.title}`);

        if (!isCancelled) {
          setTickerItems(combined.length > 0 ? combined : ['⚡ Practice daily DSA and climb the ranks']);
        }
      } catch {}
    }

    loadRecentSolves();

    const channel = db
      .channel('welcome-hero-ticker')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, loadRecentSolves)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_submissions' }, loadRecentSolves)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'arena_submissions' }, loadRecentSolves)
      .subscribe();

    return () => {
      isCancelled = true;
      db.removeChannel(channel);
    };
  }, []);

  // Cycle ticker items smoothly
  useEffect(() => {
    if (tickerItems.length <= 1) return;
    const interval = setInterval(() => {
      setTickerVisible(false);
      setTimeout(() => {
        setTickerIdx(i => (i + 1) % tickerItems.length);
        setTickerVisible(true);
      }, 300);
    }, 4000);
    return () => clearInterval(interval);
  }, [tickerItems.length]);

  const displayName = user?.name ? user.name.split(' ')[0] : null;

  return (
    <div className="relative mb-8">
      {/* Announcement banner if active */}
      {announcement && !dismissedAnnouncement && (
        <div className="flex items-center gap-3 px-4 py-3 mb-6 bg-sky-50 dark:bg-cyan-500/10 border border-sky-200 dark:border-cyan-500/20 rounded-xl text-xs font-mono text-sky-800 dark:text-cyan-300 backdrop-blur-md animate-fade-up">
          <span className="shrink-0 text-base">📣</span>
          <span className="flex-1 leading-relaxed">{announcement}</span>
          {onDismissAnnouncement && (
            <button
              onClick={onDismissAnnouncement}
              aria-label="Dismiss announcement"
              className="shrink-0 text-sky-600 dark:text-cyan-400/60 hover:text-sky-900 dark:hover:text-cyan-300 transition-colors p-1"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Hero Card with refined elevation */}
      <div className="relative rounded-2xl p-6 sm:p-8 lg:p-10 overflow-hidden bg-white/90 dark:bg-zinc-900/60 border border-slate-200/90 dark:border-zinc-800/80 shadow-sm backdrop-blur-md">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            {/* Tagline / Sub-badge */}
            <div className="flex items-center gap-2.5 flex-wrap mb-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-medium bg-slate-100 dark:bg-zinc-800/80 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                TeamCodeLocked · BMSCE
              </span>
              {userStreak > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                  🔥 {userStreak} day streak
                </span>
              )}
            </div>

            {/* Personalized Heading */}
            <h1 className="font-display font-semibold text-2xl sm:text-3xl lg:text-4xl text-slate-900 dark:text-zinc-100 tracking-tight leading-tight mb-2">
              {displayName
                ? `${greeting}, ${displayName}.`
                : 'Master algorithmic\nproblem-solving.'}
            </h1>
            <p className="font-sans text-xs sm:text-sm text-slate-600 dark:text-zinc-400 leading-relaxed mb-6 max-w-xl">
              {displayName
                ? 'Solve curated problems, compete in real-time proctored arenas, and build consistent algorithmic mastery — bit by bit.'
                : 'Solve curated DSA problems, compete in real-time proctored arenas, and visualize your logic step-by-step with BitByBit Pro.'}
            </p>

            {/* Action buttons */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => onNavigate('problems')}
                className="btn-primary text-xs sm:text-sm px-4 py-2 flex items-center gap-2"
              >
                <span>{displayName ? 'Continue Practicing' : 'Start Practicing'}</span>
                <span className="text-base leading-none">→</span>
              </button>

              {/* Explore Pro button */}
              <button
                id="hero-explore-pro-btn"
                onClick={() => onNavigate('subscribe')}
                className="group relative inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-mono text-xs font-semibold overflow-hidden transition-all duration-200 bg-sky-50 dark:bg-cyan-950/40 border border-sky-200 dark:border-cyan-500/30 text-sky-700 dark:text-cyan-300 hover:bg-sky-100 dark:hover:bg-cyan-900/50 active:scale-[0.98]"
              >
                <svg className="w-3.5 h-3.5 shrink-0 text-sky-600 dark:text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                Explore Pro
              </button>

              <button
                onClick={() => onNavigate('arena')}
                className="px-3.5 py-2 rounded-xl font-mono text-xs text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/50 border border-slate-200/80 dark:border-zinc-800 transition-all"
              >
                Enter Arena
              </button>
            </div>
          </div>

          {/* Right column: Realtime solve ticker / Status badge */}
          <div className="lg:w-72 shrink-0 flex flex-col gap-3">
            <div className="p-4 rounded-xl bg-slate-50/90 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800/80 backdrop-blur-md shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-500 font-semibold">
                  Live Solves
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <div
                className="text-xs font-mono text-slate-700 dark:text-zinc-300 truncate transition-opacity duration-300 min-h-[1.25rem]"
                style={{ opacity: tickerVisible ? 1 : 0 }}
              >
                {tickerItems[tickerIdx] || 'Loading latest activity...'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-zinc-950/40 border border-slate-200 dark:border-zinc-800/70 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-base">⚡</span>
                <span className="text-slate-700 dark:text-zinc-300 font-medium text-[11px]">Daily Code Sprint</span>
              </div>
              <button
                onClick={() => onNavigate('problems')}
                className="text-[11px] text-sky-600 dark:text-cyan-400 hover:text-sky-700 dark:hover:text-cyan-300 font-medium transition-colors"
              >
                Solve today →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
