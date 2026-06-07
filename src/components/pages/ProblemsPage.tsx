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

export default function ProblemsPage({ user, onNavigate }: ProblemsPageProps) {
  const [problems,       setProblems]       = useState<Problem[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [filter,         setFilter]         = useState<string>('all');
  const [selected,       setSelected]       = useState<Problem | null>(null);
  const [solved,         setSolved]         = useState<string[]>([]);
  const [weeklyIds,      setWeeklyIds]      = useState<Set<string>>(new Set());
  const [lockedToast,       setLockedToast]       = useState(false);
  const [notStartedToast,   setNotStartedToast]   = useState<string>('');
  const [unlockedIds,       setUnlockedIds]       = useState<Set<string>>(new Set());
  const [paidNotStartedIds, setPaidNotStartedIds] = useState<Set<string>>(new Set());
  const [paidEndedIds,      setPaidEndedIds]      = useState<Set<string>>(new Set());

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
    }

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

        // Load weekly challenge problem IDs that are currently active or upcoming
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: challenges } = await (db.from('weekly_challenges') as any)
          .select('id, problem_ids, starts_at, ends_at')
          .neq('status', 'ended')
          .order('created_at', { ascending: false });

        const allWeeklyIds = new Set<string>();
        (challenges || []).forEach((ch: any) => {
          (ch.problem_ids || []).forEach((id: string) => allWeeklyIds.add(id));
        });
        setWeeklyIds(allWeeklyIds);

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
              const ended   = new Date(ch.ends_at).getTime()   <  now;
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

  const filtered = filter === 'all'
    ? problems
    : problems.filter(p => p.difficulty === filter || (p.tags || []).includes(filter));

  function handleSolved(problemId: string) {
    setSolved(prev => {
      if (prev.includes(problemId)) return prev;
      const next = [...prev, problemId];
      try { localStorage.setItem('bb_solved', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function handleRowClick(p: Problem) {
    const isWeekly      = (p as any).visibility === 'weekly' || weeklyIds.has(p.id);
    const isUnlocked    = unlockedIds.has(p.id);
    const isPaidWaiting = paidNotStartedIds.has(p.id);
    const isPaidEnded   = paidEndedIds.has(p.id);
    if (isWeekly && !isUnlocked) {
      if (isPaidEnded) {
        setNotStartedToast('This weekly challenge has ended.');
      } else if (isPaidWaiting) {
        setNotStartedToast('Challenge hasn\'t started yet — come back when it does!');
      } else {
        setLockedToast(true);
        setTimeout(() => setLockedToast(false), 3500);
      }
      if (isPaidEnded || isPaidWaiting) setTimeout(() => setNotStartedToast(''), 3500);
      return;
    }
    setSelected(p);
  }

  if (selected) {
    const isSelectedWeekly = (selected as any).visibility === 'weekly' || weeklyIds.has(selected.id);
    return (
      <Workspace
        problem={selected}
        user={user}
        onClose={() => setSelected(null)}
        onSolved={handleSolved}
        isWeekly={isSelectedWeekly}
      />
    );
  }

  return (
    <div className="animate-fade-up">

      {/* Locked toast — unpaid */}
      {lockedToast && (
        <div className="fixed top-20 right-4 z-[200] flex items-center gap-2.5 px-4 py-3 bg-[#1a1a1a] border border-[#f0b42940] rounded-xl font-mono text-sm shadow-xl max-w-xs animate-fade-up">
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
        <div className="fixed top-20 right-4 z-[200] flex items-center gap-2.5 px-4 py-3 bg-[#1a1a1a] border border-[#a78bfa40] rounded-xl font-mono text-sm shadow-xl max-w-xs animate-fade-up">
          <span className="text-lg">⏳</span>
          <div>
            <p className="text-[#a78bfa] font-bold text-xs">Not Started Yet</p>
            <p className="text-[#aaa] text-[10px] mt-0.5">{notStartedToast}</p>
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-xl md:text-2xl mb-0.5">Problems</h1>
          <p className="text-[#999] text-xs font-mono">
            {problems.length > 0 ? `${problems.length} problems available` : 'Loading…'}
          </p>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {DIFFICULTIES.map(d => (
            <button key={d} onClick={() => setFilter(d)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-medium transition-all duration-150
                ${filter === d
                  ? d === 'Easy'   ? 'bg-[#00e87a18] text-[#00e87a] border border-[#00e87a30]'
                  : d === 'Medium' ? 'bg-[#f0b42918] text-[#f0b429] border border-[#f0b42930]'
                  : d === 'Hard'   ? 'bg-[#ff4d4d18] text-[#ff4d4d] border border-[#ff4d4d30]'
                  : 'bg-[#00e87a18] text-[#00e87a] border border-[#00e87a30]'
                  : 'bg-[#111] border border-[#1f1f1f] text-[#aaa] hover:text-[#e0e0e0] hover:border-[#2a2a2a]'}`}>
              {d === 'all' ? 'All' : d}
            </button>
          ))}
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
              const isLocked   = isWeekly && !isUnlocked;

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
          <div className="hidden md:block card overflow-hidden">
            <div className="grid grid-cols-[2.5rem_1fr_7rem_5rem_6rem_6rem] gap-4 px-5 py-3
              border-b border-[#1a1a1a] text-[10px] text-[#999] font-mono uppercase tracking-widest">
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
              const isLocked   = isWeekly && !isUnlocked;

              return (
                <div key={p.id} onClick={() => handleRowClick(p)}
                  className={`grid grid-cols-[2.5rem_1fr_7rem_5rem_6rem_6rem] gap-4 px-5 py-4
                    border-b border-[#161616] last:border-0 cursor-pointer
                    transition-all duration-150 group items-center
                    ${isLocked
                      ? 'hover:bg-[#f0b42906] opacity-80'
                      : 'hover:bg-[#161616]'}`}>

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
                  <div className="text-[#999] text-sm font-mono">{p.submission_count || 0}</div>

                  <div>
                    {isSolved ? (
                      <span className="inline-flex items-center gap-1 text-[#00e87a] text-xs font-mono font-bold">
                        <span>✓</span> Solved
                      </span>
                    ) : isLocked ? (
                      <span className="text-[#f0b429] text-xs font-mono group-hover:text-[#f0b429] transition-colors">
                        Pay to unlock →
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