'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getSupabaseClient } from '@/lib/supabase';
import type { Problem, User } from '@/types/database';
import { LANG_LABELS, type SupportedLang } from '@/types/database';
import { isActiveSubscription } from '@/lib/subscription';
import { getRecommendations, setAiUser } from '@/lib/gemini';

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
  code:          string;
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
      className="flex items-center gap-2 px-3 py-2 bg-zinc-900/60 border border-zinc-800/80
        rounded-xl font-mono text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700
        transition-all duration-150"
    >
      {copied ? (
        <><span className="text-emerald-400">✓</span><span className="text-emerald-400">Link copied</span></>
      ) : (
        <><span>🔗</span><span>Share</span></>
      )}
    </button>
  );
}

export default function ProblemsPage({ user, onNavigate }: ProblemsPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [problems,       setProblems]       = useState<Problem[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [filter,         setFilter]         = useState<string>('all');
  const [accessFilter,   setAccessFilter]   = useState<'all' | 'free' | 'weekly'>('all');
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
  const [viewingCode,       setViewingCode]       = useState<SubmissionRow | null>(null);
  const [shareCard, setShareCard] = useState<{
    title: string; lang: string; passed: number; total: number; points: number;
  } | null>(null);
  const [recommended, setRecommended] = useState<Problem[]>([]);
  const [recLoading,  setRecLoading]  = useState(false);

  useEffect(() => {
    if (!user?.github) {
      setSolved([]);
    } else {
      try {
        const cached = localStorage.getItem('bb_solved');
        if (cached) setSolved(JSON.parse(cached));
      } catch {}
    }

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
        // eslint-disable-next-line
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

  function isWeeklyProblem(p: Problem) {
    return (p as any).visibility === 'weekly' || weeklyIds.has(p.id);
  }

  const afterFilter = (filter === 'all'
    ? problems
    : problems.filter(p => p.difficulty === filter || (p.tags || []).includes(filter))
  ).filter(p =>
    accessFilter === 'all' ? true :
    accessFilter === 'free' ? !isWeeklyProblem(p) :
    isWeeklyProblem(p)
  );

  const searched = search.trim()
    ? afterFilter.filter(p =>
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        (p.tags || []).some((t: string) => t.toLowerCase().includes(search.toLowerCase()))
      )
    : afterFilter;

  // Free problems first, paid (weekly) problems after — within each
  // group the original order is preserved (stable sort).
  const filtered = [...searched].sort((a, b) =>
    Number(isWeeklyProblem(a)) - Number(isWeeklyProblem(b))
  );

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

    // Note: previously auto-opened a shareable solve card here on every
    // first full solve — removed. It was a full-screen modal firing at
    // the exact same moment as the inline difficulty-vote prompt in
    // Workspace.tsx, and it visually covered that prompt, making votes
    // seem broken/invisible. The ShareButton in the page header still
    // lets people generate a card manually if they want one.

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
        // eslint-disable-next-line
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

  // AI recommendations — subscriber-only, based on what they've solved.
  // Reuses the problems list already loaded above instead of re-fetching it.
  useEffect(() => {
    if (!user?.github || !problems.length) { setRecommended([]); return; }
    const db = getSupabaseClient();
    let alive = true;
    (async () => {
      try {
        const { data: sub } = await (db.from('subscribers') as any)
          .select('status, current_period_end').eq('github', user.github).maybeSingle();
        const isSub = isActiveSubscription(sub?.status, sub?.current_period_end);
        setAiUser(user.github, isSub);
        if (!isSub) { if (alive) setRecommended([]); return; }

        const pool = problems.filter(p => !p.is_contest_problem);
        const { data: solvedSubs } = await db.from('submissions').select('problem_title')
          .eq('github', user.github).eq('status', 'approved');
        const solvedTitles = [...new Set((solvedSubs || []).map((s: any) => s.problem_title))];
        const availableTitles = pool.filter(p => !solvedTitles.includes(p.title)).map(p => p.title);
        if (!availableTitles.length) { if (alive) setRecommended([]); return; }

        setRecLoading(true);
        const picks = await getRecommendations(solvedTitles as string[], availableTitles);
        if (!alive) return;
        const matched = picks.map(title => pool.find(p => p.title === title)).filter(Boolean) as Problem[];
        setRecommended(matched);
      } catch {
        if (alive) setRecommended([]);
      }
      if (alive) setRecLoading(false);
    })();
    return () => { alive = false; };
  }, [user?.github, problems]);

  // Keep ?p=<id> in the URL in sync with whichever problem is open, so a
  // link copied while viewing a problem takes anyone straight to it.
  function openProblem(p: Problem) {
    setSelected(p);
    const params = new URLSearchParams(searchParams.toString());
    params.set('p', p.id);
    router.replace(`/problems?${params.toString()}`, { scroll: false });
  }

  function closeProblem() {
    setSelected(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('p');
    const qs = params.toString();
    router.replace(qs ? `/problems?${qs}` : '/problems', { scroll: false });
  }

  // On first load (or once problems finish fetching), open whatever
  // problem the URL points to — this is what makes a shared /problems?p=…
  // link land directly on that problem instead of just the list.
  const appliedUrlProblem = useRef(false);
  useEffect(() => {
    if (appliedUrlProblem.current) return;
    if (problems.length === 0) return;
    const id = searchParams.get('p');
    if (!id) { appliedUrlProblem.current = true; return; }
    const match = problems.find(p => p.id === id);
    if (match) setSelected(match);
    appliedUrlProblem.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problems]);

  function handleRowClick(p: Problem) {
    const isWeekly      = (p as any).visibility === 'weekly' || weeklyIds.has(p.id);
    const isUnlocked    = unlockedIds.has(p.id);
    const isPaidWaiting = paidNotStartedIds.has(p.id);
    const isPaidEnded   = paidEndedIds.has(p.id);
    if (isWeekly && !isUnlocked) {
      if (isPaidEnded) {
        openProblem(p);
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
    openProblem(p);
  }

  async function loadSubmissions() {
    if (!user?.github) return;
    setSubsLoading(true);
    try {
      const db = getSupabaseClient();
      const [{ data: normal }, { data: weekly }] = await Promise.all([
        db
          .from('submissions')
          .select('id, problem_title, lang, status, points_awarded, created_at, review_notes, code')
          .eq('github', user.github)
          .order('created_at', { ascending: false })
          .limit(100),
        (db.from('weekly_submissions') as any)
          .select('id, problem_title, lang, status, points_awarded, submitted_at, review_notes, code')
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
        code:          s.code || '',
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
        code:          s.code || '',
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
        onClose={closeProblem}
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
        <div className="fixed top-20 right-4 z-[200] flex items-center gap-2.5 px-4 py-3 bg-zinc-900 border border-amber-500/30 rounded-xl font-mono text-sm shadow-xl max-w-xs animate-slide-down backdrop-blur-xl">
          <span className="text-lg">🔒</span>
          <div>
            <p className="text-amber-400 font-semibold text-xs">Subscriber-only Problem</p>
            <p className="text-zinc-400 text-[11px] mt-0.5">
              <button onClick={() => { setLockedToast(false); onNavigate('weekly'); }}
                className="text-indigo-400 underline underline-offset-2 hover:text-indigo-300">
                Subscribe ⭐
              </button>
              {' '}to unlock all weekly challenges.
            </p>
          </div>
        </div>
      )}

      {/* Not-started toast — paid but waiting */}
      {notStartedToast && (
        <div className="fixed top-20 right-4 z-[200] flex items-center gap-2.5 px-4 py-3 bg-zinc-900 border border-indigo-500/30 rounded-xl font-mono text-sm shadow-xl max-w-xs animate-slide-down backdrop-blur-xl">
          <span className="text-lg">⏳</span>
          <div>
            <p className="text-indigo-400 font-semibold text-xs">Not Started Yet</p>
            <p className="text-zinc-400 text-[11px] mt-0.5">{notStartedToast}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        {/* Title row */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="font-display font-semibold text-xl md:text-2xl mb-0.5 text-slate-900 dark:text-zinc-100">Problems</h1>
            <p className="text-slate-500 dark:text-zinc-400 text-xs font-mono">
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
              <div className="flex bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-1 gap-1">
                <button
                  onClick={() => handleTabChange('problems')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all
                    ${pageView === 'problems'
                      ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  Problems
                </button>
                <button
                  onClick={() => handleTabChange('submissions')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all
                    ${pageView === 'submissions'
                      ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'}`}
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
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs pointer-events-none">🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search problems or tags…"
              className="w-full bg-zinc-950/40 backdrop-blur-md border border-white/[0.08] rounded-xl pl-8 pr-10 py-2
                text-sm font-mono text-zinc-200 placeholder-zinc-500
                focus:outline-none focus:border-white/[0.18] transition-colors shadow-xs"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
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
                  className={`px-3 py-2 rounded-xl text-xs font-mono font-medium transition-all duration-150 flex items-center gap-1.5 border
                    ${filter === d
                      ? d === 'Easy'   ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-medium'
                      : d === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 font-medium'
                      : d === 'Hard'   ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 font-medium'
                      : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 font-medium shadow-xs'
                      : 'bg-zinc-900/50 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700/80 shadow-xs'}`}>
                  {d === 'all' ? 'All' : d}
                  {count > 0 && (
                    <span className="opacity-60 text-[10px] tabular-nums">{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Free vs Weekly (paid) filter */}
          <div className="flex bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-1 gap-1 shrink-0">
            {([
              { id: 'all',    label: 'All' },
              { id: 'free',   label: '🔓 Free' },
              { id: 'weekly', label: '⭐ Weekly' },
            ] as const).map(opt => (
              <button key={opt.id} onClick={() => setAccessFilter(opt.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all duration-150 whitespace-nowrap
                  ${accessFilter === opt.id
                    ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200 border border-transparent'}`}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Tag filter — dropdown */}
          {allTags.length > 0 && (
            <select
              value={allTags.includes(filter) ? filter : ''}
              onChange={e => setFilter(e.target.value || 'all')}
              className="shrink-0 bg-zinc-900/40 backdrop-blur-md border border-white/[0.08] rounded-xl px-3 py-2
                text-xs font-mono text-zinc-400 focus:outline-none focus:border-white/[0.18] transition-colors
                hover:text-zinc-200 hover:border-white/[0.14] cursor-pointer shadow-xs"
            >
              <option value="" className="bg-zinc-900 text-zinc-400">#tag</option>
              {allTags.map(tag => (
                <option key={tag} value={tag} className="bg-zinc-900 text-zinc-200">#{tag}</option>
              ))}
            </select>
          )}
        </div>
        )}
      </div>

      {pageView === 'problems' && (recLoading || recommended.length > 0) && (
        <div className="mb-6 px-5 py-4 bg-zinc-900/40 backdrop-blur-xl border border-white/[0.06] rounded-2xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm text-indigo-400">✦</span>
            <span className="text-xs font-mono font-medium text-indigo-400 uppercase tracking-wider">Based on your activity</span>
          </div>
          {recLoading ? (
            <div className="flex items-center gap-2 text-zinc-400 font-mono text-xs py-2">
              <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /> Finding problems for you…
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {recommended.map((p) => (
                <button key={p.id} onClick={() => handleRowClick(p)}
                  className="text-left p-3.5 bg-zinc-950/40 border border-white/[0.06] rounded-xl hover:border-indigo-500/30 hover:bg-zinc-900/40 transition-all">
                  <div className="text-xs font-mono font-medium text-zinc-200 truncate mb-1.5">{p.title}</div>
                  <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full border
                    ${p.difficulty === 'Easy' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                      p.difficulty === 'Medium' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                      'text-rose-400 bg-rose-500/10 border-rose-500/20'}`}>
                    {p.difficulty}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {pageView === 'submissions' ? (
        /* ── My Submissions view ─────────────────────────────── */
        subsLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-zinc-400 text-xs font-mono">Loading submissions…</span>
          </div>
        ) : submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="text-3xl opacity-30 text-zinc-500">{'{ }'}</div>
            <div className="text-zinc-400 font-mono text-sm">No submissions yet — go solve something!</div>
          </div>
        ) : (
          <div className="w-full bg-zinc-900/40 backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-white/[0.06] bg-zinc-950/40 text-xs text-zinc-400 font-mono font-semibold uppercase tracking-wider">
                  <th className="py-3.5 pl-6 pr-4">Problem</th>
                  <th className="py-3.5 px-4 w-24">Lang</th>
                  <th className="py-3.5 px-4 w-28">Type</th>
                  <th className="py-3.5 px-4 w-32">Status</th>
                  <th className="py-3.5 px-4 w-24 text-right">Points</th>
                  <th className="py-3.5 pl-4 pr-6 w-36 text-right">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {submissions.map(s => {
                  const statusColor =
                    s.status === 'approved'  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                    s.status === 'rejected'  ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' :
                                               'text-amber-400 bg-amber-500/10 border-amber-500/20';
                  const statusLabel =
                    s.status === 'approved' ? '✓ Approved' :
                    s.status === 'rejected' ? '✗ Rejected' : '⏳ Pending';
                  const date = new Date(s.submitted_at);
                  const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
                  const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

                  return (
                    <tr
                      key={s.id}
                      onClick={() => s.code && setViewingCode(s)}
                      className={`hover:bg-white/[0.03] transition-colors ${s.code ? 'cursor-pointer' : ''}`}
                    >
                      <td className="py-4 pl-6 pr-4">
                        <div className="text-zinc-200 font-mono text-sm font-medium flex items-center gap-2">
                          <span className="truncate">{s.problem_title}</span>
                          {s.code && <span className="text-xs text-indigo-400 shrink-0 font-mono" title="View submitted code">{'</>'}</span>}
                        </div>
                        {s.status === 'rejected' && s.review_notes && (
                          <div className="text-xs text-rose-400/80 font-mono mt-0.5">{s.review_notes}</div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-xs font-mono text-zinc-300">
                        {s.lang}
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
                          s.type === 'weekly'
                            ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
                            : 'text-zinc-400 bg-white/[0.04] border-white/[0.06]'
                        }`}>
                          {s.type === 'weekly' ? 'Weekly' : 'Normal'}
                        </span>
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className={`text-xs font-mono font-medium px-2.5 py-0.5 rounded-full border ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right text-sm font-mono font-semibold text-indigo-400 whitespace-nowrap">
                        {s.status === 'approved' ? `${s.points_awarded}` : '—'}
                      </td>
                      <td className="py-4 pl-4 pr-6 text-right whitespace-nowrap">
                        <div className="text-zinc-300 text-xs font-mono">{dateStr}</div>
                        <div className="text-zinc-500 text-[11px] font-mono">{timeStr}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="md:hidden space-y-2 w-full animate-pulse">
            {[1, 2, 3, 4, 5, 6].map(k => (
              <div key={k} className="px-4 py-3.5 bg-zinc-900/50 border border-zinc-800/80 rounded-xl flex items-center gap-3">
                <div className="w-5 h-4 bg-zinc-800 rounded" />
                <div className="flex-1 space-y-2">
                  <div className="w-2/3 h-4 bg-zinc-800 rounded" />
                  <div className="flex gap-2">
                    <div className="w-12 h-3 bg-zinc-800/60 rounded" />
                    <div className="w-10 h-3 bg-zinc-800/60 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block w-full bg-zinc-900/50 border border-zinc-800/80 rounded-2xl overflow-hidden animate-pulse">
            <div className="grid grid-cols-[2.5rem_1fr_7rem_5rem_6rem_6rem] gap-4 px-5 py-3 border-b border-zinc-800/80 text-[10px] text-zinc-500 font-mono uppercase tracking-widest bg-zinc-950/60">
              <div>#</div>
              <div>Title</div>
              <div>Difficulty</div>
              <div>Points</div>
              <div>Attempts</div>
              <div>Status</div>
            </div>
            {[1, 2, 3, 4, 5, 6, 7, 8].map(k => (
              <div key={k} className="grid grid-cols-[2.5rem_1fr_7rem_5rem_6rem_6rem] gap-4 px-5 py-4 border-b border-zinc-800/60 last:border-0 items-center">
                <div className="w-4 h-4 bg-zinc-800 rounded" />
                <div className="w-2/5 h-4 bg-zinc-800 rounded" />
                <div className="w-14 h-5 bg-zinc-800/60 rounded-lg" />
                <div className="w-10 h-4 bg-zinc-800/60 rounded" />
                <div className="w-12 h-4 bg-zinc-800/60 rounded" />
                <div className="w-16 h-5 bg-zinc-800/60 rounded-lg" />
              </div>
            ))}
          </div>

        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="text-3xl opacity-30 text-zinc-500">{ '{  }' }</div>
          <div className="text-zinc-400 font-mono text-sm">
            {problems.length === 0 ? 'No problems yet — check back soon!' : 'Nothing matches this filter.'}
          </div>
        </div>
      ) : (
        <>
          {/* Enterprise-grade Problems Table */}
          <div className="w-full bg-zinc-900/40 backdrop-blur-xl border border-white/[0.06] rounded-2xl overflow-hidden shadow-none overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-white/[0.06] bg-zinc-950/40 text-xs text-zinc-400 font-mono font-semibold uppercase tracking-wider">
                  <th className="py-3.5 pl-6 pr-3 w-12 text-center">#</th>
                  <th className="py-3.5 px-4">Title</th>
                  <th className="py-3.5 px-4 w-32">Difficulty</th>
                  <th className="py-3.5 px-4 w-24 text-right">Points</th>
                  <th className="py-3.5 px-4 w-28 text-center">Attempts</th>
                  <th className="py-3.5 pl-4 pr-6 w-32 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map((p, i) => {
                  const isSolved   = solved.includes(p.id);
                  const isWeekly   = (p as any).visibility === 'weekly' || weeklyIds.has(p.id);
                  const isUnlocked = unlockedIds.has(p.id);
                  const isPaidEndedP = paidEndedIds.has(p.id);
                  const isLocked   = isWeekly && !isUnlocked && !isPaidEndedP;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => handleRowClick(p)}
                      className={`cursor-pointer transition-colors duration-150 group ${
                        isLocked
                          ? 'hover:bg-amber-500/5 opacity-75'
                          : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <td className="py-4 pl-6 pr-3 text-center text-sm font-mono text-zinc-500 font-medium">
                        {i + 1}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`font-mono text-[15px] transition-colors ${
                            isLocked
                              ? 'text-zinc-400 group-hover:text-amber-400'
                              : 'text-zinc-100 group-hover:text-indigo-300 font-medium'
                          }`}>
                            {p.title}
                          </span>
                          {isLocked && (
                            <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 font-medium">
                              🔒 Weekly
                            </span>
                          )}
                          {isPaidEndedP && !isSolved && (
                            <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20 font-medium">
                              🏁 Practice
                            </span>
                          )}
                        </div>
                        {p.tags && p.tags.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap">
                            {p.tags.map(t => (
                              <span key={t} className="text-xs text-zinc-400 bg-zinc-800/60 px-2 py-0.5 rounded-md font-mono border border-zinc-700/60">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-full border inline-block ${
                          p.difficulty === 'Easy' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                          p.difficulty === 'Medium' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                          'text-rose-400 bg-rose-500/10 border-rose-500/20'
                        }`}>
                          {p.difficulty}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <span className="text-indigo-400 text-sm font-mono font-semibold">
                          {p.points}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        <span className="text-zinc-300 text-sm font-mono">
                          {attemptCounts[p.id] || 0}
                        </span>
                      </td>
                      <td className="py-4 pl-4 pr-6 text-right whitespace-nowrap">
                        {isSolved ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-400 text-sm font-mono font-semibold">
                            <span>✓</span> Solved
                          </span>
                        ) : isLocked ? (
                          <span className="text-amber-400 text-sm font-mono font-medium group-hover:text-amber-300 transition-colors">
                            Unlock →
                          </span>
                        ) : isPaidEndedP ? (
                          <span className="text-indigo-400 text-sm font-mono font-medium group-hover:text-indigo-300 transition-colors">
                            Practice →
                          </span>
                        ) : (
                          <span className="text-zinc-400 text-sm font-mono group-hover:text-zinc-200 transition-colors font-medium">
                            Solve →
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {shareCard && (
        <ShareCardModal card={shareCard} onClose={() => setShareCard(null)} />
      )}
      {viewingCode && (
        <SubmittedCodeModal submission={viewingCode} onClose={() => setViewingCode(null)} />
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

function SubmittedCodeModal({ submission, onClose }: { submission: SubmissionRow; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const date = new Date(submission.submitted_at);
  const statusColor =
    submission.status === 'approved' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
    submission.status === 'rejected' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' :
                                        'text-amber-400 bg-amber-500/10 border-amber-500/20';
  const statusLabel =
    submission.status === 'approved' ? '✓ Approved' :
    submission.status === 'rejected' ? '✗ Rejected' : '⏳ Pending';

  function copyCode() {
    navigator.clipboard?.writeText(submission.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-slide-down">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-sm text-zinc-100 truncate">{submission.problem_title}</h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${statusColor}`}>{statusLabel}</span>
              <span className="text-[10px] font-mono text-zinc-400">{submission.lang}</span>
              <span className="text-[10px] font-mono text-zinc-500">
                {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })} · {date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
              {submission.status === 'approved' && (
                <span className="text-[10px] font-mono text-indigo-400 font-semibold">{submission.points_awarded} pts</span>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors">
            ✕
          </button>
        </div>

        {submission.status === 'rejected' && submission.review_notes && (
          <div className="px-5 py-2.5 bg-rose-500/10 border-b border-rose-500/20 text-xs font-mono text-rose-400 shrink-0">
            {submission.review_notes}
          </div>
        )}

        <pre className="flex-1 overflow-auto px-5 py-4 text-xs font-mono text-zinc-200 leading-relaxed bg-zinc-950">
          {submission.code || '// No code recorded for this submission.'}
        </pre>

        <div className="px-5 py-3 border-t border-zinc-800 shrink-0 flex justify-end">
          <button onClick={copyCode}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg font-mono text-xs text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 transition-all">
            {copied ? (<><span className="text-emerald-400">✓</span><span className="text-emerald-400">Copied</span></>) : (<><span>📋</span><span>Copy code</span></>)}
          </button>
        </div>
      </div>
    </div>
  );
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
    bg.addColorStop(0, '#09090b');
    bg.addColorStop(1, '#18181b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Border
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // Subtle ambient accent
    ctx.fillStyle = 'rgba(99,102,241,0.06)';
    ctx.beginPath();
    ctx.arc(W - 80, 80, 220, 0, Math.PI * 2);
    ctx.fill();

    // Brand
    ctx.fillStyle = '#6366f1';
    ctx.font = 'bold 26px monospace';
    ctx.fillText('BitByBit', 56, 76);
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '16px monospace';
    ctx.fillText('TeamCodeLocked', 56, 102);

    // Checkmark badge
    ctx.fillStyle = 'rgba(16,185,129,0.12)';
    ctx.beginPath();
    ctx.arc(W - 100, 130, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('✓', W - 118, 146);

    // Problem title
    ctx.fillStyle = '#f4f4f5';
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

    ctx.fillStyle = '#a1a1aa';
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
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 32px monospace';
      ctx.fillText(val, x, statY);
      ctx.fillStyle = '#71717a';
      ctx.font = '14px monospace';
      ctx.fillText(label.toUpperCase(), x, statY + 26);
    });

    // Footer
    ctx.strokeStyle = '#27272a';
    ctx.beginPath();
    ctx.moveTo(56, H - 56);
    ctx.lineTo(W - 56, H - 56);
    ctx.stroke();
    ctx.fillStyle = '#71717a';
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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-slide-down">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h3 className="font-display font-semibold text-zinc-100 text-base">🎉 Nice solve!</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200 transition-colors text-lg">✕</button>
        </div>
        <div className="p-4">
          <canvas ref={canvasRef} className="w-full rounded-xl border border-zinc-800"/>
        </div>
        <div className="flex gap-2.5 px-4 pb-4">
          <button onClick={handleShare}
            className="flex-1 py-2 bg-indigo-600 text-white font-mono font-medium text-xs rounded-lg hover:bg-indigo-500 transition-all shadow-sm">
            📤 Share
          </button>
          <button onClick={handleDownload}
            className="flex-1 py-2 bg-zinc-800 border border-zinc-700 text-zinc-200 font-mono text-xs rounded-lg hover:bg-zinc-700/80 transition-all">
            ⬇ Download
          </button>
        </div>
      </div>
    </div>
  );
}
