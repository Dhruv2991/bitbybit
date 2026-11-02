'use client';
// ════════════════════════════════════════════════════════════
// src/components/pages/ProfilePage.tsx
// Clean, high-density developer profile & telemetry dashboard
// ════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { User, Certificate, Subscriber } from '@/types/database';
import { effectiveStreak } from '@/lib/streak';
import { BADGES, computeUnlockedBadges, type Badge } from '@/lib/badges';
import { isActiveSubscription } from '@/lib/subscription';
import { PRICING_CONFIG, formatPriceWithPeriod } from '@/lib/pricing';
import ContributionHeatmap from '@/components/profile/ContributionHeatmap';
import SkillRadar from '@/components/profile/SkillRadar';
import CertificatePreview from '@/components/certificates/CertificatePreview';
import SpotlightCard from '@/components/ui/SpotlightCard';
import DeveloperCardModal from '@/components/profile/DeveloperCardModal';
import {
  Award,
  Download,
  Eye,
  ExternalLink,
  ShieldCheck,
  X,
  Flame,
  Zap,
  Terminal,
  Trophy,
  CheckCircle2,
  Sparkles,
  ChevronRight,
  GitCommit,
  Cpu,
  ArrowUpRight,
  Calendar,
} from 'lucide-react';

interface ProfilePageProps {
  user: User | null;
  onNavigate: (page: any) => void;
}

interface SolvedRow {
  problem_id: string;
  problem_title: string;
  points: number;
  passed: number;
  total: number;
  when: string;
  source: 'problems' | 'weekly' | 'arena';
  isBloodFirst?: boolean;
}

interface Stats {
  totalPoints: number;
  problemsSolved: number;
  streak: number;
  lastSolvedAt: string | null;
  rank: number | null;
  recent: SolvedRow[];
  allDates: string[];
  skillTags: { tag: string; count: number }[];
  aiAssists: number;
  bloodFirstCount: number;
  badges: Badge[];
  certificates: Certificate[];
  subscriber: Subscriber | null;
  isPro: boolean;
}

export default function ProfilePage({ user, onNavigate }: ProfilePageProps) {
  const db = getSupabaseClient();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingCertificate, setViewingCertificate] = useState<Certificate | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [downloadingCertId, setDownloadingCertId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'certificates' | 'badges'>('certificates');

  const handleDownload = async (certificateId: string) => {
    setDownloadingCertId(certificateId);
    try {
      const {
        data: { session },
      } = await db.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        alert('Session expired. Please sign in again.');
        return;
      }
      const res = await fetch('/api/certificates/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ certificateId }),
      });
      const data = await res.json();
      if (!res.ok || !data.downloadUrl) {
        alert(data.error || 'Failed to download certificate');
      } else {
        window.open(data.downloadUrl, '_blank');
      }
    } catch {
      alert('Network error during download');
    } finally {
      setDownloadingCertId(null);
    }
  };

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const [
      { data: normalSubs },
      { data: arenaSubs },
      { data: weeklySubs },
      { data: memberRow },
      { data: allProblems },
      { data: aiRows },
      { data: certRows },
      { data: subscriberRow },
    ] = await Promise.all([
      db
        .from('submissions')
        .select('problem_id, problem_title, points_awarded, tests_passed, tests_total, created_at')
        .eq('github', user.github)
        .eq('status', 'approved'),
      (db.from('arena_submissions') as any)
        .select('problem_id, problem_title, points_awarded, tests_passed, tests_total, created_at')
        .eq('github', user.github)
        .eq('status', 'reviewed'),
      (db.from('weekly_submissions') as any)
        .select('problem_id, problem_title, points_awarded, tests_passed, tests_total, submitted_at')
        .eq('github', user.github)
        .eq('status', 'approved'),
      (db.from('members') as any)
        .select('streak, last_solved_at')
        .eq('github', user.github)
        .maybeSingle(),
      (db.from('problems') as any).select('id, tags'),
      (db.from('ai_usage') as any).select('used').eq('github', user.github),
      (db.from('certificates') as any)
        .select('*')
        .eq('github', user.github)
        .order('created_at', { ascending: false }),
      (db.from('subscribers') as any)
        .select('*')
        .eq('github', user.github)
        .maybeSingle(),
    ]);

    const rows: SolvedRow[] = [
      ...(normalSubs || []).map((s: any) => ({
        problem_id: s.problem_id,
        problem_title: s.problem_title,
        points: s.points_awarded || 0,
        passed: s.tests_passed || 0,
        total: s.tests_total || 0,
        when: s.created_at,
        source: 'problems' as const,
      })),
      ...(arenaSubs || []).map((s: any) => ({
        problem_id: s.problem_id,
        problem_title: s.problem_title || 'Arena problem',
        points: s.points_awarded || 0,
        passed: s.tests_passed || 0,
        total: s.tests_total || 0,
        when: s.created_at,
        source: 'arena' as const,
      })),
      ...(weeklySubs || []).map((s: any) => ({
        problem_id: s.problem_id,
        problem_title: s.problem_title || 'Weekly challenge',
        points: s.points_awarded || 0,
        passed: s.tests_passed || 0,
        total: s.tests_total || 0,
        when: s.submitted_at,
        source: 'weekly' as const,
      })),
    ];

    const bestPerProblem = new Map<string, SolvedRow>();
    for (const r of rows) {
      if ((r.points || 0) <= 0) continue;
      const existing = bestPerProblem.get(r.problem_id);
      if (!existing || r.points > existing.points) bestPerProblem.set(r.problem_id, r);
    }
    const deduped = [...bestPerProblem.values()];
    const totalPoints = deduped.reduce((sum, r) => sum + r.points, 0);

    const tagMap = new Map<string, string[]>((allProblems || []).map((p: any) => [p.id, p.tags || []]));
    const tagCounts = new Map<string, number>();
    for (const r of deduped) {
      const tags = tagMap.get(r.problem_id) || [];
      for (const t of tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
    const skillTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag, count]) => ({ tag, count }));
    const recent = [...rows]
      .filter((r) => (r.points || 0) > 0)
      .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
      .slice(0, 10);
    const allDates = rows.map((r) => r.when);

    const solvedIds = [...new Set(deduped.map((r) => r.problem_id))];
    let bloodFirstCount = 0;
    if (solvedIds.length > 0) {
      const [{ data: gSubs }, { data: gArena }, { data: gWeekly }] = await Promise.all([
        db
          .from('submissions')
          .select('github, problem_id, created_at')
          .eq('status', 'approved')
          .in('problem_id', solvedIds),
        (db.from('arena_submissions') as any)
          .select('github, problem_id, created_at')
          .eq('status', 'reviewed')
          .in('problem_id', solvedIds),
        (db.from('weekly_submissions') as any)
          .select('github, problem_id, submitted_at')
          .eq('status', 'approved')
          .in('problem_id', solvedIds),
      ]);
      const globalRows = [
        ...(gSubs || []).map((r: any) => ({
          github: r.github,
          problem_id: r.problem_id,
          when: r.created_at,
        })),
        ...(gArena || []).map((r: any) => ({
          github: r.github,
          problem_id: r.problem_id,
          when: r.created_at,
        })),
        ...(gWeekly || []).map((r: any) => ({
          github: r.github,
          problem_id: r.problem_id,
          when: r.submitted_at,
        })),
      ];
      const earliestPerProblem = new Map<string, { github: string; when: string }>();
      for (const r of globalRows) {
        if (!r.github || !r.when) continue;
        const existing = earliestPerProblem.get(r.problem_id);
        if (!existing || new Date(r.when).getTime() < new Date(existing.when).getTime()) {
          earliestPerProblem.set(r.problem_id, { github: r.github, when: r.when });
        }
      }
      for (const r of deduped) {
        if (earliestPerProblem.get(r.problem_id)?.github === user.github) {
          r.isBloodFirst = true;
          bloodFirstCount++;
        }
      }
      for (const r of recent) {
        if (earliestPerProblem.get(r.problem_id)?.github === user.github) r.isBloodFirst = true;
      }
    }

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 1);
    const [{ data: monthSubs }, { data: monthArena }, { data: monthWeekly }] = await Promise.all([
      db
        .from('submissions')
        .select('github, points_awarded')
        .eq('status', 'approved')
        .gte('created_at', cutoff.toISOString()),
      (db.from('arena_submissions') as any)
        .select('github, points_awarded')
        .eq('status', 'reviewed')
        .gte('created_at', cutoff.toISOString()),
      (db.from('weekly_submissions') as any)
        .select('github, points_awarded')
        .eq('status', 'approved')
        .gte('submitted_at', cutoff.toISOString()),
    ]);
    const monthTotals: Record<string, number> = {};
    for (const s of [...(monthSubs || []), ...(monthArena || []), ...(monthWeekly || [])] as any[]) {
      monthTotals[s.github] = (monthTotals[s.github] || 0) + (s.points_awarded || 0);
    }
    const monthRanked = Object.entries(monthTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100);
    const monthIdx = monthRanked.findIndex(([github]) => github === user.github);
    const rank = monthIdx === -1 ? null : monthIdx + 1;

    const currentStreak = effectiveStreak(memberRow?.streak, memberRow?.last_solved_at);
    const badges = computeUnlockedBadges({
      problemsSolved: deduped.length,
      totalPoints,
      everSolvedArena: (arenaSubs || []).length > 0,
      everSolvedWeekly: (weeklySubs || []).length > 0,
      currentStreak,
      monthlyRank: rank,
    });

    const isPro =
      user.is_admin ||
      user.is_subscriber ||
      isActiveSubscription(subscriberRow?.status, subscriberRow?.current_period_end);

    setStats({
      totalPoints,
      problemsSolved: deduped.length,
      streak: currentStreak,
      lastSolvedAt: memberRow?.last_solved_at || null,
      rank,
      recent,
      allDates,
      skillTags,
      aiAssists: (aiRows || []).reduce((sum: number, r: any) => sum + (r.used || 0), 0),
      bloodFirstCount,
      badges,
      certificates: (certRows as Certificate[]) || [],
      subscriber: (subscriberRow as Subscriber) || null,
      isPro,
    });
    setLoading(false);
  }, [db, user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = db
      .channel(`profile-realtime-${user.github}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'submissions', filter: `github=eq.${user.github}` },
        load
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'weekly_submissions', filter: `github=eq.${user.github}` },
        load
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'arena_submissions', filter: `github=eq.${user.github}` },
        load
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members', filter: `github=eq.${user.github}` },
        load
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'certificates', filter: `github=eq.${user.github}` },
        load
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscribers', filter: `github=eq.${user.github}` },
        load
      )
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, [db, user, load]);

  if (!user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <div className="w-14 h-14 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-slate-500 dark:text-zinc-500 mb-4 shadow-sm">
          <Terminal className="w-7 h-7 text-cyan-600 dark:text-cyan-400" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-100 tracking-tight mb-2">
          Sign In Required
        </h2>
        <p className="text-sm font-mono text-slate-600 dark:text-zinc-400 mb-5 max-w-sm">
          Please sign in with GitHub to view your profile dashboard and stats.
        </p>
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <button
            onClick={async () => {
              await db.auth.signInWithOAuth({
                provider: 'github',
                options: { redirectTo: window.location.origin + '/profile', queryParams: { prompt: 'select_account' } },
              });
            }}
            className="btn-primary px-5 py-2.5 font-mono text-xs shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <span>Sign In with GitHub</span>
            <span>→</span>
          </button>
          <button
            onClick={() => onNavigate('home')}
            className="btn-secondary px-4 py-2.5 font-mono text-xs shadow-xs cursor-pointer"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (loading || !stats) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 dark:border-t-cyan-400 animate-spin" />
        <p className="text-xs font-mono text-slate-500 dark:text-zinc-400 animate-pulse">
          Loading profile...
        </p>
      </div>
    );
  }

  const isActiveToday = stats.lastSolvedAt
    ? Math.floor((Date.now() - new Date(stats.lastSolvedAt).getTime()) / 86_400_000) <= 1
    : false;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-4 animate-fade-up">
      {/* ── 1. USER PROFILE & SUBSCRIPTION CARD ── */}
      <SpotlightCard
        spotlightColor="rgba(6, 182, 212, 0.08)"
        className="p-5 sm:p-6 bg-white dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800/80 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          {/* Avatar & User Details */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <img
                src={`https://github.com/${user.github}.png?size=160`}
                alt={user.name}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover ring-1 ring-slate-200 dark:ring-white/10 border border-slate-200 dark:border-zinc-800 shadow-sm"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-bold text-lg sm:text-xl text-slate-900 dark:text-zinc-100 tracking-tight truncate">
                  {user.name}
                </h1>
                <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400/90">
                  @{user.github}
                </span>
              </div>

              {/* Roles & Insignias */}
              <div className="flex items-center gap-2 flex-wrap mt-2">
                {user.is_admin && (
                  <span className="text-[10px] font-mono font-medium text-rose-600 dark:text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-md px-2 py-0.5">
                    Admin
                  </span>
                )}
                {stats.isPro ? (
                  <span className="text-[10px] font-mono font-medium text-cyan-600 dark:text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 rounded-md px-2 py-0.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-cyan-600 dark:text-cyan-400" /> Pro Member
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-medium text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700/60 rounded-md px-2 py-0.5">
                    Free Tier
                  </span>
                )}
                {stats.bloodFirstCount > 0 && (
                  <span className="text-[10px] font-mono font-medium text-amber-600 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-md px-2 py-0.5">
                    🩸 {stats.bloodFirstCount} First Blood{stats.bloodFirstCount === 1 ? '' : 's'}
                  </span>
                )}
                <button
                  onClick={() => setShowCardModal(true)}
                  className="text-[10px] font-mono font-bold text-sky-600 dark:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-md px-2.5 py-0.5 flex items-center gap-1 transition cursor-pointer"
                >
                  🪪 Share Dev Card
                </button>
              </div>
            </div>
          </div>

          {/* Pro Subscription Telemetry Box */}
          <div className="w-full sm:w-auto shrink-0">
            {stats.isPro ? (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950/70 border border-cyan-500/25 flex flex-col sm:items-end gap-1 shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-300">
                    Pro Subscription Active
                  </span>
                  <span className="text-[10px] font-mono text-slate-600 dark:text-zinc-400 bg-slate-200/80 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 px-1.5 py-0.5 rounded">
                    {formatPriceWithPeriod(PRICING_CONFIG.defaultMonthlyFee)}
                  </span>
                </div>
                {stats.subscriber?.current_period_end && (
                  <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                    Valid until{' '}
                    <span className="text-slate-800 dark:text-zinc-200">
                      {new Date(stats.subscriber.current_period_end).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </p>
                )}
                <button
                  onClick={() => onNavigate('subscribe')}
                  className="text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 mt-1 cursor-pointer"
                >
                  Manage / Extend Pass <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-950/70 border border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center gap-3 shadow-xs">
                <div className="text-left">
                  <p className="text-xs font-semibold text-slate-900 dark:text-zinc-200">Upgrade to Pro Pass</p>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                    Unlock full Arena access, AI hints & certificates ({formatPriceWithPeriod(PRICING_CONFIG.defaultMonthlyFee)})
                  </p>
                </div>
                <button
                  onClick={() => onNavigate('subscribe')}
                  className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white font-mono text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Upgrade
                </button>
              </div>
            )}
          </div>
        </div>
      </SpotlightCard>

      {/* ── 2. HIGH-DENSITY METRIC CARDS ROW ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* TOTAL POINTS */}
        <SpotlightCard
          spotlightColor="rgba(6, 182, 212, 0.12)"
          className="p-4 bg-white dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800/80 shadow-xs"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider">Total Points</span>
            <Zap className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <p className="text-2xl font-bold font-display text-cyan-600 dark:text-cyan-400">
            {stats.totalPoints.toLocaleString()}
          </p>
          <p className="text-[10px] font-mono text-slate-500 dark:text-zinc-500 mt-1">Platform score</p>
        </SpotlightCard>

        {/* PROBLEMS SOLVED */}
        <SpotlightCard
          spotlightColor="rgba(16, 185, 129, 0.12)"
          className="p-4 bg-white dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800/80 shadow-xs"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider">Solved</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-2xl font-bold font-display text-slate-900 dark:text-zinc-100">
            {stats.problemsSolved}
          </p>
          <p className="text-[10px] font-mono text-slate-500 dark:text-zinc-500 mt-1">Problems solved</p>
        </SpotlightCard>

        {/* DAY STREAK */}
        <SpotlightCard
          spotlightColor="rgba(251, 191, 36, 0.12)"
          className="p-4 bg-white dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800/80 shadow-xs"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider">Streak</span>
            <Flame className={`w-3.5 h-3.5 ${isActiveToday ? 'text-amber-500 dark:text-amber-400' : 'text-slate-400 dark:text-zinc-500'}`} />
          </div>
          <p className={`text-2xl font-bold font-display ${isActiveToday ? 'text-amber-500 dark:text-amber-400' : 'text-slate-600 dark:text-zinc-400'}`}>
            {stats.streak} <span className="text-xs font-normal text-slate-500 dark:text-zinc-500">days</span>
          </p>
          <p className="text-[10px] font-mono text-slate-500 dark:text-zinc-500 mt-1">
            {isActiveToday ? 'Active today' : 'Solve today!'}
          </p>
        </SpotlightCard>

        {/* MONTHLY RANK */}
        <SpotlightCard
          spotlightColor="rgba(168, 85, 247, 0.12)"
          className="p-4 bg-white dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800/80 shadow-xs"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider">Monthly Rank</span>
            <Trophy className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
          </div>
          <p className="text-2xl font-bold font-display text-purple-600 dark:text-purple-400">
            {stats.rank ? `#${stats.rank}` : '—'}
          </p>
          <p className="text-[10px] font-mono text-slate-500 dark:text-zinc-500 mt-1">Leaderboard (30d)</p>
        </SpotlightCard>

        {/* AI ASSISTS */}
        <SpotlightCard
          spotlightColor="rgba(56, 189, 248, 0.12)"
          className="p-4 bg-white dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800/80 shadow-xs"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider">AI Assists</span>
            <Cpu className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          </div>
          <p className="text-2xl font-bold font-display text-sky-600 dark:text-sky-400">
            {stats.aiAssists}
          </p>
          <p className="text-[10px] font-mono text-slate-500 dark:text-zinc-500 mt-1">Queries used</p>
        </SpotlightCard>

        {/* BLOOD FIRSTS */}
        <SpotlightCard
          spotlightColor="rgba(244, 63, 94, 0.12)"
          className="p-4 bg-white dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800/80 shadow-xs"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider">First Blood</span>
            <Flame className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="text-2xl font-bold font-display text-rose-600 dark:text-rose-400">
            {stats.bloodFirstCount}
          </p>
          <p className="text-[10px] font-mono text-slate-500 dark:text-zinc-500 mt-1">First solver platform-wide</p>
        </SpotlightCard>
      </div>

      {/* ── 3. MIDDLE ROW: ACTIVITY HEATMAP (7 COLS) + SKILL RADAR (5 COLS) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <ContributionHeatmap dates={stats.allDates} />
        </div>
        <div className="lg:col-span-5">
          <SkillRadar skills={stats.skillTags} />
        </div>
      </div>

      {/* ── 4. BOTTOM ROW: RECENT ACTIVITY (7 COLS) + CERTIFICATES & BADGES (5 COLS) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* RECENT ACTIVITY */}
        <SpotlightCard
          spotlightColor="rgba(6, 182, 212, 0.06)"
          className="lg:col-span-7 p-5 bg-white dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800/80 flex flex-col justify-between shadow-xs"
        >
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-zinc-800/70">
              <div className="flex items-center gap-2">
                <GitCommit className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Recent Submissions</h2>
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-zinc-500">
                {stats.recent.length} record{stats.recent.length === 1 ? '' : 's'}
              </span>
            </div>

            {stats.recent.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-xs font-mono text-slate-500 dark:text-zinc-400 mb-2">No submissions recorded yet.</p>
                <button
                  onClick={() => onNavigate('problems')}
                  className="text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:underline inline-flex items-center gap-1"
                >
                  Solve your first problem <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 font-mono text-xs max-h-[340px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-zinc-800">
                {stats.recent.map((r, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800/70 hover:border-slate-300 dark:hover:border-zinc-700/80 transition-colors flex items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[10px] text-slate-400 dark:text-zinc-600 select-none">•</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded border ${
                          r.source === 'arena'
                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                            : r.source === 'weekly'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                            : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20'
                        }`}
                      >
                        {r.source.toUpperCase()}
                      </span>
                      <span className="text-slate-900 dark:text-zinc-200 truncate font-medium">
                        {r.problem_title}
                      </span>
                      {r.isBloodFirst && (
                        <span
                          title="First person platform-wide to solve this"
                          className="shrink-0 text-[10px] text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.2 rounded font-semibold"
                        >
                          🩸 Blood First
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-[10px]">
                      <span className="text-slate-500 dark:text-zinc-500">
                        {r.total > 0 && `${r.passed}/${r.total} tests`}
                      </span>
                      <span className="text-slate-500 dark:text-zinc-500">
                        {new Date(r.when).toLocaleDateString()}
                      </span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        +{r.points}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SpotlightCard>

        {/* CERTIFICATES & BADGES VAULT */}
        <SpotlightCard
          spotlightColor="rgba(168, 85, 247, 0.06)"
          className="lg:col-span-5 p-5 bg-white dark:bg-zinc-900/50 border-slate-200 dark:border-zinc-800/80 flex flex-col justify-between shadow-xs"
        >
          <div>
            {/* Header Tabs */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-zinc-800/70">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('certificates')}
                  className={`text-xs font-mono font-medium px-2.5 py-1 rounded-lg transition-all ${
                    activeTab === 'certificates'
                      ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border border-slate-300 dark:border-zinc-700 shadow-xs'
                      : 'text-slate-500 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-300'
                  }`}
                >
                  Certificates ({stats.certificates.length})
                </button>
                <button
                  onClick={() => setActiveTab('badges')}
                  className={`text-xs font-mono font-medium px-2.5 py-1 rounded-lg transition-all ${
                    activeTab === 'badges'
                      ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border border-slate-300 dark:border-zinc-700 shadow-xs'
                      : 'text-slate-500 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-300'
                  }`}
                >
                  Badges ({stats.badges.length}/{BADGES.length})
                </button>
              </div>
            </div>

            {/* TAB 1: CERTIFICATES */}
            {activeTab === 'certificates' && (
              <div>
                {stats.certificates.length === 0 ? (
                  <div className="py-10 text-center">
                    <Award className="w-8 h-8 text-slate-400 dark:text-zinc-600 mx-auto mb-2" />
                    <p className="text-xs font-mono text-slate-600 dark:text-zinc-400 mb-1">No certificates issued yet.</p>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-500 max-w-xs mx-auto">
                      Participate in Arena tournaments and Weekly challenges to earn certificates.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-zinc-800">
                    {stats.certificates.map((cert) => {
                      const isRevoked = cert.status === 'revoked';
                      return (
                        <div
                          key={cert.id}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800/80 hover:border-slate-300 dark:hover:border-zinc-700/80 transition-colors flex flex-col gap-2 shadow-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-xs text-slate-900 dark:text-zinc-100 truncate">
                                  {cert.title || 'Certificate of Achievement'}
                                </span>
                                {isRevoked ? (
                                  <span className="text-[8.5px] font-mono text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-1.5 py-0.2">
                                    Revoked
                                  </span>
                                ) : (
                                  <span className="text-[8.5px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.2">
                                    Verified
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] font-mono text-slate-600 dark:text-zinc-400 mt-0.5 truncate">
                                {cert.event_name}
                              </p>
                              <p className="text-[9.5px] font-mono text-slate-500 dark:text-zinc-500 mt-0.5">
                                {cert.certificate_id}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-zinc-800/60 text-xs font-mono">
                            <button
                              onClick={() => setViewingCertificate(cert)}
                              className="text-cyan-600 dark:text-cyan-400 hover:opacity-80 flex items-center gap-1 text-[11px]"
                            >
                              <Eye className="w-3 h-3" /> View
                            </button>
                            {!isRevoked && (
                              <button
                                onClick={() => handleDownload(cert.certificate_id)}
                                disabled={downloadingCertId === cert.certificate_id}
                                className="px-2.5 py-1 rounded bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-[10px] flex items-center gap-1 transition-colors border border-slate-200 dark:border-transparent"
                              >
                                <Download className="w-3 h-3" />
                                {downloadingCertId === cert.certificate_id ? 'Downloading...' : 'PDF'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: BADGES */}
            {activeTab === 'badges' && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[340px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-zinc-800">
                {BADGES.map((b) => {
                  const unlocked = stats.badges.some((ub) => ub.id === b.id);
                  return (
                    <div
                      key={b.id}
                      title={`${b.label} — ${b.description}${!b.permanent ? ' (current state)' : ''}`}
                      className={`flex flex-col items-center text-center gap-1 p-2.5 rounded-xl border transition-all ${
                        unlocked
                          ? 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 shadow-xs'
                          : 'bg-slate-100/60 dark:bg-zinc-950/40 border-slate-200/60 dark:border-zinc-900 opacity-40 grayscale'
                      }`}
                    >
                      <span className="text-xl">{b.icon}</span>
                      <span
                        className={`text-[9.5px] font-mono font-medium leading-tight line-clamp-1 ${
                          unlocked ? 'text-slate-800 dark:text-zinc-200' : 'text-slate-400 dark:text-zinc-600'
                        }`}
                      >
                        {b.label}
                      </span>
                      {!b.permanent && unlocked && (
                        <span className="text-[7.5px] font-mono text-amber-600 dark:text-amber-400 uppercase tracking-wider bg-amber-500/10 px-1 rounded">
                          Current
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SpotlightCard>
      </div>

      {/* ── 5. CERTIFICATE VIEWER MODAL ── */}
      {showCardModal && stats && (
        <DeveloperCardModal
          user={user}
          stats={stats}
          onClose={() => setShowCardModal(false)}
        />
      )}
      {viewingCertificate && (
        <div className="fixed inset-0 z-[200] bg-slate-950/70 dark:bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-zinc-900/95 backdrop-blur-2xl border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                <div>
                  <h3 className="font-mono font-bold text-sm text-slate-900 dark:text-zinc-100">
                    {viewingCertificate.certificate_id}
                  </h3>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-500">
                    Verified Digital Certificate
                  </span>
                </div>
              </div>
              <button
                onClick={() => setViewingCertificate(null)}
                className="p-1.5 rounded-lg text-slate-400 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-zinc-950/80 rounded-xl border border-slate-200 dark:border-zinc-800">
                <CertificatePreview
                  recipientName={viewingCertificate.recipient_name}
                  title={viewingCertificate.title}
                  achievementText={viewingCertificate.achievement_text}
                  eventName={viewingCertificate.event_name}
                  organizationText={viewingCertificate.organization_text}
                  activityPointsText={viewingCertificate.activity_points_text}
                  coordinators={viewingCertificate.coordinator_names || []}
                  dateStr={new Date(viewingCertificate.issued_at).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                  certificateId={viewingCertificate.certificate_id}
                  status={viewingCertificate.status}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-zinc-800">
                <a
                  href={`/certificate/${viewingCertificate.certificate_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Public Verification Link
                </a>
                {viewingCertificate.status !== 'revoked' && (
                  <button
                    onClick={() => handleDownload(viewingCertificate.certificate_id)}
                    disabled={downloadingCertId === viewingCertificate.certificate_id}
                    className="btn-primary py-2 px-4 text-xs font-mono flex items-center gap-2 shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    {downloadingCertId === viewingCertificate.certificate_id
                      ? 'Downloading...'
                      : 'Download PDF'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
