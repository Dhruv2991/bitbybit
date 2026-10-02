'use client';
import { useEffect, useState, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { User, Certificate } from '@/types/database';
import { effectiveStreak } from '@/lib/streak';
import { BADGES, computeUnlockedBadges, type Badge } from '@/lib/badges';
import ContributionHeatmap from '@/components/profile/ContributionHeatmap';
import SkillRadar from '@/components/profile/SkillRadar';
import CertificatePreview from '@/components/certificates/CertificatePreview';
import SpotlightCard from '@/components/ui/SpotlightCard';
import { Award, Download, Eye, ExternalLink, ShieldCheck, X } from 'lucide-react';

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
  isBloodFirst?: boolean; // true if this user was the first person ever to solve this problem
}

interface Stats {
  totalPoints:    number;
  problemsSolved: number;
  streak:         number;
  lastSolvedAt:   string | null;
  rank:           number | null;
  recent:         SolvedRow[];
  allDates:       string[];
  skillTags:      { tag: string; count: number }[];
  aiAssists:      number;
  bloodFirstCount: number;
  badges:         Badge[];
  certificates:   Certificate[];
}

export default function ProfilePage({ user, onNavigate }: ProfilePageProps) {
  const db = getSupabaseClient();
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingCertificate, setViewingCertificate] = useState<Certificate | null>(null);
  const [downloadingCertId, setDownloadingCertId] = useState<string | null>(null);

  const handleDownload = async (certificateId: string) => {
    setDownloadingCertId(certificateId);
    try {
      const { data: { session } } = await db.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        alert("Session expired. Please sign in again.");
        return;
      }
      const res = await fetch("/api/certificates/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ certificateId }),
      });
      const data = await res.json();
      if (!res.ok || !data.downloadUrl) {
        alert(data.error || "Failed to download certificate");
      } else {
        window.open(data.downloadUrl, "_blank");
      }
    } catch {
      alert("Network error during download");
    } finally {
      setDownloadingCertId(null);
    }
  };

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);

    // Same "best score per problem, across all three submission tables"
    // aggregation the leaderboard uses, so the numbers here always match
    // what's shown there — no separate source of truth to drift out of sync.
    const [{ data: normalSubs }, { data: arenaSubs }, { data: weeklySubs }, { data: memberRow }, { data: allProblems }, { data: aiRows }, { data: certRows }] =
      await Promise.all([
        db.from('submissions').select('problem_id, problem_title, points_awarded, tests_passed, tests_total, created_at')
          .eq('github', user.github).eq('status', 'approved'),
        // eslint-disable-next-line
        (db.from('arena_submissions') as any).select('problem_id, problem_title, points_awarded, tests_passed, tests_total, created_at')
          .eq('github', user.github).eq('status', 'reviewed'),
        // eslint-disable-next-line
        (db.from('weekly_submissions') as any).select('problem_id, problem_title, points_awarded, tests_passed, tests_total, submitted_at')
          .eq('github', user.github).eq('status', 'approved'),
        // eslint-disable-next-line
        (db.from('members') as any).select('streak, last_solved_at').eq('github', user.github).maybeSingle(),
        // eslint-disable-next-line
        (db.from('problems') as any).select('id, tags'),
        // eslint-disable-next-line
        (db.from('ai_usage') as any).select('used').eq('github', user.github),
        // eslint-disable-next-line
        (db.from('certificates') as any).select('*').eq('github', user.github).order('created_at', { ascending: false }),
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

    // Tag breakdown for the skill radar — count solved problems per tag,
    // using whatever tags each problem actually has (data-driven, no
    // hardcoded category list, so it adapts as new problems/tags are added).
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
    const recent = [...rows].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime()).slice(0, 10);
    // Full, unsliced set of solve dates — used by the contribution
    // heatmap, which needs the whole history, not just the last 10.
    const allDates = rows.map(r => r.when);

    // "Blood First" — was this user the very first person, platform-wide,
    // to solve each given problem? Computed by pulling every approved
    // solve for the problems this user has solved, across all three
    // tables, and finding the earliest github per problem_id. Scoped to
    // just the user's solved problem_ids (not the whole platform's
    // history) to keep the query small as the site grows.
    const solvedIds = [...new Set(deduped.map(r => r.problem_id))];
    let bloodFirstCount = 0;
    if (solvedIds.length > 0) {
      const [{ data: gSubs }, { data: gArena }, { data: gWeekly }] = await Promise.all([
        db.from('submissions').select('github, problem_id, created_at')
          .eq('status', 'approved').in('problem_id', solvedIds),
        // eslint-disable-next-line
        (db.from('arena_submissions') as any).select('github, problem_id, created_at')
          .eq('status', 'reviewed').in('problem_id', solvedIds),
        // eslint-disable-next-line
        (db.from('weekly_submissions') as any).select('github, problem_id, submitted_at')
          .eq('status', 'approved').in('problem_id', solvedIds),
      ]);
      const globalRows = [
        ...(gSubs || []).map((r: any) => ({ github: r.github, problem_id: r.problem_id, when: r.created_at })),
        ...(gArena || []).map((r: any) => ({ github: r.github, problem_id: r.problem_id, when: r.created_at })),
        ...(gWeekly || []).map((r: any) => ({ github: r.github, problem_id: r.problem_id, when: r.submitted_at })),
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
      // eslint-disable-next-line
      (db.from('arena_submissions') as any).select('github, points_awarded')
        .eq('status', 'reviewed').gte('created_at', cutoff.toISOString()),
      // eslint-disable-next-line
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

    const currentStreak = effectiveStreak(memberRow?.streak, memberRow?.last_solved_at);
    const badges = computeUnlockedBadges({
      problemsSolved: deduped.length,
      totalPoints,
      everSolvedArena:  (arenaSubs || []).length > 0,
      everSolvedWeekly: (weeklySubs || []).length > 0,
      currentStreak,
      monthlyRank: rank,
    });

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'certificates', filter: `github=eq.${user.github}` }, load)
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
    <div className="max-w-3xl mx-auto animate-fade-up space-y-6">
      {/* Header */}
      <SpotlightCard
        spotlightColor="rgba(0, 229, 255, 0.08)"
        className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 flex items-center gap-4 flex-wrap shadow-sm"
      >
        <img
          src={`https://github.com/${user.github}.png?size=80`}
          alt={user.name}
          className="w-16 h-16 rounded-full object-cover ring-2 ring-white/10"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="min-w-0">
          <h1 className="font-display font-medium text-xl text-zinc-100 tracking-tight">{user.name}</h1>
          <p className="text-sm font-mono text-zinc-400">@{user.github}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">Monthly rank</p>
          <p className="text-2xl font-display font-medium text-cyan-400">
            {stats.rank ? `#${stats.rank}` : '-'}
          </p>
        </div>
      </SpotlightCard>

      {/* Stat cards */}
      <div className={`grid grid-cols-1 sm:grid-cols-3 ${(stats.aiAssists > 0 || stats.bloodFirstCount > 0) ? 'md:grid-cols-5' : ''} gap-3.5`}>
        <SpotlightCard
          spotlightColor="rgba(0, 229, 255, 0.08)"
          className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 text-center"
        >
          <p className="text-2xl font-sans font-semibold text-cyan-400">{stats.totalPoints}</p>
          <p className="text-xs font-sans text-zinc-400 mt-1 uppercase tracking-wider font-medium">Total points</p>
        </SpotlightCard>
        <SpotlightCard
          spotlightColor="rgba(255, 255, 255, 0.05)"
          className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 text-center"
        >
          <p className="text-2xl font-sans font-semibold text-zinc-100">{stats.problemsSolved}</p>
          <p className="text-xs font-sans text-zinc-400 mt-1 uppercase tracking-wider font-medium">Problems solved</p>
        </SpotlightCard>
        <SpotlightCard
          spotlightColor="rgba(251, 191, 36, 0.08)"
          className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 text-center"
        >
          <p className={`text-2xl font-sans font-semibold ${isActiveToday ? 'text-amber-400' : 'text-zinc-500'}`}>
            🔥 {stats.streak}
          </p>
          <p className="text-xs font-sans text-zinc-400 mt-1 uppercase tracking-wider font-medium">
            Day streak {!isActiveToday && stats.streak > 0 && '(solve today!)'}
          </p>
        </SpotlightCard>
        {stats.aiAssists > 0 && (
          <SpotlightCard
            spotlightColor="rgba(56, 189, 248, 0.08)"
            className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 text-center"
          >
            <p className="text-2xl font-sans font-semibold text-sky-400">🤖 {stats.aiAssists}</p>
            <p className="text-xs font-sans text-zinc-400 mt-1 uppercase tracking-wider font-medium">AI assists</p>
          </SpotlightCard>
        )}
        {stats.bloodFirstCount > 0 && (
          <SpotlightCard
            spotlightColor="rgba(244, 63, 94, 0.08)"
            className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5 text-center"
          >
            <p className="text-2xl font-sans font-semibold text-rose-400">🩸 {stats.bloodFirstCount}</p>
            <p className="text-xs font-sans text-zinc-400 mt-1 uppercase tracking-wider font-medium" title="First person platform-wide to solve these problems">
              Blood First
            </p>
          </SpotlightCard>
        )}
      </div>

      {/* ── MY CERTIFICATES SECTION ── */}
      <SpotlightCard
        spotlightColor="rgba(0, 229, 255, 0.06)"
        className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-medium text-sm text-zinc-100 tracking-tight flex items-center gap-2">
            <Award className="w-4 h-4 text-cyan-400" /> My Certificates
            <span className="text-zinc-500 font-mono font-normal">({stats.certificates.length})</span>
          </h2>
        </div>

        {stats.certificates.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 font-mono text-xs">
            No certificates issued yet. Participate in weekly contests and arena challenges to earn certificates!
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {stats.certificates.map((cert) => {
              const isRevoked = cert.status === 'revoked';
              return (
                <div key={cert.id} className="py-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm font-sans text-zinc-100 truncate">
                        {cert.title || 'Certificate of Achievement'}
                      </span>
                      {isRevoked ? (
                        <span className="text-[10px] font-mono font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-full px-2 py-0.5">
                          Revoked
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                          Verified
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-zinc-400 mt-0.5">{cert.event_name}</p>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500 mt-1">
                      <span>
                        Issued: {new Date(cert.issued_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </span>
                      <span>•</span>
                      <span className="text-zinc-400 font-medium">{cert.certificate_id}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setViewingCertificate(cert)}
                      className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5 font-mono"
                    >
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>
                    {!isRevoked && (
                      <button
                        onClick={() => handleDownload(cert.certificate_id)}
                        disabled={downloadingCertId === cert.certificate_id}
                        className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 font-mono"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {downloadingCertId === cert.certificate_id ? 'Downloading...' : 'Download'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SpotlightCard>

      {/* Badges */}
      <SpotlightCard
        spotlightColor="rgba(255, 255, 255, 0.04)"
        className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-medium text-sm text-zinc-100 tracking-tight">
            Badges <span className="text-zinc-500 font-mono font-normal">({stats.badges.length}/{BADGES.length})</span>
          </h2>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
          {BADGES.map(b => {
            const unlocked = stats.badges.some(ub => ub.id === b.id);
            return (
              <div key={b.id} title={`${b.label} — ${b.description}${!b.permanent ? ' (current status, can change)' : ''}`}
                className={`flex flex-col items-center text-center gap-1.5 p-3 rounded-xl border transition-all
                  ${unlocked
                    ? 'bg-cyan-500/10 border-cyan-500/25'
                    : 'bg-zinc-950/30 border-white/[0.04] opacity-40 grayscale'}`}>
                <span className="text-2xl">{b.icon}</span>
                <span className={`text-[10px] font-mono leading-tight ${unlocked ? 'text-zinc-200' : 'text-zinc-500'}`}>
                  {b.label}
                </span>
                {!b.permanent && unlocked && (
                  <span className="text-[8px] font-mono text-amber-400 uppercase">current</span>
                )}
              </div>
            );
          })}
        </div>
      </SpotlightCard>

      {/* Contribution heatmap */}
      <ContributionHeatmap dates={stats.allDates} />

      {/* Skill radar */}
      <SkillRadar skills={stats.skillTags} />

      {/* Recent activity */}
      <SpotlightCard
        spotlightColor="rgba(255, 255, 255, 0.04)"
        className="bg-zinc-900/40 backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 shadow-sm"
      >
        <h2 className="font-display font-medium text-sm text-zinc-100 tracking-tight mb-4">Recent activity</h2>
        {stats.recent.length === 0 ? (
          <div className="text-center py-10 text-zinc-500 font-mono text-sm">
            No submissions yet —{' '}
            <button onClick={() => onNavigate('problems')} className="text-cyan-400 hover:underline">
              solve your first problem
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {stats.recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-mono text-zinc-200 truncate flex items-center gap-1.5">
                    {r.problem_title}
                    {r.isBloodFirst && (
                      <span title="You were the first person platform-wide to solve this" className="shrink-0">🩸</span>
                    )}
                  </p>
                  <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
                    {r.source === 'arena' ? '🏆 Arena' : r.source === 'weekly' ? '🏅 Weekly' : '{ } Problems'}
                    {' · '}
                    {new Date(r.when).toLocaleDateString()}
                    {r.total > 0 && ` · ${r.passed}/${r.total} tests`}
                  </p>
                </div>
                <span className="text-xs font-mono font-medium text-emerald-400 shrink-0">+{r.points}</span>
              </div>
            ))}
          </div>
        )}
      </SpotlightCard>

      {/* Certificate Viewer Modal */}
      {viewingCertificate && (
        <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-zinc-900/90 backdrop-blur-2xl border border-white/[0.08] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-cyan-400" />
                <h3 className="font-display font-medium text-base text-zinc-100 tracking-tight">
                  {viewingCertificate.certificate_id}
                </h3>
              </div>
              <button
                onClick={() => setViewingCertificate(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="p-3 bg-zinc-950/60 rounded-xl border border-white/[0.06]">
                <CertificatePreview
                  recipientName={viewingCertificate.recipient_name}
                  title={viewingCertificate.title}
                  achievementText={viewingCertificate.achievement_text}
                  eventName={viewingCertificate.event_name}
                  organizationText={viewingCertificate.organization_text}
                  activityPointsText={viewingCertificate.activity_points_text}
                  coordinators={viewingCertificate.coordinator_names || []}
                  dateStr={new Date(viewingCertificate.issued_at).toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                  certificateId={viewingCertificate.certificate_id}
                  status={viewingCertificate.status}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <a
                  href={`/certificate/${viewingCertificate.certificate_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Public Verification Link
                </a>
                {viewingCertificate.status !== 'revoked' && (
                  <button
                    onClick={() => handleDownload(viewingCertificate.certificate_id)}
                    disabled={downloadingCertId === viewingCertificate.certificate_id}
                    className="btn-primary py-2 px-4 text-xs font-mono flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    {downloadingCertId === viewingCertificate.certificate_id ? 'Downloading...' : 'Download PDF'}
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
