'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic                          from 'next/dynamic';
import { getSupabaseClient }            from '@/lib/supabase';
import PaymentButton                    from '@/components/arena/PaymentButton';
import type { Contest, ContestRegistration, Problem, User } from '@/types/database';

const Workspace = dynamic(() => import('@/app/problems/Workspace'), { ssr: false });
const db = getSupabaseClient();

interface ArenaPageProps {
  user:              User | null;
  onArenaLockChange: (locked: boolean) => void;
}

type ContestOutcome = 'submitted' | 'disqualified';

export default function ArenaPage({ user, onArenaLockChange }: ArenaPageProps) {
  const [contests,      setContests]      = useState<Contest[]>([]);
  const [userRegs,      setUserRegs]      = useState<ContestRegistration[]>([]);
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

  useEffect(() => { loadContests(); }, [user]);

  useEffect(() => {
    const channel = db
      .channel('arena-contests-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contests' }, () => loadContests())
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [user]);

  async function loadContests() {
    setLoading(true);
    try {
      const [{ data: c }, { data: r }, { data: arenaSubs }] = await Promise.all([
        db.from('contests').select('*').order('created_at', { ascending: false }),
        user
          ? db.from('contest_registrations').select('*').eq('github', user.github)
          : Promise.resolve({ data: [] }),
        user
          ? db.from('arena_submissions').select('contest_id, status').eq('github', user.github)
          : Promise.resolve({ data: [] }),
      ]);
      const contestList = (c || []) as Contest[];
      setContests(contestList);
      setUserRegs((r as ContestRegistration[]) || []);

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

    visHandler.current = () => {
      if (document.hidden) {
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
    if (visHandler.current) document.removeEventListener('visibilitychange', visHandler.current);

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
      const elapsed    = contest.duration_mins * 60 - timeLeftRef.current;
      const timeFactor = Math.max(0.5, 1 - (elapsed / (contest.duration_mins * 60)) * 0.5);
      const { code, lang } = currentCodeRef.current;
      ;(db.from('arena_submissions') as any).insert([{
        contest_id: contest.id, contest_name: contest.name,
        problem_id: problem.id, problem_title: problem.title,
        github: u.github, name: u.name,
        lang: lang || 'unknown',
        code: code || '-- No code submitted --',
        strikes: strikesRef.current, status: 'submitted',
        strike_penalty_factor: timeFactor, points_awarded: 0,
      }]).then(({ error }: { error: any }) => {
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
    onArenaLockChange(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    showToast(
      status === 'disqualified'
        ? '❌ Disqualified — too many tab-switch violations.'
        : '✅ Contest submitted. Good work!',
      status === 'disqualified' ? 'err' : 'ok',
    );
  }

  async function handleArenaSubmit(code: string, lang: string) {
    const contest = activeContestRef.current;
    const problem = activeProblemRef.current;
    const u       = userRef.current;
    if (!contest || !problem || !u) return;
    if (submittedProblemIds.current.has(problem.id)) return;
    submittedProblemIds.current.add(problem.id);
    try {
      const elapsed    = contest.duration_mins * 60 - timeLeftRef.current;
      const timeFactor = Math.max(0.5, 1 - (elapsed / (contest.duration_mins * 60)) * 0.5);
      await (db.from('arena_submissions') as any).insert([{
        contest_id: contest.id, contest_name: contest.name,
        problem_id: problem.id, problem_title: problem.title,
        github: u.github, name: u.name,
        lang, code, strikes: strikesRef.current, status: 'submitted',
        strike_penalty_factor: timeFactor, points_awarded: 0,
      }]);
    } catch {}
  }

  async function handleProblemClose() {
    const contest = activeContestRef.current;
    const problem = activeProblemRef.current;
    const u       = userRef.current;
    if (!contest) return;

    // Snapshot current code for the problem being closed, if not yet submitted
    if (problem && u && !submittedProblemIds.current.has(problem.id)) {
      submittedProblemIds.current.add(problem.id);
      const elapsed    = contest.duration_mins * 60 - timeLeftRef.current;
      const timeFactor = Math.max(0.5, 1 - (elapsed / (contest.duration_mins * 60)) * 0.5);
      const { code, lang } = currentCodeRef.current;
      ;(db.from('arena_submissions') as any).insert([{
        contest_id: contest.id, contest_name: contest.name,
        problem_id: problem.id, problem_title: problem.title,
        github: u.github, name: u.name,
        lang: lang || 'unknown',
        code: code || '-- No code submitted --',
        strikes: strikesRef.current, status: 'submitted',
        strike_penalty_factor: timeFactor, points_awarded: 0,
      }]).then(({ error }: { error: any }) => {
        if (error) console.error('Problem-close snapshot failed:', error.message);
      });
    }

    if (problem) setSolved(prev => new Set(prev).add(problem.id));
    const ids = getContestProblemIds(contest);
    // Derive current index from the ref so we're not stale if the user
    // clicked a problem tab before the auto-advance setTimeout fired.
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

  const toastStyle = (type: string) =>
    type === 'ok'   ? 'bg-[#00e87a] text-black' :
    type === 'err'  ? 'bg-[#ff4d4d] text-white'  :
    type === 'warn' ? 'bg-[#f0b429] text-black'  :
                      'bg-[#1f1f1f] text-[#e0e0e0] border border-[#2a2a2a]';

  // ── Active contest view ─────────────────────────────────────
  if (activeContest) {
    const ids = getContestProblemIds(activeContest);
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        {toast && (
          <div className={`fixed top-16 right-4 left-4 md:left-auto md:right-6 md:w-auto z-[200]
            px-4 py-3 rounded-xl font-mono text-sm shadow-xl pointer-events-none ${toastStyle(toast.type)}`}>
            {toast.msg}
          </div>
        )}

        {/* Contest bar */}
        <div className="bg-[#111] border-b border-[#1f1f1f] px-4 md:px-6 py-3 sticky top-0 z-50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="live-dot shrink-0" />
              <span className="hidden md:block text-xs font-mono text-[#555] uppercase tracking-wider">Live Contest</span>
              <span className="font-mono font-bold text-[#e0e0e0] text-sm truncate">{activeContest.name}</span>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* Countdown */}
              <div className={`font-mono text-xl md:text-2xl font-bold tabular-nums
                ${timeLeft <= 60 ? 'text-[#ff4d4d] animate-pulse' : 'text-[#00e87a]'}`}>
                {fmtTime(timeLeft)}
              </div>

              {/* Strike counter */}
              <div className={`hidden sm:flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-lg
                ${strikes > 0 ? 'text-[#ff4d4d] bg-[#ff4d4d12] border border-[#ff4d4d20]' : 'text-[#333] bg-[#111] border border-[#1a1a1a]'}`}>
                <span>⚠</span>
                <span>{strikes}/3 warnings</span>
              </div>

              <button onClick={() => endContest('submitted')}
                className="px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#666]
                  hover:text-[#ff4d4d] hover:border-[#ff4d4d30] text-xs font-mono rounded-xl transition-all">
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
                      ? 'bg-[#00e87a] text-black font-bold'
                      : solved.has(id)
                        ? 'bg-[#00e87a15] text-[#00e87a] border border-[#00e87a30]'
                        : 'bg-[#1a1a1a] border border-[#2a2a2a] text-[#555] hover:text-[#e0e0e0]'}`}>
                  {solved.has(id) ? '✓ ' : ''}Problem {i + 1}
                  {arenaProblems[id] ? ` — ${arenaProblems[id].title}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 md:p-6">
          {activeProblem ? (
            <Workspace key={activeProblem.id} problem={activeProblem} user={user} onClose={handleProblemClose} onArenaSubmit={handleArenaSubmit} onArenaCodeChange={handleArenaCodeChange} />
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
              <div className="text-5xl mb-5">⏳</div>
              <div className="font-mono text-[#e0e0e0] text-lg mb-2">Waiting for the problem to be revealed…</div>
              <div className="text-sm text-[#555] font-mono mb-6">Stay on this page. The problem will appear shortly.</div>
              <button onClick={loadContests} className="btn-ghost text-sm">Refresh</button>
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
          px-4 py-3 rounded-xl font-mono text-sm shadow-xl pointer-events-none ${toastStyle(toast.type)}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display font-bold text-xl md:text-2xl mb-1.5">Proctored Arena</h1>
        <p className="text-[#555] text-sm font-mono">
          Pay the entry fee · get confirmed · compete in a supervised contest
        </p>
      </div>

      {/* Proctoring notice */}
      <div className="card p-4 mb-6 border-[#f0b42920] bg-[#f0b42906]">
        <div className="flex gap-3">
          <span className="text-lg shrink-0">🛡️</span>
          <div>
            <div className="font-mono font-bold text-[#f0b429] text-sm mb-1">Contest runs in supervised mode</div>
            <div className="text-xs font-mono text-[#666] leading-relaxed">
              Once you enter, the contest runs fullscreen. Switching tabs or exiting fullscreen counts as a violation. 
              3 violations = disqualification. You can only enter each contest once.
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[#555] font-mono text-sm py-12">
          <div className="spinner" /> Loading contests…
        </div>
      ) : contests.length === 0 ? (
        <div className="text-center py-20 text-[#444] font-mono">
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
                className={`card flex flex-col gap-4 p-5
                  ${ct.status === 'live'  ? 'border-[#00e87a30] shadow-[0_0_24px_rgba(0,232,122,0.07)]' :
                    ct.status === 'ended' ? 'opacity-60' : ''}`}>

                {/* Status + price */}
                <div className="flex items-center justify-between">
                  {ct.status === 'live'     ? <span className="badge-live flex items-center gap-1.5"><span className="live-dot" /> LIVE</span> :
                   ct.status === 'upcoming' ? <span className="badge-upcoming">◌ Upcoming</span> :
                                              <span className="badge-ended">✓ Ended</span>}
                  <span className="text-[#a78bfa] font-mono font-bold text-sm">₹{ct.entry_fee}</span>
                </div>

                {/* Contest info */}
                <div>
                  <div className="font-display font-bold text-[#e0e0e0] mb-1">{ct.name}</div>
                  <div className="text-xs text-[#555] font-mono">🎁 {ct.prize_note || 'Standard prize allocation'}</div>
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
                    <div key={item.label} className="bg-[#0d0d0d] rounded-xl p-2.5 text-center border border-[#1a1a1a]">
                      <div className="text-[#e0e0e0] font-mono font-bold text-xs">{item.val}</div>
                      <div className="text-[10px] text-[#333] font-mono mt-0.5">{item.label}</div>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="mt-auto">
                  {ct.status === 'ended' ? (
                    outcome ? (
                      <div className={`text-center text-xs font-mono py-2.5 px-3 rounded-xl
                        ${outcome === 'disqualified'
                          ? 'bg-[#ff4d4d12] text-[#ff4d4d] border border-[#ff4d4d20]'
                          : 'bg-[#00e87a12] text-[#00e87a] border border-[#00e87a20]'}`}>
                        {outcome === 'disqualified' ? '❌ Disqualified' : '✅ Submitted — awaiting results'}
                      </div>
                    ) : (
                      <div className="text-center text-xs text-[#333] font-mono py-2.5">Contest ended</div>
                    )
                  ) : reg ? (
                    <>
                      <div className={`text-xs font-mono mb-3 px-3 py-2 rounded-xl text-center
                        ${reg.status === 'confirmed' ? 'bg-[#00e87a12] text-[#00e87a] border border-[#00e87a20]' :
                          reg.status === 'pending'   ? 'bg-[#f0b42912] text-[#f0b429] border border-[#f0b42920]' :
                                                       'bg-[#ff4d4d12] text-[#ff4d4d] border border-[#ff4d4d20]'}`}>
                        {reg.status === 'confirmed' ? '✓ Registered & confirmed' :
                         reg.status === 'pending'   ? '⏳ Payment under review'  :
                                                      '✗ Rejected — please re-apply'}
                      </div>
                      {reg.status === 'confirmed' && ct.status === 'live' && (
                        outcome === 'disqualified' ? (
                          <div className="w-full py-2.5 bg-[#ff4d4d10] text-[#ff4d4d] font-mono text-sm rounded-xl text-center border border-[#ff4d4d15]">
                            ❌ Disqualified
                          </div>
                        ) : outcome === 'submitted' ? (
                          <div className="w-full py-2.5 bg-[#1a1a1a] text-[#444] font-mono text-sm rounded-xl text-center border border-[#222]">
                            ✓ Submitted — contest locked
                          </div>
                        ) : (
                          <button onClick={() => startContest(ct)}
                            className="w-full py-2.5 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-xl
                              hover:bg-[#00ff88] transition-all active:scale-[0.98] shadow-[0_0_16px_rgba(0,232,122,0.2)]">
                            Enter Live Arena →
                          </button>
                        )
                      )}
                    </>
                  ) : ct.status === 'live' ? (
                    <button disabled className="w-full py-2.5 bg-[#1a1a1a] text-[#333] font-mono text-sm rounded-xl cursor-not-allowed border border-[#1f1f1f]">
                      Registration closed
                    </button>
                  ) : !user ? (
                    <button disabled className="w-full py-2.5 bg-[#1a1a1a] text-[#333] font-mono text-sm rounded-xl cursor-not-allowed border border-[#1f1f1f]">
                      Sign in to register
                    </button>
                  ) : (
                    <PaymentButton
                      contest={ct} user={user}
                      onSuccess={(txnId) => { showToast(`Payment submitted! ID: ${txnId} — awaiting review.`, 'info'); loadContests(); }}
                      onError={(msg) => showToast(msg, 'err')}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}