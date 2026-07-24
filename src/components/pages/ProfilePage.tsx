'use client';
import { useEffect, useState, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { User } from '@/types/database';
import { effectiveStreak } from '@/lib/streak';

interface ProfilePageProps {
  user:       User | null;
  onNavigate: (page: any) => void;
}

interface SolvedRow {
  problem_id:    string;
  problem_title: string;
  points:        number;
  passed:        number;
  total:         number;
  when:          string;
  source:        'problems' | 'weekly' | 'arena';
}

interface Stats {
  totalPoints:    number;
  problemsSolved: number;
  streak:         number;
  lastSolvedAt:   string | null;
  rank:           number | null;
  recent:         SolvedRow[];
}

export default function ProfilePage({ user, onNavigate }: ProfilePageProps) {
  const db = getSupabaseClient();
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);

    // Same "best score per problem, across all three submission tables"
    // aggregation the leaderboard uses, so the numbers here always match
    // what's shown there — no separate source of truth to drift out of sync.
    const [{ data: normalSubs }, { data: arenaSubs }, { data: weeklySubs }, { data: memberRow }] =
      await Promise.all([
        db.from('submissions').select('problem_id, problem_title, points_awarded, tests_passed, tests_total, created_at')
          .eq('github', user.github).eq('status', 'approved'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db.from('arena_submissions') as any).select('problem_id, problem_title, points_awarded, tests_passed, tests_total, created_at')
          .eq('github', user.github).eq('status', 'reviewed'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db.from('weekly_submissions') as any).select('problem_id, problem_title, points_awarded, tests_passed, tests_total, submitted_at')
          .eq('github', user.github).eq('status', 'approved'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (db.from('members') as any).select('streak, last_solved_at').eq('github', user.github).maybeSingle(),
      ]);

    const rows: SolvedRow[] = [
      ...(normalSubs || []).map((s: any) => ({
        problem_id: s.problem_id, problem_title: s.problem_title, points: s.points_awarded || 0,
        passed: s.tests_passed || 0, total: s.tests_total || 0, when: s.created_at, source: 'problems' as const,
      })),
      ...(arenaSubs || []).map((s: any) => ({
        problem_id: s.problem_id, problem_title: s.problem_title || 'Arena problem', points: s.points_awarded || 0,
        passed: s.tests_passed || 0, total: s.tests_total || 0, when: s.created_at, source: 'arena' as const,
      })),
      ...(weeklySubs || []).map((s: any) => ({
        problem_id: s.problem_id, problem_title: s.problem_title || 'Weekly challenge', points: s.points_awarded || 0,
        passed: s.tests_passed || 0, total: s.tests_total || 0, when: s.submitted_at, source: 'weekly' as const,
      })),
    ];

    // Best score per problem (same dedupe rule as the leaderboard) —
    // prevents a lower-scoring resubmission or a cross-table duplicate
    // from being counted twice or shown twice.
    const bestPerProblem = new Map<string, SolvedRow>();
    for (const r of rows) {
      const existing = bestPerProblem.get(r.problem_id);
      if (!existing || r.points > existing.points) bestPerProblem.set(r.problem_id, r);
    }
    const deduped = [...bestPerProblem.values()];
    const totalPoints = deduped.reduce((sum, r) => sum + r.points, 0);
    const recent = [...rows].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()).slice(0, 10);

    // This mirrors the Leaderboard's "This Month" tab exactly (same
    // cutoff, same tables, same points sum, same top-100 cap) so the
    // number shown here always matches what that tab would show. If the
    // user isn't in the top 100 this month (or hasn't scored any points
    // this month), there's simply no rank to show — same as the
    // leaderboard, which also wouldn't display them.
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 1);
    const [{ data: monthSubs }, { data: monthArena }, { data: monthWeekly }] = await Promise.all([
      db.from('submissions').select('github, points_awarded')
        .eq('status', 'approved').gte('created_at', cutoff.toISOString()),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.from('arena_submissions') as any).select('github, points_awarded')
        .eq('status', 'reviewed').gte('created_at', cutoff.toISOString()),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.from('weekly_submissions') as any).select('github, points_awarded')
        .eq('status', 'approved').gte('submitted_at', cutoff.toISOString()),
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

    setStats({
      totalPoints,
      problemsSolved: deduped.length,
      streak: effectiveStreak(memberRow?.streak, memberRow?.last_solved_at),
      lastSolvedAt: memberRow?.last_solved_at || null,
      rank,
      recent,
    });
    setLoading(false);
  }, [db, user]);

  useEffect(() => { load(); }, [load]);

  // Live-refresh the moment a new submission lands, same idea as the leaderboard.
  useEffect(() => {
    if (!user) return;
    const channel = db
      .channel(`profile-realtime-${user.github}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions', filter: `github=eq.${user.github}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_submissions', filter: `github=eq.${user.github}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'arena_submissions', filter: `github=eq.${user.github}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `github=eq.${user.github}` }, load)
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [db, user, load]);

  if (!user) {
    return (
      <div className="text-center py-24">
        <p className="text-[#888] font-mono mb-4">Sign in to see your profile.</p>
        <button onClick={() => onNavigate('home')} className="btn-ghost">← Back home</button>
      </div>
    );
  }

  if (loading || !stats) {
    return (
      <div className="flex justify-center py-24">
        <div className="spinner" />
      </div>
    );
  }

  const isActiveToday = stats.lastSolvedAt
    ? Math.floor((Date.now() - new Date(stats.lastSolvedAt).getTime()) / 86_400_000) <= 1
    : false;

  return (
    <div className="max-w-3xl mx-auto animate-fade-up">
      {/* Header */}
      <div className="card-glow p-6 mb-6 flex items-center gap-4 flex-wrap">
        <img
          src={`https://github.com/${user.github}.png?size=80`}
          alt={user.name}
          className="w-16 h-16 rounded-full object-cover ring-2 ring-[#262c3a]"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="min-w-0">
          <h1 className="font-display font-bold text-xl text-[#e0e0e0]">{user.name}</h1>
          <p className="text-sm font-mono text-[#666]">@{user.github}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10px] font-mono text-[#666] uppercase">Monthly rank</p>
          <p className="text-2xl font-display font-bold text-[#00e87a]">
            {stats.rank ? `#${stats.rank}` : '-'}
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card-hover p-5 text-center">
          <p className="text-3xl font-display font-bold text-[#00e87a] stat-glow">{stats.totalPoints}</p>
          <p className="text-xs font-mono text-[#888] mt-1 uppercase tracking-wide">Total points</p>
        </div>
        <div className="card-hover p-5 text-center">
          <p className="text-3xl font-display font-bold text-[#e0e0e0]">{stats.problemsSolved}</p>
          <p className="text-xs font-mono text-[#888] mt-1 uppercase tracking-wide">Problems solved</p>
        </div>
        <div className="card-hover p-5 text-center">
          <p className={`text-3xl font-display font-bold ${isActiveToday ? 'text-[#f0b429]' : 'text-[#555]'}`}>
            🔥 {stats.streak}
          </p>
          <p className="text-xs font-mono text-[#888] mt-1 uppercase tracking-wide">
            Day streak {!isActiveToday && stats.streak > 0 && '(solve today to keep it!)'}
          </p>
        </div>
      </div>

      {/* Recent activity */}
      <div className="card p-5">
        <h2 className="font-display font-bold text-sm text-[#e0e0e0] mb-4">Recent activity</h2>
        {stats.recent.length === 0 ? (
          <div className="text-center py-10 text-[#666] font-mono text-sm">
            No submissions yet —{' '}
            <button onClick={() => onNavigate('problems')} className="text-[#00e87a] hover:underline">
              solve your first problem
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#1a1a1a]">
            {stats.recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-mono text-[#e0e0e0] truncate">{r.problem_title}</p>
                  <p className="text-[10px] font-mono text-[#666] mt-0.5">
                    {r.source === 'arena' ? '🏆 Arena' : r.source === 'weekly' ? '🏅 Weekly' : '{ } Problems'}
                    {' · '}
                    {new Date(r.when).toLocaleDateString()}
                    {r.total > 0 && ` · ${r.passed}/${r.total} tests`}
                  </p>
                </div>
                <span className="text-sm font-mono font-bold text-[#00e87a] shrink-0">+{r.points}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
