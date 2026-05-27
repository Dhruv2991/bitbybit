'use client';
// ════════════════════════════════════════════════════════════
// src/components/pages/ArenaPage.tsx — original UI + live problem load
// ════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import dynamic                         from 'next/dynamic';
import { getSupabaseClient }           from '@/lib/supabase';
import PaymentButton                   from '@/components/arena/PaymentButton';
import type { Contest, ContestRegistration, Problem, User } from '@/types/database';

const Workspace = dynamic(() => import('@/app/problems/Workspace'), { ssr: false });

interface ArenaPageProps {
  user:              User | null;
  onArenaLockChange: (locked: boolean) => void;
}

export default function ArenaPage({ user, onArenaLockChange }: ArenaPageProps) {
  const db = getSupabaseClient();
  const [contests,      setContests]      = useState<Contest[]>([]);
  const [userRegs,      setUserRegs]      = useState<ContestRegistration[]>([]);
  const [arenaProblems, setArenaProblems] = useState<Record<string, Problem>>({});
  const [loading,       setLoading]       = useState(true);
  const [toast,         setToast]         = useState<{ msg: string; type: 'ok' | 'err' | 'info' } | null>(null);
  const [activeContest, setActiveContest] = useState<Contest | null>(null);
  const [strikes,       setStrikes]       = useState(0);
  const [timeLeft,      setTimeLeft]      = useState(0);
  const timerRef   = useRef<NodeJS.Timeout | null>(null);
  const visHandler = useRef<(() => void) | null>(null);

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

      // Pre-fetch problems for live contests so arena can show them immediately
      const problemIds = contestList
        .filter(ct => ct.problem_id && ct.status === 'live')
        .map(ct => ct.problem_id!);
      if (problemIds.length) {
        const { data: probs } = await db.from('problems').select('*').in('id', problemIds);
        const map: Record<string, Problem> = {};
        (probs || []).forEach((p: Problem) => { map[p.id] = p; });
        setArenaProblems(map);
      }
    } catch {}
    setLoading(false);
  }

  function showToast(msg: string, type: 'ok' | 'err' | 'info' = 'info') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  function handlePaySuccess(contestId: string, txnId: string) {
    showToast(`Payment submitted! Txn: ${txnId} — Awaiting admin review.`, 'info');
    loadContests();
  }

  async function startContest(contest: Contest) {
    if (!user) { showToast('Sign in required', 'err'); return; }
    try { await document.documentElement.requestFullscreen?.(); } catch {}

    setActiveContest(contest);
    setStrikes(0);
    setTimeLeft(contest.duration_mins * 60);
    onArenaLockChange(true);

    visHandler.current = () => {
      if (document.hidden) {
        setStrikes(s => {
          const next = s + 1;
          if (next >= 3) endContest('disqualified');
          return next;
        });
      }
    };
    document.addEventListener('visibilitychange', visHandler.current);

    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { endContest('submitted'); return 0; }
        return t - 1;
      });
    }, 1000);
  }

  function endContest(status: 'submitted' | 'disqualified') {
    if (timerRef.current) clearInterval(timerRef.current);
    if (visHandler.current) document.removeEventListener('visibilitychange', visHandler.current);
    setActiveContest(null);
    onArenaLockChange(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    showToast(
      status === 'disqualified' ? '❌ Disqualified — too many violations.' : '✅ Contest ended.',
      status === 'disqualified' ? 'err' : 'ok'
    );
  }

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Active arena view ────────────────────────────────────
  if (activeContest) {
    const contestProblem = activeContest.problem_id
      ? arenaProblems[activeContest.problem_id]
      : null;

    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        {/* Proctor bar */}
        <div className="bg-[#111] border-b border-[#1f1f1f] px-6 py-3 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 bg-[#ff4d4d] rounded-full animate-pulse" />
            <span className="text-xs font-mono text-[#666] uppercase tracking-wider">Live Arena</span>
            <span className="font-mono font-bold text-[#e0e0e0]">{activeContest.name}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="font-mono text-2xl font-bold text-[#00e87a]">{fmtTime(timeLeft)}</div>
            <div className={`text-xs font-mono px-2 py-1 rounded
              ${strikes > 0 ? 'text-[#ff4d4d] bg-[#ff4d4d15]' : 'text-[#444]'}`}>
              ⚠ Strikes: {strikes}/3
            </div>
            <button
              onClick={() => endContest('submitted')}
              className="px-3 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] text-[#666]
                hover:text-[#ff4d4d] hover:border-[#ff4d4d40] text-sm font-mono rounded-lg transition-all"
            >
              Submit & Exit
            </button>
          </div>
        </div>

        <div className="p-6">
          {contestProblem ? (
            <Workspace
              problem={contestProblem}
              user={user}
              onClose={() => endContest('submitted')}
            />
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
              <div className="text-5xl mb-4">⏳</div>
              <div className="font-mono text-[#e0e0e0] text-lg mb-2">Waiting for admin to reveal the problem…</div>
              <div className="text-sm text-[#666] font-mono mb-6">Stay on this page. The problem will appear here once released.</div>
              <button
                onClick={loadContests}
                className="btn-ghost text-sm"
              >
                Refresh
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {toast && (
        <div className={`fixed top-20 right-6 z-50 px-4 py-3 rounded-lg font-mono text-sm shadow-xl
          ${toast.type === 'ok'  ? 'bg-[#00e87a] text-black' :
            toast.type === 'err' ? 'bg-[#ff4d4d] text-white' :
                                   'bg-[#1f1f1f] text-[#e0e0e0]'}`}>
          {toast.msg}
        </div>
      )}

      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl mb-1">Arena</h1>
        <p className="text-[#666] text-sm font-mono">
          Pay entry fee → get confirmed → compete in proctored contest
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[#666] font-mono">
          <div className="spinner" /> Scanning contests...
        </div>
      ) : contests.length === 0 ? (
        <div className="text-center py-20 text-[#444] font-mono">
          <div className="text-4xl mb-3">🏆</div>
          <div>No active tournaments. Ask admin to schedule a match.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contests.map(ct => {
            const reg = userRegs.find(r => r.contest_id === ct.id);
            return (
              <div key={ct.id} className={`card p-5 flex flex-col gap-4
                ${ct.status === 'live'
                  ? 'border-[#00e87a40] shadow-[0_0_20px_rgba(0,232,122,0.08)]'
                  : ct.status === 'ended' ? 'opacity-60' : ''}`}>

                <div className="flex items-center justify-between">
                  <span className={`text-xs font-mono font-bold px-2 py-1 rounded
                    ${ct.status === 'live'     ? 'bg-[#00e87a20] text-[#00e87a]' :
                      ct.status === 'upcoming' ? 'bg-[#f0b42920] text-[#f0b429]' :
                                                 'bg-[#33333330] text-[#666]'}`}>
                    {ct.status === 'live'     ? '● LIVE'     :
                     ct.status === 'upcoming' ? '◌ UPCOMING' : '✓ ENDED'}
                  </span>
                  <span className="text-[#a78bfa] font-mono font-bold text-sm">₹{ct.entry_fee}</span>
                </div>

                <div>
                  <div className="font-display font-bold text-[#e0e0e0] mb-1">{ct.name}</div>
                  <div className="text-xs text-[#666] font-mono">🎁 {ct.prize_note || 'Standard Allocation'}</div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { val: `${ct.duration_mins}m`, label: 'Duration' },
                    { val: ct.status === 'live' ? 'Active' : ct.status === 'ended' ? 'Done' : 'Open', label: 'Phase' },
                    { val: ct.problem_id ? 'Set' : 'Hidden', label: 'Problem' },
                  ].map(item => (
                    <div key={item.label} className="bg-[#0a0a0a] rounded-lg p-2">
                      <div className="text-[#e0e0e0] font-mono font-bold text-sm">{item.val}</div>
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
                        <button
                          onClick={() => startContest(ct)}
                          className="w-full py-2.5 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-lg hover:bg-[#00ff88] transition-all"
                        >
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
                      contest={ct}
                      user={user}
                      onSuccess={(txnId) => handlePaySuccess(ct.id, txnId)}
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
