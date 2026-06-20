'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { getSupabaseClient } from '@/lib/supabase';
import type { Problem, User } from '@/types/database';

const Workspace = dynamic(() => import('@/app/problems/Workspace'), { ssr: false });

const DIFFICULTIES = ['all', 'Easy', 'Medium', 'Hard'] as const;

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

        // If user is logged in, check which weekly challenges they have confirmed access to
        if (user?.github && challenges?.length) {
          const challengeIds = (challenges || []).map((ch: any) => ch.id);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: access } = await (db.from('weekly_access') as any)
            .select('weekly_challenge_id')
            .eq('github', user.github)
            .eq('status', 'confirmed')
            .in('weekly_challenge_id', challengeIds);

          if (access?.length) {
            const confirmedChallengeIds = new Set((access as any[]).map(a => a.weekly_challenge_id));
            const now = Date.now();
            const unlocked       = new Set<string>();
            const paidNotStarted = new Set<string>();
            const paidEnded      = new Set<string>();
            (challenges || []).forEach((ch: any) => {
              const started = new Date(ch.starts_at).getTime() <= now;
              const ended   = ch.status === 'ended' || new Date(ch.ends_at).getTime() < now;
              if (confirmedChallengeIds.has(ch.id)) {
                if (started && !ended) {
                  (ch.problem_ids || []).forEach((id: string) => unlocked.add(id));
                } else if (!started) {
                  (ch.problem_ids || []).forEach((id: string) => paidNotStarted.add(id));
                } else if (ended) {
                  (ch.problem_ids || []).forEach((id: string) => paidEnded.add(id));
                }
              }
            });
            setUnlockedIds(unlocked);
            setPaidNotStartedIds(paidNotStarted);
            setPaidEndedIds(paidEnded);
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
    setSolved(prev => {
      if (prev.includes(problemId)) return prev;
      const next = [...prev, problemId];
      try { localStorage.setItem('bb_solved', JSON.stringify(next)); } catch {}
      return next;
    });

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

  function handleRowClick(p: Problem) {
    const isWeekly      = (p as any).visibility === 'weekly' || weeklyIds.has(p.id);
    const isUnlocked    = unlockedIds.has(p.id);
    const isPaidWaiting = paidNotStartedIds.has(p.id);
    const isPaidEnded   = paidEndedIds.has(p.id);
    if (isWeekly && !isUnlocked) {
      if (isPaidEnded) {
        // Challenge ended for a paid user — allow practice mode (no points)
        setSelected(p);
        return;
      } else if (isPaidWaiting) {
        setNotStartedToast('Challenge hasn\'t started yet — come back when it does!');
      } else {
        setLockedToast(true);
        setTimeout(() => setLockedToast(false), 3500);
      }
      if (isPaidWaiting) setTimeout(() => setNotStartedToast(''), 3500);
      return;
    }
    setSelected(p);
  }

  if (selected) {
    const isSelectedWeekly = weeklyIds.has(selected.id) || (selected as any).visibility === 'weekly';
    const isPracticeMode = isSelectedWeekly && paidEndedIds.has(selected.id);
    return (
      <Workspace
        problem={selected}
        user={user}
        onClose={() => setSelected(null)}
        onSolved={handleSolved}
        isWeekly={isSelectedWeekly && !isPracticeMode}
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
            <p className="text-[#f0b429] font-bold text-xs">Weekly Challenge Problem</p>
            <p className="text-[#aaa] text-[10px] mt-0.5">
              Pay to unlock in the{' '}
              <button onClick={() => { setLockedToast(false); onNavigate('weekly'); }}
                className="text-[#00e87a] underline underline-offset-2 hover:text-[#00ff88]">
                Weekly tab
              </button>
              .
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
              {filtered.length !== problems.length
                ? `${filtered.length} of ${problems.length} problems`
                : `${problems.length} problems`}
            </p>
          </div>
          {/* Share button — contextual, not floating */}
          <ShareButton />
        </div>

        {/* Search + filters row */}
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
      </div>

      {loading ? (
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
    </div>
  );
}