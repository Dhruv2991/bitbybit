'use client';
import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { getSupabaseClient } from '@/lib/supabase';
import type { Problem, User } from '@/types/database';
import { LANG_LABELS, type SupportedLang } from '@/types/database';
import { isActiveSubscription } from '@/lib/subscription';

const Workspace = dynamic(() => import('@/app/problems/Workspace'), { ssr: false });

const DIFFICULTIES = ['all', 'Easy', 'Medium', 'Hard'] as const;

type PageView = 'problems' | 'submissions';

interface SubmissionRow {
  id:            string;
  problem_title: string;
  lang:          string;
  status:        'pending' | 'approved' | 'rejected';
  points_awarded: number;
  submitted_at:  string;
  type:          'normal' | 'weekly';
  review_notes?: string;
}

interface ProblemsPageProps {
  user:       User | null;
  onNavigate: (page: 'weekly') => void;
}

function ShareButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        const url = `${window.location.origin}${window.location.pathname}#problems`;
        navigator.clipboard?.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="flex items-center gap-2 px-3 py-2 bg-[#0a0a0a] border border-[#1a1a1a]
        rounded-xl font-mono text-xs text-[#666] hover:text-[#e0e0e0] hover:border-[#252525]
        transition-all duration-200"
    >
      {copied ? (
        <><span className="text-[#00e87a]">✓</span><span className="text-[#00e87a]">Link copied</span></>
      ) : (
        <><span>🔗</span><span>Share</span></>
      )}
    </button>
  );
}

export default function ProblemsPage({ user, onNavigate }: ProblemsPageProps) {
  const [problems,       setProblems]       = useState<Problem[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [filter,         setFilter]         = useState<string>('all');
  const [selected,       setSelected]       = useState<Problem | null>(null);
  const [solved,         setSolved]         = useState<string[]>([]);
  const [weeklyIds,      setWeeklyIds]      = useState<Set<string>>(new Set());
  const [weeklyChallengeMap, setWeeklyChallengeMap] = useState<Map<string, any>>(new Map());
  const [lockedToast,       setLockedToast]       = useState(false);
  const [notStartedToast,   setNotStartedToast]   = useState<string>('');
  const [unlockedIds,       setUnlockedIds]       = useState<Set<string>>(new Set());
  const [paidNotStartedIds, setPaidNotStartedIds] = useState<Set<string>>(new Set());
  const [paidEndedIds,      setPaidEndedIds]      = useState<Set<string>>(new Set());
  const [attemptCounts,     setAttemptCounts]     = useState<Record<string, number>>({});
  const [search,             setSearch]             = useState('');
  const [pageView,          setPageView]          = useState<PageView>('problems');
  const [submissions,       setSubmissions]       = useState<SubmissionRow[]>([]);
  const [subsLoading,       setSubsLoading]       = useState(false);
  const [shareCard, setShareCard] = useState<{
    title: string; lang: string; passed: number; total: number; points: number;
  } | null>(null);

  useEffect(() => {
    try { setSolved(JSON.parse(localStorage.getItem('bb_solved') || '[]')); } catch {}

    const db = getSupabaseClient();

    if (user?.github) {
      db.from('submissions')
        .select('problem_id')
        .eq('github', user.github)
        .eq('status', 'approved')
        .then(({ data }) => {
          if (!data?.length) return;
          setSolved(prev => {
            const merged = [...new Set([...prev, ...data.map((s: any) => s.problem_id)])];
            try { localStorage.setItem('bb_solved', JSON.stringify(merged)); } catch {}
            return merged;
          });
        });

      // Also check weekly_submissions for approved weekly problems
      (db.from('weekly_submissions') as any)
        .select('problem_id')
        .eq('github', user.github)
        .eq('status', 'approved')
        .then(({ data }: any) => {
          if (!data?.length) return;
          setSolved(prev => {
            const merged = [...new Set([...prev, ...data.map((s: any) => s.problem_id)])];
            try { localStorage.setItem('bb_solved', JSON.stringify(merged)); } catch {}
            return merged;
          });
        });
    }

    // Load attempt counts for all problems (submissions + weekly_submissions + practice_attempts)
    Promise.all([
      db.from('submissions').select('problem_id'),
      (db.from('weekly_submissions') as any).select('problem_id'),
      (db.from('practice_attempts') as any).select('problem_id'),
    ]).then(([{ data: normalSubs }, { data: weeklySubs }, { data: practiceAttempts }]) => {
      const counts: Record<string, number> = {};
      for (const s of [...(normalSubs || []), ...(weeklySubs || []), ...(practiceAttempts || [])]) {
        counts[s.problem_id] = (counts[s.problem_id] || 0) + 1;
      }
      setAttemptCounts(counts);
    });

    async function load() {
      setLoading(true);
      try {
        // Load problems (excluding contest problems)
        const { data, error } = await db
          .from('problems')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        const publicProbs = (data || []).filter((p: any) =>
          p.visibility === 'public' || p.visibility === 'weekly' || (!p.visibility && !p.is_contest_problem)
        );
        setProblems(publicProbs as Problem[]);

        // Load weekly challenge problem IDs — include ended ones too so
        // paid users can still get "practice mode" access after end
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: challenges } = await (db.from('weekly_challenges') as any)
          .select('id, problem_ids, starts_at, ends_at, status')
          .order('created_at', { ascending: false });

        const allWeeklyIds = new Set<string>();
        const challengeMap = new Map<string, any>();
        (challenges || []).forEach((ch: any) => {
          (ch.problem_ids || []).forEach((id: string) => {
            allWeeklyIds.add(id);
            challengeMap.set(id, ch);
          });
        });
        setWeeklyIds(allWeeklyIds);
        setWeeklyChallengeMap(challengeMap);

        // Check if user is a confirmed subscriber — if so, unlock all weekly problems
        if (user?.github && allWeeklyIds.size) {
          const { data: sub } = await (db.from('subscribers') as any)
            .select('status, current_period_end')
            .eq('github', user.github)
            .maybeSingle();

          if (isActiveSubscription(sub?.status, sub?.current_period_end)) {
            // Subscriber sees all weekly problems
            setUnlockedIds(new Set(allWeeklyIds));
            setPaidNotStartedIds(new Set());
            setPaidEndedIds(new Set());
          } else {
            setUnlockedIds(new Set());
            setPaidNotStartedIds(new Set());
            setPaidEndedIds(new Set());
          }
        }
      } catch {
        setProblems([]);
      } finally {
        setLoading(false);
      }
    }
    load();

    const channel = db
      .channel('problems-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'problems' }, load)
      .subscribe();

    return () => { db.removeChannel(channel); };
  }, [user]);

  const allTags = Array.from(
    new Set(problems.flatMap(p => p.tags || []))
  ).sort((a, b) => a.localeCompare(b));

  const afterFilter = filter === 'all'
    ? problems
    : problems.filter(p => p.difficulty === filter || (p.tags || []).includes(filter));

  const filtered = search.trim()
    ? afterFilter.filter(p =>
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        (p.tags || []).some((t: string) => t.toLowerCase().includes(search.toLowerCase()))
      )
    : afterFilter;

  async function handleSolved(
    problemId: string,
    details?: { code: string; lang: string; passed: number; total: number; pointsAwarded: number }
  ) {
    // Update local solved state
    const wasAlreadySolved = solved.includes(problemId);
    setSolved(prev => {
      if (prev.includes(problemId)) return prev;
      const next = [...prev, problemId];
      try { localStorage.setItem('bb_solved', JSON.stringify(next)); } catch {}
      return next;
    });

    // Show a shareable card the first time this problem is fully solved
    if (!wasAlreadySolved && details && details.total > 0 && details.passed === details.total) {
      const problem = problems.find(p => p.id === problemId);
      setShareCard({
        title: problem?.title ?? 'Problem',
        lang: details.lang,
        passed: details.passed,
        total: details.total,
        points: details.pointsAwarded,
      });
    }

    // If this is a weekly problem and user is logged in, write to weekly_submissions
    const challenge = weeklyChallengeMap.get(problemId);
    if (challenge && user) {
      try {
        const db = getSupabaseClient();
        const problem = problems.find(p => p.id === problemId);
        const now = Date.now();
        const start = new Date(challenge.starts_at).getTime();
        const end = new Date(challenge.ends_at).getTime();
        const total = end - start;
        const frac = total > 0 ? Math.min(1, Math.max(0, now - start) / total) : 1;
        const bonus = 1.0 - frac * 0.8;
        const basePts = details?.pointsAwarded ?? problem?.points ?? 100;
        const finalPoints = Math.round(basePts * (1 + bonus));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db.from('weekly_submissions') as any).upsert(
          {
            weekly_challenge_id: challenge.id,
            problem_id: problemId,
            problem_title: problem?.title ?? '',
            github: user.github,
            name: user.name,
            lang: details?.lang ?? 'unknown',
            code: details?.code ?? '',
            tests_passed: details?.passed ?? 0,
            tests_total: details?.total ?? 0,
            points_awarded: finalPoints,
            time_bonus: bonus,
            status: 'pending',
            submitted_at: new Date().toISOString(),
          },
          { onConflict: 'weekly_challenge_id,problem_id,github' }
        );
      } catch {}
      return; // Don't write to submissions table for weekly problems
    }
  }

  // Deep-link: open a specific problem once problems are loaded (e.g. from "Daily Problem" on homepage)
  useEffect(() => {
    if (!problems.length) return;
    let pendingId = '';
    try { pendingId = sessionStorage.getItem('bb_open_problem_id') || ''; } catch {}
    if (!pendingId) return;
    const target = problems.find(p => p.id === pendingId);
    try { sessionStorage.removeItem('bb_open_problem_id'); } catch {}
    if (target) handleRowClick(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problems]);

  function handleRowClick(p: Problem) {
    const isWeekly      = (p as any).visibility === 'weekly' || weeklyIds.has(p.id);
    const isUnlocked    = unlockedIds.has(p.id);
    const isPaidWaiting = paidNotStartedIds.has(p.id);
    const isPaidEnded   = paidEndedIds.has(p.id);
    if (isWeekly && !isUnlocked) {
      if (isPaidEnded) {
        setSelected(p);
        return;
      } else if (isPaidWaiting) {
        setNotStartedToast('Challenge hasn\'t started yet — come back when it does!');
      } else {
        setLockedToast(true);
        setTimeout(() => setLockedToast(false), 3500);
      }
      if (isPaidWaiting) setTimeout(() => setNotStartedToast(''), 3500);
      // Navigate to weekly tab to show paywall
      onNavigate('weekly');
      return;
    }
    setSelected(p);
  }

  async function loadSubmissions() {
    if (!user?.github) return;
    setSubsLoading(true);
    try {
      const db = getSupabaseClient();
      const [{ data: normal }, { data: weekly }] = await Promise.all([
        db
          .from('submissions')
          .select('id, problem_title, lang, status, points_awarded, created_at, review_notes')
          .eq('github', user.github)
          .order('created_at', { ascending: false })
          .limit(100),
        (db.from('weekly_submissions') as any)
          .select('id, problem_title, lang, status, points_awarded, submitted_at, review_notes')
          .eq('github', user.github)
          .order('submitted_at', { ascending: false })
          .limit(100),
      ]);

      const normalRows: SubmissionRow[] = (normal || []).map((s: any) => ({
        id:            s.id,
        problem_title: s.problem_title,
        lang:          s.lang,
        status:        s.status,
        points_awarded: s.points_awarded ?? 0,
        submitted_at:  s.created_at,
        type:          'normal',
        review_notes:  s.review_notes,
      }));

      const weeklyRows: SubmissionRow[] = (weekly || []).map((s: any) => ({
        id:            s.id,
        problem_title: s.problem_title,
        lang:          s.lang,
        status:        s.status,
        points_awarded: s.points_awarded ?? 0,
        submitted_at:  s.submitted_at,
        type:          'weekly',
        review_notes:  s.review_notes,
      }));

      const merged = [...normalRows, ...weeklyRows].sort(
        (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
      );
      setSubmissions(merged);
    } catch {
      setSubmissions([]);
    } finally {
      setSubsLoading(false);
    }
  }

  function handleTabChange(tab: PageView) {
    setPageView(tab);
    if (tab === 'submissions' && submissions.length === 0) {
      loadSubmissions();
    }
  }

  if (selected) {
    const isSelectedWeekly = weeklyIds.has(selected.id) || (selected as any).visibility === 'weekly';
    const isSubscribed = unlockedIds.has(selected.id);

    // Check if the challenge containing this problem is still active
    const challenge = weeklyChallengeMap.get(selected.id);
    const now = Date.now();
    const challengeActive = challenge
      ? challenge.status !== 'ended' &&
        new Date(challenge.starts_at).getTime() <= now &&
        new Date(challenge.ends_at).getTime() >= now
      : false;

    // Points are only awarded when:
    // - User is a subscriber AND
    // - The challenge is currently active (not ended, not upcoming)
    // All other weekly problem access = practice mode (no points)
    const isPracticeMode = isSelectedWeekly && (!isSubscribed || !challengeActive);

    return (
      <Workspace
        problem={selected}
        user={user}
        onClose={() => setSelected(null)}
        onSolved={handleSolved}
        isWeekly={isSelectedWeekly && isSubscribed && challengeActive}
        practiceMode={isPracticeMode}
      />
    );
  }

  return (
    <div className="animate-fade-up relative">

      {/* Locked toast — unpaid */}
      {lockedToast && (
        <div className="fixed top-20 right-4 z-[200] flex items-center gap-2.5 px-4 py-3 bg-[#0f0f0f] border border-[#f0b42930] rounded-2xl font-mono text-sm shadow-2xl max-w-xs animate-slide-down backdrop-blur-xl" style={{boxShadow:"0 8px 32px rgba(240,180,41,0.08)"}}>
          <span className="text-lg">🔒</span>
          <div>
            <p className="text-[#f0b429] font-bold text-xs">Subscriber-only Problem</p>
            <p className="text-[#aaa] text-[10px] mt-0.5">
              <button onClick={() => { setLockedToast(false); onNavigate('weekly'); }}
                className="text-[#00e87a] underline underline-offset-2 hover:text-[#00ff88]">
                Subscribe ⭐
              </button>
              {' '}to unlock all weekly challenges.
            </p>
          </div>
        </div>
      )}

      {/* Not-started toast — paid but waiting */}
      {notStartedToast && (
        <div className="fixed top-20 right-4 z-[200] flex items-center gap-2.5 px-4 py-3 bg-[#0f0f0f] border border-[#a78bfa30] rounded-2xl font-mono text-sm shadow-2xl max-w-xs animate-slide-down backdrop-blur-xl" style={{boxShadow:"0 8px 32px rgba(167,139,250,0.08)"}}>
          <span className="text-lg">⏳</span>
          <div>
            <p className="text-[#a78bfa] font-bold text-xs">Not Started Yet</p>
            <p className="text-[#aaa] text-[10px] mt-0.5">{notStartedToast}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        {/* Title row */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="font-display font-bold text-xl md:text-2xl mb-0.5 text-[#e2e2e2]">Problems</h1>
            <p className="text-[#666] text-xs font-mono">
              {pageView === 'problems'
                ? filtered.length !== problems.length
                  ? `${filtered.length} of ${problems.length} problems`
                  : `${problems.length} problems`
                : `${submissions.length} submission${submissions.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Tab switcher — only for logged-in users */}
            {user && (
              <div className="flex bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-1 gap-1">
                <button
                  onClick={() => handleTabChange('problems')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all
                    ${pageView === 'problems'
                      ? 'bg-[#141414] text-[#e0e0e0] border border-[#252525]'
                      : 'text-[#555] hover:text-[#999]'}`}
                >
                  Problems
                </button>
                <button
                  onClick={() => handleTabChange('submissions')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all
                    ${pageView === 'submissions'
                      ? 'bg-[#141414] text-[#e0e0e0] border border-[#252525]'
                      : 'text-[#555] hover:text-[#999]'}`}
                >
                  My Submissions
                </button>
              </div>
            )}
            <ShareButton />
          </div>
        </div>

        {/* Search + filters row — only on problems tab */}
        {pageView === 'problems' && (
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#444] text-xs pointer-events-none">🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search problems or tags…"
              className="w-full bg-[#080808] border border-[#1a1a1a] rounded-xl pl-8 pr-10 py-2.5
                text-sm font-mono text-[#e0e0e0] placeholder-[#333]
                focus:outline-none focus:border-[#00e87a25] transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#e0e0e0] text-xs transition-colors"
              >
                ✕
              </button>
            )}
          </div>

          {/* Difficulty filters */}
          <div className="flex gap-1.5 flex-wrap shrink-0">
            {DIFFICULTIES.map(d => {
              const count = d === 'all' ? problems.length : problems.filter(p => p.difficulty === d).length;
              return (
                <button key={d} onClick={() => setFilter(d)}
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-mono font-medium transition-all duration-200 flex items-center gap-1.5
                    ${filter === d
                      ? d === 'Easy'   ? 'bg-[#00e87a18] text-[#00e87a] border border-[#00e87a30]'
                      : d === 'Medium' ? 'bg-[#f0b42918] text-[#f0b429] border border-[#f0b42930]'
                      : d === 'Hard'   ? 'bg-[#ff4d4d18] text-[#ff4d4d] border border-[#ff4d4d30]'
                      : 'bg-[#00e87a18] text-[#00e87a] border border-[#00e87a30]'
                      : 'bg-[#080808] border border-[#1a1a1a] text-[#888] hover:text-[#e0e0e0] hover:border-[#222]'}`}>
                  {d === 'all' ? 'All' : d}
                  {count > 0 && (
                    <span className="opacity-50 text-[10px] tabular-nums">{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        )}

        {/* Tag filter pills — only on problems tab */}
        {pageView === 'problems' && allTags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-3">
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setFilter(filter === tag ? 'all' : tag)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-mono transition-all duration-150
                  ${filter === tag
                    ? 'bg-[#a78bfa18] text-[#a78bfa] border border-[#a78bfa35]'
                    : 'bg-[#080808] border border-[#1a1a1a] text-[#777] hover:text-[#e0e0e0] hover:border-[#252525]'}`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {pageView === 'submissions' ? (
        /* ── My Submissions view ─────────────────────────────── */
        subsLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="spinner" />
            <span className="text-[#999] text-xs font-mono">Loading submissions…</span>
          </div>
        ) : submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="text-4xl opacity-30">{'{ }'}</div>
            <div className="text-[#999] font-mono text-sm">No submissions yet — go solve something!</div>
          </div>
        ) : (
          <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl overflow-hidden" style={{boxShadow:"0 0 0 1px rgba(255,255,255,0.02)"}}>
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[1fr_5rem_5rem_6rem_5rem_8rem] gap-4 px-5 py-3
              border-b border-[#161616] text-[10px] text-[#666] font-mono uppercase tracking-widest bg-[#0a0a0a]">
              <div>Problem</div>
              <div>Lang</div>
              <div>Type</div>
              <div>Status</div>
              <div>Points</div>
              <div>Submitted</div>
            </div>

            {submissions.map(s => {
              const statusColor =
                s.status === 'approved'  ? 'text-[#00e87a] bg-[#00e87a10] border-[#00e87a20]' :
                s.status === 'rejected'  ? 'text-[#ff4d4d] bg-[#ff4d4d10] border-[#ff4d4d20]' :
                                           'text-[#f0b429] bg-[#f0b42910] border-[#f0b42920]';
              const statusLabel =
                s.status === 'approved' ? '✓ Approved' :
                s.status === 'rejected' ? '✗ Rejected' : '⏳ Pending';
              const date = new Date(s.submitted_at);
              const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
              const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

              return (
                <div key={s.id}>
                  {/* Desktop row */}
                  <div className="hidden md:grid grid-cols-[1fr_5rem_5rem_6rem_5rem_8rem] gap-4 px-5 py-4
                    border-b border-[#161616] last:border-0 items-center hover:bg-[#0f0f0f] transition-colors">
                    <div>
                      <div className="text-[#ddd] font-mono text-sm truncate">{s.problem_title}</div>
                      {s.status === 'rejected' && s.review_notes && (
                        <div className="text-[10px] text-[#ff4d4d80] font-mono mt-0.5 truncate">{s.review_notes}</div>
                      )}
                    </div>
                    <div className="text-[#777] text-xs font-mono">{s.lang}</div>
                    <div>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-lg border
                        ${s.type === 'weekly'
                          ? 'text-[#a78bfa] bg-[#a78bfa10] border-[#a78bfa20]'
                          : 'text-[#666] bg-[#ffffff08] border-[#1f1f1f]'}`}>
                        {s.type === 'weekly' ? 'Weekly' : 'Normal'}
                      </span>
                    </div>
                    <div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <div className="text-[#a78bfa] text-sm font-mono font-bold">
                      {s.status === 'approved' ? `${s.points_awarded}` : '—'}
                    </div>
                    <div>
                      <div className="text-[#666] text-[10px] font-mono">{dateStr}</div>
                      <div className="text-[#444] text-[10px] font-mono">{timeStr}</div>
                    </div>
                  </div>

                  {/* Mobile card */}
                  <div className="md:hidden px-4 py-3.5 border-b border-[#161616] last:border-0 hover:bg-[#0f0f0f] transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-[#ddd] font-mono text-sm flex-1 truncate">{s.problem_title}</span>
                      <span className={`shrink-0 text-[10px] font-mono px-2 py-0.5 rounded-lg border ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-[#777] text-[10px] font-mono">{s.lang}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-lg border
                        ${s.type === 'weekly'
                          ? 'text-[#a78bfa] bg-[#a78bfa10] border-[#a78bfa20]'
                          : 'text-[#555] bg-[#ffffff08] border-[#1f1f1f]'}`}>
                        {s.type === 'weekly' ? 'Weekly' : 'Normal'}
                      </span>
                      {s.status === 'approved' && (
                        <span className="text-[#a78bfa] text-[10px] font-mono font-bold">{s.points_awarded} pts</span>
                      )}
                      <span className="text-[#555] text-[10px] font-mono ml-auto">{dateStr}</span>
                    </div>
                    {s.status === 'rejected' && s.review_notes && (
                      <div className="mt-1.5 text-[10px] text-[#ff4d4d80] font-mono truncate">{s.review_notes}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="spinner" />
          <span className="text-[#999] text-xs font-mono">Loading problems…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="text-4xl opacity-30">{ '{  }' }</div>
          <div className="text-[#999] font-mono text-sm">
            {problems.length === 0 ? 'No problems yet — check back soon!' : 'Nothing matches this filter.'}
          </div>
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden space-y-2">
            {filtered.map((p, i) => {
              const isSolved   = solved.includes(p.id);
              const isWeekly   = (p as any).visibility === 'weekly' || weeklyIds.has(p.id);
              const isUnlocked = unlockedIds.has(p.id);
              const isPaidEndedP = paidEndedIds.has(p.id);
              const isLocked   = isWeekly && !isUnlocked && !isPaidEndedP;
              return (
                <div key={p.id} onClick={() => handleRowClick(p)}
                  className={`card-hover px-4 py-3.5 flex items-center gap-3 cursor-pointer active:scale-[0.99]
                    ${isLocked ? 'opacity-70' : ''}`}>
                  <div className="text-[#ccc] text-xs font-mono w-6 shrink-0 text-center">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#e0e0e0] font-mono text-sm truncate">{p.title}</span>
                      {isLocked && <span className="text-xs shrink-0">🔒</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-lg
                        ${p.difficulty === 'Easy' ? 'text-[#00e87a] bg-[#00e87a12]' :
                          p.difficulty === 'Medium' ? 'text-[#f0b429] bg-[#f0b42912]' :
                          'text-[#ff4d4d] bg-[#ff4d4d12]'}`}>
                        {p.difficulty}
                      </span>
                      <span className="text-[#a78bfa] text-[10px] font-mono">{p.points} pts</span>
                      {isLocked && <span className="text-[10px] font-mono text-[#f0b429]">Weekly</span>}
                      {isPaidEndedP && !isSolved && <span className="text-[10px] font-mono text-[#a78bfa]">Practice (no pts)</span>}
                    </div>
                  </div>
                  <span className={`text-sm shrink-0 ${isSolved ? 'text-[#00e87a]' : isLocked ? 'text-[#f0b42960]' : 'text-[#ccc]'}`}>
                    {isSolved ? '✓' : isLocked ? '🔒' : '›'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-[#0a0a0a] border border-[#161616] rounded-2xl overflow-hidden" style={{boxShadow:"0 0 0 1px rgba(255,255,255,0.02)"}}>
            <div className="grid grid-cols-[2.5rem_1fr_7rem_5rem_6rem_6rem] gap-4 px-5 py-3
              border-b border-[#161616] text-[10px] text-[#666] font-mono uppercase tracking-widest bg-[#0a0a0a]">
              <div>#</div>
              <div>Title</div>
              <div>Difficulty</div>
              <div>Points</div>
              <div>Attempts</div>
              <div>Status</div>
            </div>

            {filtered.map((p, i) => {
              const isSolved   = solved.includes(p.id);
              const isWeekly   = (p as any).visibility === 'weekly' || weeklyIds.has(p.id);
              const isUnlocked = unlockedIds.has(p.id);
              const isPaidEndedP = paidEndedIds.has(p.id);
              const isLocked   = isWeekly && !isUnlocked && !isPaidEndedP;
              return (
                <div key={p.id} onClick={() => handleRowClick(p)}
                  className={`grid grid-cols-[2.5rem_1fr_7rem_5rem_6rem_6rem] gap-4 px-5 py-4
                    border-b border-[#161616] last:border-0 cursor-pointer
                    transition-all duration-150 group items-center
                    ${isLocked
                      ? 'hover:bg-[#f0b42904] opacity-75'
                      : 'row-hover hover:bg-[#0f0f0f]'}`}>

                  <div className="text-[#ccc] text-xs font-mono">{i + 1}</div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-mono text-sm transition-colors
                        ${isLocked
                          ? 'text-[#ccc] group-hover:text-[#f0b429]'
                          : 'text-[#ddd] group-hover:text-[#00e87a]'}`}>
                        {p.title}
                      </span>
                      {isLocked && (
                        <span className="text-[10px] font-mono text-[#f0b429] bg-[#f0b42915] px-1.5 py-0.5 rounded-lg border border-[#f0b42930]">
                          🔒 Weekly
                        </span>
                      )}
                      {isPaidEndedP && !isSolved && (
                        <span className="text-[10px] font-mono text-[#a78bfa] bg-[#a78bfa15] px-1.5 py-0.5 rounded-lg border border-[#a78bfa30]">
                          🏁 Practice (no points)
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {(p.tags || []).map(t => (
                        <span key={t} className="text-[10px] text-[#999] bg-[#0f0f0f] px-1.5 py-0.5 rounded font-mono border border-[#1a1a1a]">{t}</span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg
                      ${p.difficulty === 'Easy' ? 'text-[#00e87a] bg-[#00e87a12]' :
                        p.difficulty === 'Medium' ? 'text-[#f0b429] bg-[#f0b42912]' :
                        'text-[#ff4d4d] bg-[#ff4d4d12]'}`}>
                      {p.difficulty}
                    </span>
                  </div>

                  <div className="text-[#a78bfa] text-sm font-mono font-bold">{p.points}</div>
                  <div className="text-[#999] text-sm font-mono">{attemptCounts[p.id] || 0}</div>

                  <div>
                    {isSolved ? (
                      <span className="inline-flex items-center gap-1 text-[#00e87a] text-xs font-mono font-bold">
                        <span>✓</span> Solved
                      </span>
                    ) : isLocked ? (
                      <span className="text-[#f0b429] text-xs font-mono group-hover:text-[#f0b429] transition-colors">
                        Pay to unlock →
                      </span>
                    ) : isPaidEndedP ? (
                      <span className="text-[#a78bfa] text-xs font-mono group-hover:text-[#c4b5fd] transition-colors">
                        Practice →
                      </span>
                    ) : (
                      <span className="text-[#ccc] text-xs font-mono group-hover:text-[#aaa] transition-colors">Solve →</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {shareCard && (
        <ShareCardModal card={shareCard} onClose={() => setShareCard(null)} />
      )}
    </div>
  );
}

// ── Shareable solve card ──────────────────────────────────────
interface ShareCard {
  title: string;
  lang: string;
  passed: number;
  total: number;
  points: number;
}

function ShareCardModal({ card, onClose }: { card: ShareCard; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgUrl, setImgUrl] = useState<string>('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 1000, H = 560;
    canvas.width = W;
    canvas.height = H;

    // Background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0a0a0a');
    bg.addColorStop(1, '#0d0d0d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Border
    ctx.strokeStyle = '#1f1f1f';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // Glow accent
    ctx.fillStyle = 'rgba(0,232,122,0.06)';
    ctx.beginPath();
    ctx.arc(W - 80, 80, 220, 0, Math.PI * 2);
    ctx.fill();

    // Brand
    ctx.fillStyle = '#00e87a';
    ctx.font = 'bold 26px monospace';
    ctx.fillText('BitByBit', 56, 76);
    ctx.fillStyle = '#666';
    ctx.font = '16px monospace';
    ctx.fillText('TeamCodeLocked', 56, 102);

    // Checkmark badge
    ctx.fillStyle = 'rgba(0,232,122,0.1)';
    ctx.beginPath();
    ctx.arc(W - 100, 130, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#00e87a';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('✓', W - 118, 146);

    // Problem title
    ctx.fillStyle = '#e0e0e0';
    ctx.font = 'bold 44px sans-serif';
    const words = card.title.split(' ');
    let line = '';
    let y = 210;
    const maxWidth = W - 112;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, 56, y);
        line = w;
        y += 54;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, 56, y);

    ctx.fillStyle = '#888';
    ctx.font = '20px monospace';
    ctx.fillText('Solved ✓', 56, y + 46);

    // Stats row
    const statY = H - 130;
    const stats: [string, string][] = [
      [`${card.passed}/${card.total}`, 'tests passed'],
      [LANG_LABELS[card.lang as SupportedLang] || card.lang, 'language'],
      [String(card.points), 'points'],
    ];
    const colW = (W - 112) / 3;
    stats.forEach(([val, label], i) => {
      const x = 56 + i * colW;
      ctx.fillStyle = '#00e87a';
      ctx.font = 'bold 32px monospace';
      ctx.fillText(val, x, statY);
      ctx.fillStyle = '#666';
      ctx.font = '14px monospace';
      ctx.fillText(label.toUpperCase(), x, statY + 26);
    });

    // Footer
    ctx.strokeStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(56, H - 56);
    ctx.lineTo(W - 56, H - 56);
    ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.font = '14px monospace';
    ctx.fillText('bitbybit.dev', 56, H - 30);

    setImgUrl(canvas.toDataURL('image/png'));
  }, [card]);

  async function handleShare() {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'bitbybit-solve.png', { type: 'image/png' });
      const nav: any = navigator;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({
            files: [file],
            title: `Solved "${card.title}" on BitByBit`,
            text: `Just solved "${card.title}" on BitByBit — ${card.passed}/${card.total} tests, ${card.points} pts 🔥`,
          });
        } catch {}
      } else {
        const a = document.createElement('a');
        a.href = imgUrl;
        a.download = 'bitbybit-solve.png';
        a.click();
      }
    }, 'image/png');
  }

  function handleDownload() {
    const a = document.createElement('a');
    a.href = imgUrl;
    a.download = 'bitbybit-solve.png';
    a.click();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1a1a]">
          <h3 className="font-display font-bold text-[#e2e2e2] text-base">🎉 Nice solve!</h3>
          <button onClick={onClose} className="text-[#666] hover:text-[#e0e0e0] transition-colors text-lg">✕</button>
        </div>
        <div className="p-4">
          <canvas ref={canvasRef} className="w-full rounded-xl border border-[#1a1a1a]" />
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <button onClick={handleShare}
            className="flex-1 py-2.5 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-xl hover:bg-[#00ff88] transition-all">
            📤 Share
          </button>
          <button onClick={handleDownload}
            className="flex-1 py-2.5 bg-[#0d0d0d] border border-[#1a1a1a] text-[#e0e0e0] font-mono text-sm rounded-xl hover:border-[#252525] transition-all">
            ⬇ Download
          </button>
        </div>
      </div>
    </div>
  );
}