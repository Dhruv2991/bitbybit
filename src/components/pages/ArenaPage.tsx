'use client';
// ════════════════════════════════════════════════════════════
// src/components/pages/ArenaPage.tsx
// - alert() fully removed — toast-only
// - Fullscreen NOT exited on problem submit (only on "Submit & Exit")
// - Problem solved tracking per contest session
// ════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic                                       from 'next/dynamic';
import { getSupabaseClient }                         from '@/lib/supabase';
import PaymentButton                                 from '@/components/arena/PaymentButton';
import type { Contest, ContestRegistration, Problem, User } from '@/types/database';

const Workspace = dynamic(() => import('@/app/problems/Workspace'), { ssr: false });

// db outside component — stable reference, never triggers re-renders
const db = getSupabaseClient();

interface ArenaPageProps {
  user:              User | null;
  onArenaLockChange: (locked: boolean) => void;
}

export default function ArenaPage({ user, onArenaLockChange }: ArenaPageProps) {
  const [contests,      setContests]      = useState<Contest[]>([]);
  const [userRegs,      setUserRegs]      = useState<ContestRegistration[]>([]);
  const [arenaProblems, setArenaProblems] = useState<Record<string, Problem>>({});
  const [loading,       setLoading]       = useState(true);
  const [toast,         setToast]         = useState<{ msg: string; type: 'ok' | 'err' | 'info' | 'warn' } | null>(null);
  const [activeContest, setActiveContest] = useState<Contest | null>(null);
  const [activeProblem, setActiveProblem] = useState<Problem | null>(null);
  const [problemIndex,  setProblemIndex]  = useState(0);
  const [strikes,       setStrikes]       = useState(0);
  const [timeLeft,      setTimeLeft]      = useState(0);
  const [solved,        setSolved]        = useState<Set<string>>(new Set());
  const timerRef   = useRef<NodeJS.Timeout | null>(null);
  const visHandler = useRef<(() => void) | null>(null);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { loadContests(); }, [user]);

  async function loadContests() {
    setLoading(true);
    try {
      const [{ data: c }, { data: r }] = await Promise.all([
        db.from('contests').select('*').order('created_at', { ascending: false }),
        user
          ? db.from('contest_registrations').select('*').eq('github', user.github)
          : Promise.resolve({ data: [] }),
      ]);
      const contestList = (c || []) as Contest[];
      setContests(contestList);
      setUserRegs((r as ContestRegistration[]) || []);

      const allIds = new Set<string>();
      contestList.filter(ct => ct.status === 'live').forEach(ct => {
        if (ct.problem_id) allIds.add(ct.problem_id);
        (ct.problem_ids || []).forEach(id => allIds.add(id));
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
    if (!user) { showToast('Sign in required', 'err'); return; }
    try { await document.documentElement.requestFullscreen?.(); } catch {}

    const ids = getContestProblemIds(contest);
    const firstProblem = ids.length ? arenaProblems[ids[0]] || null : null;

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
          showToast(`⚠ Tab switch detected! ${next}/3 strikes.`, 'warn');
          if (next >= 3) endContest('disqualified');
          return next;
        });
      }
    };
    document.addEventListener('visibilitychange', visHandler.current);

    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { endContest('submitted'); return 0; }
        if (t === 300) showToast('⏰ 5 minutes remaining!', 'warn');
        if (t === 60)  showToast('⏰ 1 minute remaining!', 'err');
        return t - 1;
      });
    }, 1000);
  }

  function switchProblem(contest: Contest, idx: number) {
    const ids = getContestProblemIds(contest);
    if (idx < 0 || idx >= ids.length) return;
    setProblemIndex(idx);
    setActiveProblem(arenaProblems[ids[idx]] || null);
  }

  function endContest(status: 'submitted' | 'disqualified') {
    if (timerRef.current)   clearInterval(timerRef.current);
    if (visHandler.current) document.removeEventListener('visibilitychange', visHandler.current);
    setActiveContest(null);
    setActiveProblem(null);
    setSolved(new Set());
    onArenaLockChange(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    showToast(
      status === 'disqualified' ? '❌ Disqualified — too many tab-switch violations.' : '✅ Contest ended. Good work!',
      status === 'disqualified' ? 'err' : 'ok'
    );
  }

  // Called from Workspace onClose — in arena context just switch problem or show toast
  // Does NOT exit fullscreen so the proctor session stays intact
  async function handleProblemClose() {
    if (!activeContest) return;

    // Record an arena_submission for this problem so admin can review it
    if (activeProblem && user) {
      try {
        const elapsed = activeContest.duration_mins * 60 - timeLeft;
        const timeFactor = Math.max(0.5, 1 - elapsed / (activeContest.duration_mins * 60) * 0.5);
        await (db.from('arena_submissions') as any).insert([{
          contest_id:            activeContest.id,
          contest_name:          activeContest.name,
          github:                user.github,
          name:                  user.name,
          lang:                  'unknown',       // Workspace doesn't expose lang here; admin sees code in submissions table
          code:                  '',              // code is in the regular submission row
          strikes,
          status:                'submitted',
          strike_penalty_factor: timeFactor,
          points_awarded:        0,
        }]);
      } catch { /* non-fatal — submission already recorded in submissions table */ }
    }

    // Mark the current problem as attempted and move to next if possible
    if (activeProblem) setSolved(prev => new Set(prev).add(activeProblem.id));
    const ids = getContestProblemIds(activeContest);
    const nextIdx = problemIndex + 1;
    if (nextIdx < ids.length) {
      switchProblem(activeContest, nextIdx);
      showToast(`Problem ${problemIndex + 1} done! Moving to Problem ${nextIdx + 1}…`, 'ok');
    } else {
      showToast('All problems attempted! You can submit & exit now.', 'info');
    }
  }

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Active arena view ──────────────────────────────────────
  if (activeContest) {
    const ids = getContestProblemIds(activeContest);
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        {/* Persistent toast inside arena */}
        {toast && (
          <div className={`fixed top-16 right-4 left-4 md:left-auto md:right-6 md:w-auto z-[200]
            px-4 py-3 rounded-lg font-mono text-sm shadow-xl pointer-events-none
            ${toast.type === 'ok'   ? 'bg-[#00e87a] text-black' :
              toast.type === 'err'  ? 'bg-[#ff4d4d] text-white' :
              toast.type === 'warn' ? 'bg-[#f0b429] text-black' :
                                      'bg-[#1f1f1f] text-[#e0e0e0] border border-[#2a2a2a]'}`}>
            {toast.msg}
          </div>
        )}

        {/* Proctor bar */}
        <div className="bg-[#111] border-b border-[#1f1f1f] px-4 md:px-6 py-3 sticky top-0 z-50">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <span className="w-2 h-2 bg-[#ff4d4d] rounded-full animate-pulse shrink-0" />
              <span className="hidden md:block text-xs font-mono text-[#666] uppercase tracking-wider">Live Arena</span>
              <span className="font-mono font-bold text-[#e0e0e0] text-sm truncate">{activeContest.name}</span>
            </div>
            <div className="flex items-center gap-2 md:gap-4 shrink-0">
              <div className={`font-mono text-xl md:text-2xl font-bold ${timeLeft <= 60 ? 'text-[#ff4d4d] animate-pulse' : 'text-[#00e87a]'}`}>
                {fmtTime(timeLeft)}
              </div>
              <div className={`text-xs font-mono px-2 py-1 rounded hidden sm:block
                ${strikes > 0 ? 'text-[#ff4d4d] bg-[#ff4d4d15]' : 'text-[#444]'}`}>
                ⚠ {strikes}/3
              </div>
              <button onClick={() => endContest('submitted')}
                className="px-2 md:px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#666]
                  hover:text-[#ff4d4d] hover:border-[#ff4d4d40] text-xs md:text-sm font-mono rounded-lg transition-all">
                Submit & Exit
              </button>
            </div>
          </div>

          {/* Problem tabs (multi-problem) */}
          {ids.length > 1 && (
            <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
              {ids.map((id, i) => (
                <button key={id} onClick={() => switchProblem(activeContest, i)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono whitespace-nowrap transition-all shrink-0
                    ${problemIndex === i
                      ? 'bg-[#00e87a] text-black font-bold'
                      : solved.has(id)
                        ? 'bg-[#00e87a20] text-[#00e87a]'
                        : 'bg-[#1a1a1a] text-[#666] hover:text-[#e0e0e0]'}`}>
                  {solved.has(id) ? '✓ ' : ''}Problem {i + 1}
                  {arenaProblems[id] ? ` — ${arenaProblems[id].title}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 md:p-6">
          {activeProblem ? (
            <Workspace
              problem={activeProblem}
              user={user}
              // In arena: closing a problem goes to next, doesn't exit fullscreen
              onClose={handleProblemClose}
            />
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
              <div className="text-5xl mb-4">⏳</div>
              <div className="font-mono text-[#e0e0e0] text-lg mb-2">Waiting for admin to reveal the problem…</div>
              <div className="text-sm text-[#666] font-mono mb-6">Stay on this page. The problem will appear once released.</div>
              <button onClick={loadContests} className="btn-ghost text-sm">Refresh</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Contest list view ──────────────────────────────────────
  return (
    <div>
      {toast && (
        <div className={`fixed top-20 right-4 left-4 md:left-auto md:right-6 md:w-auto z-50
          px-4 py-3 rounded-lg font-mono text-sm shadow-xl pointer-events-none
          ${toast.type === 'ok'   ? 'bg-[#00e87a] text-black' :
            toast.type === 'err'  ? 'bg-[#ff4d4d] text-white' :
            toast.type === 'warn' ? 'bg-[#f0b429] text-black' :
                                    'bg-[#1f1f1f] text-[#e0e0e0] border border-[#2a2a2a]'}`}>
          {toast.msg}
        </div>
      )}

      <div className="mb-4 md:mb-6">
        <h1 className="font-display font-bold text-xl md:text-2xl mb-1">Arena</h1>
        <p className="text-[#666] text-xs md:text-sm font-mono">
          Pay entry fee → get confirmed → compete in proctored contest
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[#666] font-mono text-sm">
          <div className="spinner" /> Scanning contests...
        </div>
      ) : contests.length === 0 ? (
        <div className="text-center py-20 text-[#444] font-mono">
          <div className="text-4xl mb-3">🏆</div>
          <div className="text-sm">No active tournaments. Ask admin to schedule a match.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {contests.map(ct => {
            const reg = userRegs.find(r => r.contest_id === ct.id);
            const problemCount = getContestProblemIds(ct).length;
            return (
              <div key={ct.id} className={`card p-4 md:p-5 flex flex-col gap-3 md:gap-4
                ${ct.status === 'live' ? 'border-[#00e87a40] shadow-[0_0_20px_rgba(0,232,122,0.08)]' :
                  ct.status === 'ended' ? 'opacity-60' : ''}`}>

                <div className="flex items-center justify-between">
                  <span className={`text-xs font-mono font-bold px-2 py-1 rounded
                    ${ct.status === 'live'     ? 'bg-[#00e87a20] text-[#00e87a]' :
                      ct.status === 'upcoming' ? 'bg-[#f0b42920] text-[#f0b429]' :
                                                 'bg-[#33333330] text-[#666]'}`}>
                    {ct.status === 'live' ? '● LIVE' : ct.status === 'upcoming' ? '◌ UPCOMING' : '✓ ENDED'}
                  </span>
                  <span className="text-[#a78bfa] font-mono font-bold text-sm">₹{ct.entry_fee}</span>
                </div>

                <div>
                  <div className="font-display font-bold text-[#e0e0e0] mb-1 text-sm md:text-base">{ct.name}</div>
                  <div className="text-xs text-[#666] font-mono">🎁 {ct.prize_note || 'Standard Allocation'}</div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { val: `${ct.duration_mins}m`,  label: 'Duration' },
                    { val: problemCount > 0 ? `${problemCount} set` : 'Hidden', label: 'Problems' },
                    { val: ct.status === 'live' ? 'Active' : ct.status === 'ended' ? 'Done' : 'Open', label: 'Phase' },
                  ].map(item => (
                    <div key={item.label} className="bg-[#0a0a0a] rounded-lg p-2">
                      <div className="text-[#e0e0e0] font-mono font-bold text-xs md:text-sm">{item.val}</div>
                      <div className="text-[10px] text-[#444] font-mono mt-0.5">{item.label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-auto">
                  {ct.status === 'ended' ? (
                    <div className="text-center text-xs text-[#444] font-mono py-2">Contest ended</div>
                  ) : reg ? (
                    <>
                      <div className={`text-xs font-mono mb-3 px-2 py-1.5 rounded text-center
                        ${reg.status === 'confirmed' ? 'bg-[#00e87a15] text-[#00e87a]' :
                          reg.status === 'pending'   ? 'bg-[#f0b42915] text-[#f0b429]' :
                                                       'bg-[#ff4d4d15] text-[#ff4d4d]'}`}>
                        {reg.status === 'confirmed' ? '✓ Confirmed & Registered' :
                         reg.status === 'pending'   ? '⏳ Payment Under Review'  :
                                                      '✗ Rejected — Re-apply'}
                      </div>
                      {reg.status === 'confirmed' && ct.status === 'live' && (
                        <button onClick={() => startContest(ct)}
                          className="w-full py-2.5 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-lg hover:bg-[#00ff88] transition-all active:scale-[0.98]">
                          Enter Live Arena →
                        </button>
                      )}
                    </>
                  ) : ct.status === 'live' ? (
                    <button disabled className="w-full py-2.5 bg-[#1a1a1a] text-[#444] font-mono text-sm rounded-lg cursor-not-allowed">
                      Registration Closed
                    </button>
                  ) : !user ? (
                    <button disabled className="w-full py-2.5 bg-[#1a1a1a] text-[#444] font-mono text-sm rounded-lg cursor-not-allowed">
                      Sign In to Register
                    </button>
                  ) : (
                    <PaymentButton
                      contest={ct} user={user}
                      onSuccess={(txnId) => { showToast(`Payment submitted! Txn: ${txnId} — Awaiting review.`, 'info'); loadContests(); }}
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