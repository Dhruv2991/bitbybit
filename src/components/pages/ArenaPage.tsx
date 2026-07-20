'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic                          from 'next/dynamic';
import { getSupabaseClient }            from '@/lib/supabase';
import ContestEntryButton               from '@/components/arena/ContestEntryButton';
import { isActiveSubscription } from '@/lib/subscription';
import type { Contest, ContestRegistration, Problem, User } from '@/types/database';

const Workspace = dynamic(() => import('@/app/problems/Workspace'), { ssr: false });

interface ArenaPageProps {
  user:              User | null;
  onArenaLockChange: (locked: boolean) => void;
  onNavigate?:       (page: string) => void;
}

type ContestOutcome = 'submitted' | 'disqualified';

export default function ArenaPage({ user, onArenaLockChange, onNavigate }: ArenaPageProps) {
  const db = getSupabaseClient();
  const [contests,      setContests]      = useState<Contest[]>([]);
  const [userRegs,      setUserRegs]      = useState<ContestRegistration[]>([]);
  const [isSubscriber,  setIsSubscriber]  = useState(false);
  const [arenaProblems, setArenaProblems] = useState<Record<string, Problem>>({});
  const [contestOutcomes, setContestOutcomes] = useState<Map<string, ContestOutcome>>(new Map());
  const [loading,       setLoading]       = useState(true);
  const [toast,         setToast]         = useState<{ msg: string; type: 'ok' | 'err' | 'info' | 'warn' } | null>(null);
  const [activeContest, setActiveContest] = useState<Contest | null>(null);
  const [activeProblem, setActiveProblem] = useState<Problem | null>(null);
  const [problemIndex,  setProblemIndex]  = useState(0);
  const [strikes,       setStrikes]       = useState(0);
  const [timeLeft,      setTimeLeft]      = useState(0);
  const [solved,        setSolved]        = useState<Set<string>>(new Set());
  const [resultsContest, setResultsContest] = useState<Contest | null>(null);
  const [rulesContest,   setRulesContest]   = useState<Contest | null>(null);
  const [feedbackContest, setFeedbackContest] = useState<{ contest: Contest; outcome: ContestOutcome } | null>(null);
  const submittedProblemIds = useRef<Set<string>>(new Set());
  const timerRef   = useRef<NodeJS.Timeout | null>(null);
  const visHandler = useRef<(() => void) | null>(null);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);
  const activeContestRef = useRef<Contest | null>(null);
  const activeProblemRef = useRef<Problem | null>(null);
  const strikesRef       = useRef<number>(0);
  const timeLeftRef      = useRef<number>(0);
  const userRef          = useRef<User | null>(null);

  useEffect(() => { activeContestRef.current = activeContest; }, [activeContest]);
  useEffect(() => { activeProblemRef.current = activeProblem; }, [activeProblem]);
  useEffect(() => { strikesRef.current       = strikes;       }, [strikes]);
  useEffect(() => { timeLeftRef.current      = timeLeft;      }, [timeLeft]);
  useEffect(() => { userRef.current          = user;          }, [user]);

  const [countdowns, setCountdowns] = useState<Record<string, number>>({});
  const [showFsOverlay, setShowFsOverlay] = useState(false);

  useEffect(() => { loadContests(); }, [user]);

  useEffect(() => {
    const channel = db
      .channel('arena-contests-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contests' }, () => loadContests())
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [user]);

  // Tick every second for upcoming confirmed contests that have a starts_at
  useEffect(() => {
    const upcomingConfirmed = contests.filter(ct => {
      if (ct.status !== 'upcoming' || !(ct as any).starts_at) return false;
      const reg = userRegs.find(r => r.contest_id === ct.id);
      return reg?.status === 'confirmed';
    });

    if (upcomingConfirmed.length === 0) {
      setCountdowns({});
      return;
    }

    function tick() {
      const now = Date.now();
      const next: Record<string, number> = {};
      for (const ct of upcomingConfirmed) {
        const diff = Math.max(0, Math.floor((new Date((ct as any).starts_at).getTime() - now) / 1000));
        next[ct.id] = diff;
        // When countdown hits 0, refresh contest list so status flips to live
        if (diff === 0) loadContests();
      }
      setCountdowns(next);
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [contests, userRegs]);

  async function loadContests() {
    setLoading(true);
    try {
      const [{ data: c }, { data: r }, { data: arenaSubs }, { data: sub }] = await Promise.all([
        db.from('contests').select('*').order('created_at', { ascending: false }),
        user
          ? db.from('contest_registrations').select('*').eq('github', user.github)
          : Promise.resolve({ data: [] }),
        user
          ? db.from('arena_submissions').select('contest_id, status').eq('github', user.github)
          : Promise.resolve({ data: [] }),
        user
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? (db.from('subscribers') as any).select('status, current_period_end').eq('github', user.github).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const contestList = (c || []) as Contest[];
      setContests(contestList);
      setUserRegs((r as ContestRegistration[]) || []);
      setIsSubscriber(isActiveSubscription(
        (sub as { status?: string; current_period_end?: string } | null)?.status,
        (sub as { status?: string; current_period_end?: string } | null)?.current_period_end,
      ));

      const outcomes = new Map<string, ContestOutcome>();
      for (const row of (arenaSubs || []) as { contest_id: string; status: string }[]) {
        if (!row.contest_id) continue;
        if (outcomes.get(row.contest_id) !== 'disqualified') {
          outcomes.set(row.contest_id, row.status === 'disqualified' ? 'disqualified' : 'submitted');
        }
      }
      setContestOutcomes(outcomes);

      const allIds = new Set<string>();
      contestList.filter(ct => ct.status === 'live').forEach(ct => {
        if (ct.problem_id) allIds.add(ct.problem_id);
        (ct.problem_ids || []).forEach((id: string) => allIds.add(id));
      });
      if (allIds.size) {
        const { data: probs } = await db.from('problems').select('*').in('id', Array.from(allIds));
        const map: Record<string, Problem> = {};
        (probs || []).forEach((p: Problem) => { map[p.id] = p; });
        setArenaProblems(map);
      }
    } catch {}
    setLoading(false);
  }

  function getContestProblemIds(ct: Contest): string[] {
    const ids = [...(ct.problem_ids || [])];
    if (ct.problem_id && !ids.includes(ct.problem_id)) ids.unshift(ct.problem_id);
    return ids;
  }

  function showToast(msg: string, type: 'ok' | 'err' | 'info' | 'warn' = 'info') {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }

  async function startContest(contest: Contest) {
    if (!user) { showToast('Sign in to enter the contest.', 'err'); return; }
    if (contestOutcomes.has(contest.id)) {
      showToast('You have already entered this contest.', 'warn');
      return;
    }

    // Gate: must have a confirmed registration
    const reg = userRegs.find(r => r.contest_id === contest.id);
    if (!reg || reg.status !== 'confirmed') {
      showToast('Your registration is not confirmed yet. Wait for admin approval.', 'warn');
      return;
    }

    // Show rules & format first — the real entry happens once the user confirms
    setRulesContest(contest);
  }

  async function enterContestNow(contest: Contest) {
    setRulesContest(null);
    try { await document.documentElement.requestFullscreen?.(); } catch {}

    const ids = getContestProblemIds(contest);
    const firstProblem = ids.length ? arenaProblems[ids[0]] || null : null;

    submittedProblemIds.current = new Set();
    setActiveContest(contest);
    setActiveProblem(firstProblem);
    setProblemIndex(0);
    setStrikes(0);
    setSolved(new Set());
    setTimeLeft(contest.duration_mins * 60);
    onArenaLockChange(true);

    // Use a single flag to prevent double-strike when fullscreen exit
    // also triggers visibilitychange simultaneously
    let fsJustChanged = false;

    const fsHandler = () => {
      if (!document.fullscreenElement) {
        fsJustChanged = true;
        setTimeout(() => { fsJustChanged = false; }, 200);
        setShowFsOverlay(true); // Show blocking overlay
        setStrikes(s => {
          const next = s + 1;
          if (next >= 3) endContest('disqualified');
          return next;
        });
      } else {
        // User re-entered fullscreen — hide overlay
        setShowFsOverlay(false);
      }
    };
    document.addEventListener('fullscreenchange', fsHandler);
    (visHandler as any).fsHandler = fsHandler;

    visHandler.current = () => {
      if (document.hidden && !fsJustChanged) {
        setStrikes(s => {
          const next = s + 1;
          showToast(`⚠ Tab switch detected! ${next}/3 warnings.`, 'warn');
          if (next >= 3) endContest('disqualified');
          return next;
        });
      }
    };
    document.addEventListener('visibilitychange', visHandler.current);

    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { recordTimerExpirySub(); endContest('submitted'); return 0; }
        if (t === 300) showToast('⏰ 5 minutes remaining!', 'warn');
        if (t === 60)  showToast('⏰ 1 minute remaining!', 'err');
        return t - 1;
      });
    }, 1000);
  }

  function recordTimerExpirySub() {
    const contest = activeContestRef.current;
    const problem = activeProblemRef.current;
    const u       = userRef.current;
    if (!contest || !problem || !u) return;
    if (submittedProblemIds.current.has(problem.id)) return;
    submittedProblemIds.current.add(problem.id);
    const elapsed    = contest.duration_mins * 60 - timeLeftRef.current;
    const timeFactor = Math.max(0.5, 1 - (elapsed / (contest.duration_mins * 60)) * 0.5);
    ;(db.from('arena_submissions') as any).insert([{
      contest_id: contest.id, contest_name: contest.name,
      problem_id: problem.id, problem_title: problem.title,
      github: u.github, name: u.name,
      lang: 'unknown', code: '-- Time expired before submission --',
      strikes: strikesRef.current, status: 'submitted',
      strike_penalty_factor: timeFactor, points_awarded: 0,
    }]).then(({ error }: { error: any }) => {
      if (error) console.error('Timer expiry sub failed:', error.message);
    });
  }

  function switchProblem(contest: Contest, idx: number) {
    const ids = getContestProblemIds(contest);
    if (idx < 0 || idx >= ids.length) return;
    setProblemIndex(idx);
    setActiveProblem(arenaProblems[ids[idx]] || null);
  }

  // Tracks the latest code+lang the user has typed (debounced from Workspace)
  const currentCodeRef = useRef<{ code: string; lang: string }>({ code: '', lang: 'python' });

  function handleArenaCodeChange(code: string, lang: string) {
    currentCodeRef.current = { code, lang };
  }

  function endContest(status: 'submitted' | 'disqualified') {
    if (timerRef.current)   clearInterval(timerRef.current);
    if (visHandler.current) {
      document.removeEventListener('visibilitychange', visHandler.current);
      if ((visHandler as any).fsHandler)
        document.removeEventListener('fullscreenchange', (visHandler as any).fsHandler);
    }

    const contest = activeContestRef.current;
    const problem = activeProblemRef.current;
    const u       = userRef.current;

    if (contest) {
      setContestOutcomes(prev => {
        const next = new Map(prev);
        if (next.get(contest.id) !== 'disqualified') next.set(contest.id, status);
        return next;
      });
    }

    // If the user hits "Submit & Exit" while still on an unsolved problem,
    // snapshot whatever code they've typed so admin can review it.
    if (status === 'submitted' && contest && problem && u &&
        !submittedProblemIds.current.has(problem.id)) {
      submittedProblemIds.current.add(problem.id);
      const elapsed      = contest.duration_mins * 60 - timeLeftRef.current;
      const timeFactor   = Math.max(0.5, 1 - (elapsed / (contest.duration_mins * 60)) * 0.5);
      const strikePenalty = Math.max(0.7, 1 - strikesRef.current * 0.1);
      const { code, lang } = currentCodeRef.current;
      ;(db.from('arena_submissions') as any).upsert([{
        contest_id:            contest.id,
        contest_name:          contest.name,
        problem_id:            problem.id,
        problem_title:         problem.title,
        github:                u.github,
        name:                  u.name,
        lang:                  lang || 'unknown',
        code:                  code || '-- No code submitted --',
        strikes:               strikesRef.current,
        status:                'submitted',
        strike_penalty_factor: timeFactor * strikePenalty,
        tests_passed:          0,
        tests_total:           0,
        points_awarded:        0,
      }], { onConflict: 'contest_id,problem_id,github' }).then(({ error }: { error: any }) => {
        if (error) console.error('Exit snapshot failed:', error.message);
      });
    }

    if (status === 'disqualified' && contest && u) {
      ;(db.from('arena_submissions') as any).insert([{
        contest_id: contest.id, contest_name: contest.name,
        problem_id: problem?.id || null, problem_title: problem?.title || '',
        github: u.github, name: u.name,
        lang: 'unknown', code: '',
        strikes: strikesRef.current, status: 'disqualified',
        strike_penalty_factor: 0, points_awarded: 0,
      }]).then(({ error }: { error: any }) => {
        if (error) console.error('Failed to record disqualification:', error.message);
      });
    }

    setActiveContest(null);
    setActiveProblem(null);
    setSolved(new Set());
    submittedProblemIds.current = new Set();
    currentCodeRef.current = { code: '', lang: 'python' };
    setShowFsOverlay(false);
    onArenaLockChange(false);
    // Clear all arena drafts for this contest
    if (contest) {
      try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(`bb_arena_draft__${contest.id}__`));
        keys.forEach(k => localStorage.removeItem(k));
      } catch {}
    }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    showToast(
      status === 'disqualified'
        ? '❌ Disqualified — too many tab-switch violations.'
        : '✅ Contest submitted. Good work!',
      status === 'disqualified' ? 'err' : 'ok',
    );

    if (contest) setFeedbackContest({ contest, outcome: status });
  }

  async function handleArenaSubmit(code: string, lang: string, passed: number = 0, total: number = 0) {
    const contest = activeContestRef.current;
    const problem = activeProblemRef.current;
    const u       = userRef.current;
    if (!contest || !problem || !u) return;

    const elapsed    = contest.duration_mins * 60 - timeLeftRef.current;
    const timeFactor = Math.max(0.5, 1 - (elapsed / (contest.duration_mins * 60)) * 0.5);

    // Strike penalty: each strike reduces points by 10%
    const strikePenalty = Math.max(0.7, 1 - strikesRef.current * 0.1);

    // Points = basePts × (testsPassed/testsTotal) × timeFactor × strikePenalty
    const basePts     = problem.points || 200;
    const testRatio   = total > 0 ? passed / total : 1; // if no test cases, full marks
    const finalPoints = Math.round(basePts * testRatio * timeFactor * strikePenalty);

    // Mark as submitted — allow resubmission (upsert keeps latest)
    submittedProblemIds.current.add(problem.id);

    try {
      await (db.from('arena_submissions') as any).upsert([{
        contest_id:            contest.id,
        contest_name:          contest.name,
        problem_id:            problem.id,
        problem_title:         problem.title,
        github:                u.github,
        name:                  u.name,
        lang,
        code,
        strikes:               strikesRef.current,
        status:                'submitted',
        strike_penalty_factor: timeFactor * strikePenalty,
        tests_passed:          passed,
        tests_total:           total,
        points_awarded:        finalPoints,
      }], { onConflict: 'contest_id,problem_id,github' });
    } catch (e: any) {
      submittedProblemIds.current.delete(problem.id);
      console.error('Arena submit failed:', e.message);
    }
  }

  async function handleProblemClose() {
    const contest = activeContestRef.current;
    const problem = activeProblemRef.current;
    const u       = userRef.current;
    if (!contest) return;

    // Snapshot current code for the problem being closed, if not yet submitted
    if (problem && u && !submittedProblemIds.current.has(problem.id)) {
      submittedProblemIds.current.add(problem.id);
      const elapsed      = contest.duration_mins * 60 - timeLeftRef.current;
      const timeFactor   = Math.max(0.5, 1 - (elapsed / (contest.duration_mins * 60)) * 0.5);
      const strikePenalty = Math.max(0.7, 1 - strikesRef.current * 0.1);
      const { code, lang } = currentCodeRef.current;
      // Auto-snapshot: 0 tests passed (user didn't submit manually)
      // Admin can still review code and award points manually
      ;(db.from('arena_submissions') as any).upsert([{
        contest_id:            contest.id,
        contest_name:          contest.name,
        problem_id:            problem.id,
        problem_title:         problem.title,
        github:                u.github,
        name:                  u.name,
        lang:                  lang || 'unknown',
        code:                  code || '-- Time expired before submission --',
        strikes:               strikesRef.current,
        status:                'submitted',
        strike_penalty_factor: timeFactor * strikePenalty,
        tests_passed:          0,
        tests_total:           0,
        points_awarded:        0,
      }], { onConflict: 'contest_id,problem_id,github' }).then(({ error }: { error: any }) => {
        if (error) console.error('Problem-close snapshot failed:', error.message);
      });
    }

    if (problem) setSolved(prev => new Set(prev).add(problem.id));
    const ids = getContestProblemIds(contest);
    const currentIdx = problem ? ids.indexOf(problem.id) : problemIndex;
    const nextIdx = currentIdx + 1;
    if (nextIdx < ids.length) {
      switchProblem(contest, nextIdx);
      showToast(`Problem ${currentIdx + 1} done! Moving to Problem ${nextIdx + 1}…`, 'ok');
    } else {
      showToast('All problems attempted! You can submit & exit now.', 'info');
    }
  }

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const fmtCountdown = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const toastStyle = (type: string) =>
    type === 'ok'   ? 'bg-[var(--acc)] text-black' :
    type === 'err'  ? 'bg-[var(--danger)] text-white'  :
    type === 'warn' ? 'bg-[var(--warn)] text-black'  :
                      'bg-[var(--border)] text-[var(--text)] border border-[var(--border2)]';

  // ── Active contest view ─────────────────────────────────────
  if (activeContest) {
    const ids = getContestProblemIds(activeContest);
    return (
      <div className="min-h-screen bg-[var(--bg2)]">
        {toast && (
          <div className={`fixed top-16 right-4 left-4 md:left-auto md:right-6 md:w-auto z-[200]
            px-4 py-3 rounded-2xl font-mono text-sm shadow-2xl pointer-events-none backdrop-blur-sm animate-slide-down ${toastStyle(toast.type)}`}>
            {toast.msg}
          </div>
        )}

        {/* Fullscreen exit overlay — blocks UI and forces re-entry */}
        {showFsOverlay && (
          <div className="fixed inset-0 z-[500] bg-black/95 backdrop-blur-md flex flex-col items-center justify-center gap-6 p-6">
            <div className="text-5xl animate-pulse">⚠️</div>
            <div className="text-center">
              <h2 className="font-display font-bold text-2xl text-[var(--danger)] mb-2">
                Fullscreen Exited
              </h2>
              <p className="text-[var(--text-soft)] font-mono text-sm mb-1">
                You exited fullscreen — this is a proctored contest.
              </p>
              <p className="text-[var(--text3)] font-mono text-xs">
                Strike {strikes}/3 recorded · Timer is still running
              </p>
            </div>
            <button
              onClick={async () => {
                try {
                  await document.documentElement.requestFullscreen();
                  setShowFsOverlay(false);
                } catch {
                  setShowFsOverlay(false);
                }
              }}
              className="px-8 py-3 bg-[var(--acc)] text-black font-mono font-bold text-sm rounded-2xl
                hover:bg-[var(--acc-bright)] active:scale-95 transition-all shadow-[0_0_30px_rgba(0,232,122,0.3)]"
            >
              ↩ Re-enter Fullscreen
            </button>
            <p className="text-[var(--muted2)] font-mono text-[10px]">
              {3 - strikes} strike{3 - strikes !== 1 ? 's' : ''} remaining before disqualification
            </p>
          </div>
        )}

        {/* Contest bar */}
        <div className="bg-[rgba(var(--bg-rgb),0.95)] backdrop-blur-xl border-b border-[var(--card2)] px-4 md:px-6 py-3 sticky top-0 z-50" style={{boxShadow:"0 1px 0 rgba(255,255,255,0.03)"}}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="live-dot shrink-0" />
              <span className="hidden md:block text-xs font-mono text-[var(--text3)] uppercase tracking-wider">Live Contest</span>
              <span className="font-mono font-bold text-[var(--text)] text-sm truncate">{activeContest.name}</span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* Countdown */}
              <div className={`font-mono text-xl md:text-2xl font-bold tabular-nums transition-all duration-500
                ${timeLeft <= 60 ? 'text-[var(--danger)] animate-pulse' : 'text-[var(--acc)] stat-glow'}`}>
                {fmtTime(timeLeft)}
              </div>

              {/* Strike counter */}
              <div className={`hidden sm:flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-lg transition-all duration-300
                ${strikes > 0 ? 'text-[var(--danger)] bg-[rgba(var(--danger-rgb),0.063)] border border-[rgba(var(--danger-rgb),0.125)]' + (strikes >= 2 ? ' animate-pulse' : '') : 'text-[var(--text3)] bg-[var(--bg2)] border border-[var(--card2)]'}`}>
                <span>⚠</span>
                <span>{strikes}/3 warnings</span>
              </div>

              <button onClick={() => endContest('submitted')}
                className="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--text3)]
                  hover:text-[var(--danger)] hover:border-[rgba(var(--danger-rgb),0.145)] text-xs font-mono rounded-xl transition-all duration-200">
                Submit & Exit
              </button>
            </div>
          </div>

          {/* Problem tabs */}
          {ids.length > 1 && (
            <div className="flex gap-2 mt-2.5 overflow-x-auto pb-1">
              {ids.map((id, i) => (
                <button key={id} onClick={() => switchProblem(activeContest, i)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono whitespace-nowrap transition-all shrink-0
                    ${problemIndex === i
                      ? 'bg-[var(--acc)] text-black font-bold shadow-[0_0_12px_rgba(0,232,122,0.3)]'
                      : solved.has(id)
                        ? 'bg-[rgba(var(--acc-rgb),0.063)] text-[var(--acc)] border border-[rgba(var(--acc-rgb),0.125)]'
                        : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text3)] hover:text-[var(--text)] hover:border-[var(--border2)]'}`}>
                  {solved.has(id) ? '✓ ' : ''}Problem {i + 1}
                  {arenaProblems[id] ? ` — ${arenaProblems[id].title}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 md:p-6">
          {activeProblem ? (
            <Workspace key={activeProblem.id} problem={activeProblem} user={user} onClose={handleProblemClose} onArenaSubmit={handleArenaSubmit} onArenaCodeChange={handleArenaCodeChange} contestId={activeContest.id} />
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
              <div className="relative mb-8">
                <div className="w-20 h-20 rounded-full border border-[rgba(var(--acc-rgb),0.125)] flex items-center justify-center animate-float">
                  <div className="w-14 h-14 rounded-full border border-[rgba(var(--acc-rgb),0.188)] flex items-center justify-center">
                    <span className="text-3xl">⏳</span>
                  </div>
                </div>
                <div className="absolute inset-0 rounded-full animate-glow-pulse" style={{boxShadow:"0 0 40px rgba(0,232,122,0.08)"}} />
              </div>
              <div className="font-display font-bold text-[var(--text)] text-xl mb-2">Waiting for the problem…</div>
              <div className="text-sm text-[var(--text3)] font-mono mb-6 max-w-xs leading-relaxed">Stay on this page. The problem will appear shortly. Do not switch tabs.</div>
              <button onClick={loadContests} className="btn-ghost text-sm">↺ Refresh</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Contest list view ───────────────────────────────────────
  return (
    <div className="animate-fade-up">
      {toast && (
        <div className={`fixed top-20 right-4 left-4 md:left-auto md:right-6 md:w-auto z-50
          px-4 py-3 rounded-2xl font-mono text-sm shadow-2xl pointer-events-none backdrop-blur-sm animate-slide-down ${toastStyle(toast.type)}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display font-bold text-xl md:text-2xl mb-1 text-[var(--text)]">Proctored Arena 🏟️</h1>
        <p className="text-xs font-mono text-[var(--muted)] mb-5">Supervised coding contests. Prizes for top finishers. No shortcuts.</p>
        <p className="text-[var(--text2)] text-sm font-mono">
          Free for subscribers · get confirmed · compete in a supervised contest
        </p>
      </div>

      {/* Countdown banner — shown for confirmed upcoming contests */}
      {Object.entries(countdowns).map(([contestId, secs]) => {
        const ct = contests.find(c => c.id === contestId);
        if (!ct || secs <= 0) return null;
        const urgent = secs < 3600; // less than 1 hour
        return (
          <div key={contestId}
            className={`flex items-center justify-between gap-4 px-4 py-3 rounded-2xl mb-4 border
              ${urgent
                ? 'bg-[rgba(var(--warn-rgb),0.031)] border-[rgba(var(--warn-rgb),0.145)]'
                : 'bg-[rgba(var(--acc-rgb),0.024)] border-[rgba(var(--acc-rgb),0.125)]'}`}>
            <div className="flex items-center gap-3 min-w-0">
              <span className={`text-lg shrink-0 ${urgent ? 'animate-pulse' : ''}`}>
                {urgent ? '⚡' : '🏟️'}
              </span>
              <div className="min-w-0">
                <div className={`text-xs font-mono font-bold ${urgent ? 'text-[var(--warn)]' : 'text-[var(--acc)]'}`}>
                  {urgent ? 'Starting soon!' : 'Your contest is coming up'}
                </div>
                <div className="text-[10px] font-mono text-[var(--text3)] truncate">{ct.name}</div>
              </div>
            </div>
            <div className={`shrink-0 font-mono font-bold text-lg tabular-nums
              ${urgent ? 'text-[var(--warn)]' : 'text-[var(--acc)]'}`}>
              {fmtCountdown(secs)}
            </div>
          </div>
        );
      })}

      {/* Proctoring notice */}
      <div className="card p-4 mb-6 border-[rgba(var(--warn-rgb),0.125)] bg-[rgba(var(--warn-rgb),0.024)]">
        <div className="flex gap-3">
          <span className="text-lg shrink-0">🛡️</span>
          <div>
            <div className="font-mono font-bold text-[var(--warn)] text-sm mb-1">Contest runs in supervised mode</div>
            <div className="text-xs font-mono text-[var(--text-soft)] leading-relaxed">
              Once you enter, the contest runs fullscreen. Switching tabs or exiting fullscreen counts as a violation. 
              3 violations = disqualification. You can only enter each contest once.
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--text2)] font-mono text-sm py-12">
          <div className="spinner" /> Loading contests…
        </div>
      ) : contests.length === 0 ? (
        <div className="text-center py-20 text-[var(--text2)] font-mono">
          <div className="text-4xl mb-4 opacity-30">🏆</div>
          <div className="text-sm">No contests right now. Check back soon!</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contests.map(ct => {
            const reg     = userRegs.find(r => r.contest_id === ct.id);
            const outcome = contestOutcomes.get(ct.id);
            return (
              <div key={ct.id}
                className={`flex flex-col gap-4 p-5 rounded-2xl border transition-all duration-300
                  ${ct.status === 'live'
                    ? 'bg-[var(--bg2)] border-[rgba(var(--acc-rgb),0.145)] shadow-[0_0_32px_rgba(0,232,122,0.08)]'
                    : ct.status === 'ended'
                    ? 'bg-[var(--bg)] border-[var(--card)] opacity-50'
                    : 'bg-[var(--bg2)] border-[var(--border)] hover:border-[var(--border2)]'}`}>

                {/* Status + price */}
                <div className="flex items-center justify-between">
                  {ct.status === 'live'     ? <span className="badge-live flex items-center gap-1.5"><span className="live-dot" /> LIVE</span> :
                   ct.status === 'upcoming' ? <span className="badge-upcoming">◌ Upcoming</span> :
                                              <span className="badge-ended">✓ Ended</span>}
                  <span className="text-[var(--acc)] font-mono font-bold text-xs">Free for subscribers</span>
                </div>

                {/* Contest info */}
                <div>
                  <div className="font-display font-bold text-[var(--text)] text-base mb-1">{ct.name}</div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: `${ct.duration_mins}m`, label: 'Duration' },
                    {
                      val: ct.status === 'live'
                        ? 'Hidden'
                        : (() => {
                            const ids = getContestProblemIds(ct);
                            return ids.length > 0 ? String(ids.length) : '—';
                          })(),
                      label: 'Problems'
                    },
                    { val: ct.status === 'live' ? 'Active' : ct.status === 'ended' ? 'Done' : 'Open', label: 'Phase' },
                  ].map(item => (
                    <div key={item.label} className="bg-[var(--surface2)] rounded-xl p-2.5 text-center border border-[var(--border)]">
                      <div className="text-[var(--text)] font-mono font-bold text-xs">{item.val}</div>
                      <div className="text-[10px] text-[var(--text-soft)] font-mono mt-0.5">{item.label}</div>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="mt-auto">
                  {ct.status === 'ended' ? (
                    <div className="space-y-2">
                      {outcome ? (
                        <div className={`text-center text-xs font-mono py-2.5 px-3 rounded-xl
                          ${outcome === 'disqualified'
                            ? 'bg-[rgba(var(--danger-rgb),0.071)] text-[var(--danger)] border border-[rgba(var(--danger-rgb),0.125)]'
                            : 'bg-[rgba(var(--acc-rgb),0.071)] text-[var(--acc)] border border-[rgba(var(--acc-rgb),0.125)]'}`}>
                          {outcome === 'disqualified' ? '❌ Disqualified' : '✅ Submitted — awaiting results'}
                        </div>
                      ) : (
                        <div className="text-center text-xs text-[var(--text-soft)] font-mono py-2.5">Contest ended</div>
                      )}
                      <button onClick={() => setResultsContest(ct)}
                        className="w-full py-2 bg-[var(--surface2)] border border-[rgba(var(--purple-rgb),0.145)] text-[var(--purple)]
                          font-mono text-xs rounded-xl hover:bg-[rgba(var(--purple-rgb),0.063)] transition-all">
                        🏁 View Results
                      </button>
                    </div>
                  ) : reg ? (
                    <>
                      <div className={`text-xs font-mono mb-3 px-3 py-2 rounded-xl text-center
                        ${reg.status === 'confirmed' ? 'bg-[rgba(var(--acc-rgb),0.071)] text-[var(--acc)] border border-[rgba(var(--acc-rgb),0.125)]' :
                          reg.status === 'pending'   ? 'bg-[rgba(var(--warn-rgb),0.071)] text-[var(--warn)] border border-[rgba(var(--warn-rgb),0.125)]' :
                                                       'bg-[rgba(var(--danger-rgb),0.071)] text-[var(--danger)] border border-[rgba(var(--danger-rgb),0.125)]'}`}>
                        {reg.status === 'confirmed' ? '✓ Registered & confirmed' :
                         reg.status === 'pending'   ? '⏳ Registration pending'  :
                                                      '✗ Registration rejected — please re-apply'}
                      </div>
                      {/* Countdown for confirmed upcoming */}
                      {reg.status === 'confirmed' && ct.status === 'upcoming' && countdowns[ct.id] > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[var(--surface2)] border border-[var(--border)] mb-3">
                          <span className="text-[10px] font-mono text-[var(--text3)]">Starts in</span>
                          <span className={`font-mono font-bold text-sm tabular-nums
                            ${countdowns[ct.id] < 3600 ? 'text-[var(--warn)]' : 'text-[var(--acc)]'}`}>
                            {fmtCountdown(countdowns[ct.id])}
                          </span>
                        </div>
                      )}
                      {reg.status === 'confirmed' && ct.status === 'live' && (
                        outcome === 'disqualified' ? (
                          <div className="w-full py-2.5 bg-[rgba(var(--danger-rgb),0.063)] text-[var(--danger)] font-mono text-sm rounded-xl text-center border border-[rgba(var(--danger-rgb),0.082)]">
                            ❌ Disqualified
                          </div>
                        ) : outcome === 'submitted' ? (
                          <div className="w-full py-2.5 bg-[var(--border)] text-[var(--text2)] font-mono text-sm rounded-xl text-center border border-[var(--border2)]">
                            ✓ Submitted — contest locked
                          </div>
                        ) : (
                          <button onClick={() => startContest(ct)}
                            className="w-full py-2.5 bg-[var(--acc)] text-black font-mono font-bold text-sm rounded-xl
                              hover:bg-[var(--acc-bright)] transition-all active:scale-[0.98] shadow-[0_0_16px_rgba(0,232,122,0.2)]">
                            Enter Live Arena →
                          </button>
                        )
                      )}
                    </>
                  ) : ct.status === 'live' ? (
                    <button disabled className="w-full py-2.5 bg-[var(--border)] text-[var(--text-soft)] font-mono text-sm rounded-xl cursor-not-allowed border border-[var(--border)]">
                      Registration closed
                    </button>
                  ) : !user ? (
                    <button disabled className="w-full py-2.5 bg-[var(--border)] text-[var(--text-soft)] font-mono text-sm rounded-xl cursor-not-allowed border border-[var(--border)]">
                      Sign in to register
                    </button>
                  ) : (
                    <ContestEntryButton
                      contest={ct} user={user} isSubscriber={isSubscriber}
                      onSuccess={() => { showToast(`You're registered — see you in the arena!`, 'ok'); loadContests(); }}
                      onError={(msg) => showToast(msg, 'err')}
                      onNavigateSubscribe={() => onNavigate?.('weekly')}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {resultsContest && (
        <ContestResultsModal contest={resultsContest} onClose={() => setResultsContest(null)} />
      )}
      {rulesContest && (
        <ContestRulesModal
          contest={rulesContest}
          problemCount={getContestProblemIds(rulesContest).length}
          onCancel={() => setRulesContest(null)}
          onConfirm={() => enterContestNow(rulesContest)}
        />
      )}
      {feedbackContest && user && (
        <ContestFeedbackModal
          contest={feedbackContest.contest}
          outcome={feedbackContest.outcome}
          user={user}
          onDone={() => setFeedbackContest(null)}
        />
      )}
    </div>
  );
}

function ContestRulesModal({
  contest, problemCount, onCancel, onConfirm,
}: {
  contest: Contest;
  problemCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl animate-fade-up max-h-[85vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">🏁</span>
          <h3 className="font-display font-bold text-lg text-[var(--text)]">{contest.name}</h3>
        </div>
        <p className="text-xs font-mono text-[var(--text3)] mb-5">Rules & Format — read before you start</p>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3">
            <div className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-widest mb-1">Duration</div>
            <div className="font-mono font-bold text-[var(--text)]">{contest.duration_mins} minutes</div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3">
            <div className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-widest mb-1">Problems</div>
            <div className="font-mono font-bold text-[var(--text)]">{problemCount}</div>
          </div>
        </div>

        <div className="flex gap-2 items-start bg-[rgba(var(--warn-rgb),0.08)] border border-[rgba(var(--warn-rgb),0.2)] rounded-xl px-3.5 py-2.5 mb-5">
          <span className="text-sm">🏆</span>
          <p className="text-xs font-mono text-[var(--warn)] leading-relaxed">
            Top finishers may receive a prize, arranged and given separately by the organizer — not processed through Razorpay or this platform.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <h4 className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-widest">Format</h4>
          <ul className="space-y-2 text-sm font-mono text-[var(--text-soft)]">
            <li className="flex gap-2"><span className="text-[var(--acc)] shrink-0">•</span>Solve as many of the {problemCount} problem{problemCount === 1 ? '' : 's'} as you can before the timer runs out.</li>
            <li className="flex gap-2"><span className="text-[var(--acc)] shrink-0">•</span>Points per problem = base points × (tests passed ÷ total tests) × a time factor × a strike penalty.</li>
            <li className="flex gap-2"><span className="text-[var(--acc)] shrink-0">•</span>Submitting earlier and with fewer strikes earns more points — the clock and your strikes both scale down your score.</li>
            <li className="flex gap-2"><span className="text-[var(--acc)] shrink-0">•</span>You can resubmit — your latest submission per problem is what counts.</li>
          </ul>

          <h4 className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-widest pt-2">Rules</h4>
          <ul className="space-y-2 text-sm font-mono text-[var(--text-soft)]">
            <li className="flex gap-2"><span className="text-[var(--danger)] shrink-0">•</span>The contest runs in fullscreen. Exiting fullscreen or switching tabs counts as a strike.</li>
            <li className="flex gap-2"><span className="text-[var(--danger)] shrink-0">•</span>3 strikes and you're automatically disqualified.</li>
            <li className="flex gap-2"><span className="text-[var(--danger)] shrink-0">•</span>Once the timer hits zero, your current code is auto-submitted as-is.</li>
            <li className="flex gap-2"><span className="text-[var(--danger)] shrink-0">•</span>No AI hints or external help during the contest — this is a timed, closed-book round.</li>
          </ul>
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-2.5 bg-[var(--card2)] text-[var(--text-soft)] font-mono text-sm font-bold rounded-xl hover:bg-[var(--border2)] hover:text-[var(--text)] transition-all">
            Not yet
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 bg-[var(--acc)] text-black font-mono text-sm font-bold rounded-xl hover:bg-[var(--acc-bright)] transition-all active:scale-[0.98]">
            I Understand — Start Contest
          </button>
        </div>
      </div>
    </div>
  );
}

function ContestFeedbackModal({
  contest, outcome, user, onDone,
}: {
  contest: Contest;
  outcome: ContestOutcome;
  user: User;
  onDone: () => void;
}) {
  const db = getSupabaseClient();
  const [rating,      setRating]      = useState(0);
  const [difficulty,  setDifficulty]  = useState<'easy' | 'right' | 'hard' | null>(null);
  const [recommend,   setRecommend]   = useState<boolean | null>(null);
  const [comments,    setComments]    = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);

  async function submitFeedback() {
    setSubmitting(true);
    try {
      await (db.from('contest_feedback') as any).insert([{
        contest_id:     contest.id,
        contest_name:   contest.name,
        github:         user.github,
        name:           user.name,
        outcome,
        rating:         rating || null,
        difficulty:     difficulty,
        would_recommend: recommend,
        comments:       comments.trim() || null,
      }]);
      setSubmitted(true);
      setTimeout(onDone, 1400);
    } catch (e: any) {
      console.error('Feedback submit failed:', e.message);
      setSubmitted(true);
      setTimeout(onDone, 1400);
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 shadow-2xl animate-fade-up text-center">
          <span className="text-3xl block mb-3">🙌</span>
          <p className="font-mono text-sm text-[var(--text)]">Thanks for the feedback!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-2xl animate-fade-up">
        <h3 className="font-display font-bold text-lg text-[var(--text)] mb-1">
          {outcome === 'disqualified' ? 'Sorry that ended in a DQ' : 'How was the contest?'}
        </h3>
        <p className="text-xs font-mono text-[var(--text3)] mb-5">{contest.name} — your feedback helps us improve future contests.</p>

        <div className="mb-5">
          <p className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-widest mb-2">Overall experience</p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => setRating(n)}
                className={`text-2xl transition-transform hover:scale-110 ${n <= rating ? '' : 'grayscale opacity-30'}`}>
                ⭐
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <p className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-widest mb-2">Difficulty</p>
          <div className="flex gap-2">
            {([
              { key: 'easy', label: 'Too easy' },
              { key: 'right', label: 'Just right' },
              { key: 'hard', label: 'Too hard' },
            ] as const).map(opt => (
              <button key={opt.key} onClick={() => setDifficulty(opt.key)}
                className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold border transition-all
                  ${difficulty === opt.key
                    ? 'bg-[rgba(var(--acc-rgb),0.12)] text-[var(--acc)] border-[rgba(var(--acc-rgb),0.3)]'
                    : 'bg-[var(--card)] text-[var(--text2)] border-[var(--border)] hover:border-[var(--border2)]'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <p className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-widest mb-2">Would you join another contest like this?</p>
          <div className="flex gap-2">
            {([{ v: true, label: '👍 Yes' }, { v: false, label: '👎 Not really' }] as const).map(opt => (
              <button key={String(opt.v)} onClick={() => setRecommend(opt.v)}
                className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold border transition-all
                  ${recommend === opt.v
                    ? 'bg-[rgba(var(--acc-rgb),0.12)] text-[var(--acc)] border-[rgba(var(--acc-rgb),0.3)]'
                    : 'bg-[var(--card)] text-[var(--text2)] border-[var(--border)] hover:border-[var(--border2)]'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-widest mb-2">Anything else? (optional)</p>
          <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3} maxLength={500}
            placeholder="Bugs, problem quality, timing, anything…"
            className="input-base w-full resize-none" />
        </div>

        <div className="flex gap-2">
          <button onClick={onDone} disabled={submitting}
            className="flex-1 py-2.5 bg-[var(--card2)] text-[var(--text-soft)] font-mono text-sm font-bold rounded-xl hover:bg-[var(--border2)] hover:text-[var(--text)] transition-all disabled:opacity-50">
            Skip
          </button>
          <button onClick={submitFeedback} disabled={submitting || (!rating && !difficulty && recommend === null && !comments.trim())}
            className="flex-1 py-2.5 bg-[var(--acc)] text-black font-mono text-sm font-bold rounded-xl hover:bg-[var(--acc-bright)] transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed">
            {submitting ? 'Sending…' : 'Send Feedback'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ContestResultsModal({ contest, onClose }: { contest: Contest; onClose: () => void }) {
  const db = getSupabaseClient();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const { data } = await db
          .from('arena_submissions')
          .select('github, name, points_awarded, tests_passed, tests_total, status, created_at')
          .eq('contest_id', contest.id)
          .order('points_awarded', { ascending: false });
        if (alive) setRows((data || []) as any[]);
      } catch {
        if (alive) setRows([]);
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [contest.id]);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h3 className="font-display font-bold text-[var(--text)] text-base">🏁 {contest.name}</h3>
            <p className="text-[10px] text-[var(--text3)] font-mono mt-0.5">Final results</p>
          </div>
          <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text)] transition-colors text-lg">✕</button>
        </div>

        <div className="overflow-y-auto px-4 py-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="spinner" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-[var(--text2)] font-mono text-sm">
              No submissions were recorded for this contest.
            </div>
          ) : (
            rows.map((r, i) => (
              <div key={`${r.github}-${i}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border
                  ${i < 3 ? 'bg-[rgba(var(--purple-rgb),0.031)] border-[rgba(var(--purple-rgb),0.125)]' : 'bg-[var(--surface2)] border-[var(--border)]'}
                  ${r.status === 'disqualified' ? 'opacity-50' : ''}`}
              >
                <div className="w-7 text-center shrink-0 font-mono text-xs text-[var(--text2)]">
                  {i < 3 ? medals[i] : `#${i + 1}`}
                </div>
                <img
                  src={`https://github.com/${r.github}.png?size=28`}
                  alt={r.name}
                  className="w-7 h-7 rounded-full shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono font-bold text-[var(--text)] truncate">{r.name || r.github}</div>
                  <div className="text-[10px] font-mono text-[var(--text3)]">
                    {r.status === 'disqualified' ? '❌ Disqualified' : `${r.tests_passed}/${r.tests_total} tests`}
                  </div>
                </div>
                <div className="text-sm font-mono font-bold text-[var(--purple)] shrink-0">
                  {(r.points_awarded ?? 0).toLocaleString()} pts
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}