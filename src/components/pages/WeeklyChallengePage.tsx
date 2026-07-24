"use client";
// ════════════════════════════════════════════════════════════
// src/components/pages/WeeklyChallengePage.tsx
// Weekly Challenge: 3 paid problems, open all week.
// Points = base_points × time_bonus (earlier = more pts).
// ════════════════════════════════════════════════════════════
import { payWithRazorpay } from "@/lib/razorpay";
import { isActiveSubscription } from "@/lib/subscription";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { getSupabaseClient } from "@/lib/supabase";
import type { Problem, User } from "@/types/database";
import type {
  WeeklyChallenge,
  WeeklyAccess,
  WeeklySubmission as WeeklySubmissionBase,
} from "@/types/database";
import { syncMemberProgress } from "@/app/problems/Workspace";

type WeeklySubmission = WeeklySubmissionBase & { status?: string };

const Workspace = dynamic(() => import("@/app/problems/Workspace"), {
  ssr: false,
});

// ── Time bonus: 100% at week-start, 20% at week-end ─────────
function computeBonus(startsAt: string, endsAt: string): number {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const total = end - start;
  if (total <= 0) return 0.2;
  const elapsed = Math.max(0, now - start);
  const frac = Math.min(1, elapsed / total);
  // Linear decay: 1.0 → 0.2 over the week
  return 1.0 - frac * 0.8;
}

function fmtBonus(b: number) {
  return `${Math.round(b * 100)}%`;
}

function timeLeft(endsAt: string) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "Ended";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

// ── Weekly Leaderboard ───────────────────────────────────────
function WeeklyLeaderboard({ challengeId }: { challengeId: string }) {
  const [rows, setRows] = useState<
    { github: string; name: string; total: number; solved: number }[]
  >([]);

  useEffect(() => {
  const db = getSupabaseClient();

  const loadLeaderboard = () => {
    db.from("weekly_submissions")
      .select(`
        github,
        name,
        points_awarded,
        problem_id,
        submitted_at
      `)
      .eq("weekly_challenge_id", challengeId)
      .eq("status", "approved")
      .then(({ data }: any) => {
        if (!data) return;

        const map = new Map<
          string,
          {
            name: string;
            total: number;
            problems: Set<string>;
            firstSolve: string;
          }
        >();

        for (const r of data) {
          if (!map.has(r.github))
            map.set(r.github, {
              name: r.name,
              total: 0,
              problems: new Set(),
              firstSolve: r.submitted_at,
            });

          const e = map.get(r.github)!;

          e.total += r.points_awarded;
          e.problems.add(r.problem_id);

          if (
            new Date(r.submitted_at).getTime() <
            new Date(e.firstSolve).getTime()
          ) {
            e.firstSolve = r.submitted_at;
          }
        }

        const sorted = [...map.entries()]
          .map(([github, v]) => ({
            github,
            name: v.name,
            total: v.total,
            solved: v.problems.size,
            firstSolve: v.firstSolve,
          }))
          .sort((a, b) => {
            if (b.total !== a.total)
              return b.total - a.total;

            return (
              new Date(a.firstSolve).getTime() -
              new Date(b.firstSolve).getTime()
            );
          });

        setRows(sorted);
      });
  };

  loadLeaderboard();

  const channel = db
    .channel(`weekly-lb-${challengeId}-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "weekly_submissions",
      },
      () => loadLeaderboard()
    )
    .subscribe();

  return () => {
    db.removeChannel(channel);
  };
}, [challengeId]);

  if (rows.length === 0)
    return (
      <p className="text-xs text-[#999] font-mono text-center py-4">
        No submissions yet.
      </p>
    );

  return (
    <div className="space-y-1.5 mt-2">
      {rows.map((r, i) => (
        <div
          key={r.github}
          className="flex items-center gap-3 px-3 py-2 bg-[#080808] border border-[#141414] rounded-xl transition-all duration-150 hover:border-[#1c1c1c]"
        >
          <span
            className={`w-6 text-center font-mono text-xs font-bold shrink-0 ${i === 0 ? "text-[#ffd700]" : i === 1 ? "text-[#c0c0c0]" : i === 2 ? "text-[#cd7f32]" : "text-[#555] tabular-nums"}`}
          >
            {i + 1}
          </span>
          <img
            src={`https://github.com/${r.github}.png?size=24`}
            className="w-6 h-6 rounded-full"
            alt={`Profile of ${r.name}`}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <span className="flex-1 text-xs font-mono text-[#e0e0e0] truncate">
            {r.name}
          </span>
          <span className="text-[10px] font-mono text-[#999]">
            {r.solved} solved
          </span>
          <span className="text-sm font-mono font-bold text-[#a78bfa]">
            {r.total} pts
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────
interface Props {
  user: User | null;
  onNavigate?: (page: string) => void;
}

export default function WeeklyChallengePage({ user, onNavigate }: Props) {
  const [challenges,     setChallenges]     = useState<WeeklyChallenge[]>([]);
  const [isSubscribed,   setIsSubscribed]   = useState(false);
  const [subStatus,      setSubStatus]      = useState<'none' | 'pending' | 'confirmed' | 'rejected'>('none');
  const [periodEnd,      setPeriodEnd]      = useState<string | null>(null);
  const [problems,       setProblems]       = useState<Record<string, Problem>>({});
  const [mySubmissions,  setMySubmissions]  = useState<WeeklySubmission[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [activeChallenge, setActiveChallenge] = useState<WeeklyChallenge | null>(null);
  const [activeProblem,   setActiveProblem]   = useState<Problem | null>(null);
  const [showLeader,      setShowLeader]      = useState<string | null>(null);
  const [summaries,       setSummaries]       = useState<Record<string, any>>({});
  const [loadingSummary,  setLoadingSummary]  = useState<string | null>(null);
  const [fee,            setFee]            = useState<number | null>(null);
  const [submitting,     setSubmitting]     = useState(false);
  const [payErr,         setPayErr]         = useState('');

  const db = getSupabaseClient();

  useEffect(() => {
    load();
  }, [user]);

  async function load() {
    setLoading(true);
    try {
      const [{ data: ch }, { data: configs }] = await Promise.all([
        (db.from("weekly_challenges") as any).select("*").order("created_at", { ascending: false }),
        (db.from("app_config") as any).select("*").in("key", ["subscription_fee"]),
      ]);

      const list = (ch || []) as WeeklyChallenge[];
      setChallenges(list);

      for (const c of configs || []) {
        if (c.key === "subscription_fee") setFee(Number(c.value));
      }

      // Load all problems referenced
      const ids = new Set<string>();
      list.forEach((c) => (c.problem_ids || []).forEach((id: string) => ids.add(id)));
      if (ids.size) {
        const { data: probs } = await db
          .from("problems")
          .select("*")
          .in("id", Array.from(ids));
        const map: Record<string, Problem> = {};
        (probs || []).forEach((p: Problem) => { map[p.id] = p; });
        setProblems(map);
      }

      // Check subscription status
      if (user?.github) {
        const { data: sub } = await (db.from("subscribers") as any)
          .select("status, current_period_end")
          .eq("github", user.github)
          .maybeSingle();

        const status = sub?.status ?? "none";
        setSubStatus(status);
        setPeriodEnd(sub?.current_period_end ?? null);
        setIsSubscribed(isActiveSubscription(sub?.status, sub?.current_period_end));

        // Load user's weekly submissions
        const { data: subs } = await (db.from("weekly_submissions") as any)
          .select("*")
          .eq("github", user.github);
        setMySubmissions((subs || []) as WeeklySubmission[]);
      }
    } catch {}
    setLoading(false);
  }

  async function generateSummary(ch: WeeklyChallenge) {
    if (summaries[ch.id] || loadingSummary === ch.id) return;
    setLoadingSummary(ch.id);
    try {
      // Fetch leaderboard data for this challenge
      const { data: subs } = await (db.from('weekly_submissions') as any)
        .select('github, name, points_awarded, status')
        .eq('weekly_challenge_id', ch.id)
        .eq('status', 'approved')
        .order('points_awarded', { ascending: false })
        .limit(10);

      const topFinishers = (subs || []).slice(0, 3).map((s: any) => ({
        name:   s.name,
        github: s.github,
        points: s.points_awarded,
      }));

      const chProblems = (ch.problem_ids || [])
        .map(id => problems[id])
        .filter(Boolean)
        .map(p => ({ title: p.title, difficulty: p.difficulty, tags: p.tags || [] }));

      const { generateChallengeSummary } = await import('@/lib/gemini');
      const summary = await generateChallengeSummary(
        ch.title,
        chProblems,
        topFinishers,
        (subs || []).length,
      );

      if (summary) setSummaries(prev => ({ ...prev, [ch.id]: summary }));
    } catch {}
    setLoadingSummary(null);
  }

  function submitPayment() {
    if (!user || fee === null || submitting) return;
    setPayErr("");
    setSubmitting(true);

    payWithRazorpay({
      purpose: "subscription",
      name: "BitByBit",
      description: "Monthly Access — 30 days",
      prefillName: user.name,
      onSuccess: (paymentId, currentPeriodEnd) => {
        setSubStatus("confirmed");
        setIsSubscribed(true);
        if (currentPeriodEnd) setPeriodEnd(currentPeriodEnd);
        setSubmitting(false);
      },
      onFailure: (msg) => {
        setPayErr(msg);
        setSubmitting(false);
      },
    });
  }

  // Called by Workspace when a problem is submitted
  async function handleSolved(
    problemId: string,
    details?: {
      code: string;
      lang: string;
      passed: number;
      total: number;
      pointsAwarded: number;
    },
  ) {
    if (!user || !activeChallenge) return;
    const problem = problems[problemId];
    if (!problem) return;

    // Time bonus applied on top of the test-result-based points
    const bonus = computeBonus(
      activeChallenge.starts_at,
      activeChallenge.ends_at,
    );
    const basePts = details?.pointsAwarded ?? problem.points ?? 100;
    const finalPointsBase = Math.round(basePts * (1 + bonus));
    const passed = details?.passed ?? (problem.test_cases?.length || 0);
    const total = details?.total ?? (problem.test_cases?.length || 0);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingRows } = await (db.from("weekly_submissions") as any)
        .select("id, status, points_awarded")
        .eq("weekly_challenge_id", activeChallenge.id)
        .eq("problem_id", problemId)
        .eq("github", user.github)
        .limit(1);
      const prevRow = existingRows?.[0];

      // Same auto-grading rule as the regular Problems flow: if this
      // problem actually has test cases, grade and approve it right
      // now instead of waiting on manual admin review. Problems with
      // no test cases still can't be auto-verified, so those stay
      // pending for the admin.
      const canAutoGrade = total > 0;
      const isFirstSolve = prevRow?.status !== "approved";
      // Never let a resubmission lower the score already on record —
      // the time bonus naturally decays through the week, so this also
      // protects an earlier, higher-bonus attempt from being
      // overwritten by a later, lower-scoring resubmission.
      const finalPoints = canAutoGrade
        ? Math.max(finalPointsBase, prevRow?.points_awarded || 0)
        : finalPointsBase;
      const pointsDelta = canAutoGrade
        ? finalPoints - (prevRow?.points_awarded || 0)
        : 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db.from("weekly_submissions") as any).upsert(
        {
          weekly_challenge_id: activeChallenge.id,
          problem_id: problemId,
          problem_title: problem.title,
          github: user.github,
          name: user.name,
          lang: details?.lang ?? "unknown",
          code: details?.code ?? "",
          tests_passed: passed,
          tests_total: total,
          points_awarded: finalPoints,
          time_bonus: bonus,
          status: canAutoGrade ? "approved" : "pending",
          submitted_at: new Date().toISOString(),
        },
        { onConflict: "weekly_challenge_id,problem_id,github" },
      );

      if (canAutoGrade) {
        await syncMemberProgress(db, user.github, user.name, pointsDelta, isFirstSolve);
      }

      // Refresh submissions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (db.from("weekly_submissions") as any)
        .select("*")
        .eq("github", user.github);
      setMySubmissions((data || []) as WeeklySubmission[]);
    } catch {}
  }

  // ── Workspace view ──
  if (activeProblem && activeChallenge) {
    const now = Date.now();
    const isChallengeEnded = activeChallenge.status === "ended" || now > new Date(activeChallenge.ends_at).getTime();
    return (
      <Workspace
        problem={activeProblem}
        user={user}
        onClose={() => {
          setActiveProblem(null);
        }}
        onSolved={handleSolved}
        isWeekly={!isChallengeEnded}
        practiceMode={isChallengeEnded}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="spinner" />
        <span className="text-[#bbb] text-xs font-mono">
          Loading weekly challenges…
        </span>
      </div>
    );
  }

  return (
    <div className="animate-fade-up max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display font-bold text-xl md:text-2xl mb-1 text-[#e2e2e2]">
          Weekly Challenge <span className="text-[#f0b429]">🏅</span>
        </h1>
        <p className="text-[#777] text-xs font-mono">
          3 new problems every week · Subscribe once · Solve earlier for more points
        </p>
      </div>

      {/* Scoring info */}
      <div className="mb-6 bg-[#080808] border border-[#161616] rounded-2xl p-4 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[140px]">
          <p className="text-[10px] text-[#bbb] font-mono uppercase tracking-widest mb-1">
            Scoring Formula
          </p>
          <p className="text-xs text-[#e0e0e0] font-mono">
            Points = Base × Time Bonus
          </p>
        </div>
        <div className="flex-1 min-w-[140px]">
          <p className="text-[10px] text-[#bbb] font-mono uppercase tracking-widest mb-1">
            Day 1 bonus
          </p>
          <p className="text-sm font-bold text-[#00e87a] font-mono">100%</p>
        </div>
        <div className="flex-1 min-w-[140px]">
          <p className="text-[10px] text-[#bbb] font-mono uppercase tracking-widest mb-1">
            Day 7 bonus
          </p>
          <p className="text-sm font-bold text-[#f0b429] font-mono">20%</p>
        </div>
      </div>

      {/* ── Non-subscriber / expired paywall ───────────────────────────────── */}
      {!isSubscribed && (
        <div className="mb-6">
          {subStatus === 'confirmed' && periodEnd ? (
            /* Subscribed before, but this month's period has lapsed */
            <div className="bg-[#0a0a0a] border border-[#f0b42925] rounded-2xl p-6 text-center">
              <div className="text-4xl mb-3">⏳</div>
              <h2 className="font-display font-bold text-lg text-[#e0e0e0] mb-2">Your access expired</h2>
              <p className="text-[#777] font-mono text-sm mb-4">
                Your monthly access ended on {new Date(periodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Renew for ₹{fee ?? "—"} to keep going.
              </p>
              {payErr && <p className="text-[10px] text-[#ff4d4d] font-mono mb-3">{payErr}</p>}
              {process.env.NEXT_PUBLIC_PAYMENTS_LIVE === 'true' ? (
                <button
                  onClick={submitPayment}
                  disabled={submitting || fee === null}
                  className="px-5 py-2.5 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-xl hover:bg-[#00ff88] disabled:opacity-40 transition-all"
                >
                  {submitting ? 'Processing…' : `Renew — ₹${fee ?? '—'} →`}
                </button>
              ) : (
                <p className="text-[10px] text-[#555] font-mono">Renewals are temporarily unavailable. Check back shortly.</p>
              )}
            </div>
          ) : !user ? (
            /* Not signed in */
            <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-6 text-center">
              <div className="text-4xl mb-3">🔒</div>
              <h2 className="font-display font-bold text-lg text-[#e0e0e0] mb-2">Sign in to subscribe</h2>
              <p className="text-[#777] font-mono text-sm">Sign in with GitHub to get monthly access to all weekly challenges.</p>
            </div>
          ) : (
            /* Main paywall — first-time subscribe */
            <div className="bg-[#0a0a0a] border border-[#00e87a20] rounded-2xl overflow-hidden">
              {/* Hero */}
              <div className="px-5 py-5 border-b border-[#161616]">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">⭐</span>
                  <div>
                    <h2 className="font-display font-bold text-lg text-[#e0e0e0]">Monthly Access</h2>
                    <p className="text-[10px] font-mono text-[#555]">Unlock all weekly challenges, Arena contests & AI features</p>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-2xl font-display font-bold text-[#00e87a]">
                      {fee !== null ? `₹${fee}` : '—'}
                    </div>
                    <div className="text-[9px] font-mono text-[#555]">/ month</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-[10px] font-mono">
                  {['All current & future weekly problems', 'Free Arena contest entry', 'Time bonus scoring', 'Weekly leaderboard', 'AI features'].map(f => (
                    <span key={f} className="flex items-center gap-1 text-[#bbb]">
                      <span className="text-[#00e87a]">✓</span>{f}
                    </span>
                  ))}
                </div>
              </div>

              {/* Payment */}
              <div className="px-5 py-5">
                {payErr && <p className="text-[10px] text-[#ff4d4d] font-mono mb-3 text-center">{payErr}</p>}
                {process.env.NEXT_PUBLIC_PAYMENTS_LIVE === 'true' ? (
                  <>
                    <button
                      onClick={submitPayment}
                      disabled={submitting || fee === null}
                      className="w-full py-3 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-xl
                        hover:bg-[#00ff88] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {submitting ? 'Processing…' : `Pay ₹${fee ?? '—'} for 30 days →`}
                    </button>
                    <p className="text-[10px] text-[#444] font-mono text-center mt-3">
                      Secured by Razorpay · Access unlocks instantly · Renews manually every month, no auto-debit
                    </p>
                  </>
                ) : (
                  <div className="text-center">
                    <div className="w-full py-3 bg-[#1a1a1a] text-[#666] font-mono font-bold text-sm rounded-xl cursor-not-allowed">
                      We'll be back soon
                    </div>
                    <p className="text-[10px] text-[#555] font-mono mt-3">
                      Subscriptions are temporarily unavailable while we finish setting things up. Check back shortly.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active subscriber — show renewal date */}
      {isSubscribed && periodEnd && (
        <div className="mb-6 bg-[#00e87a08] border border-[#00e87a20] rounded-2xl px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-mono text-[#bbb]">
            ✓ Active — access until {new Date(periodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </span>
          {process.env.NEXT_PUBLIC_PAYMENTS_LIVE === 'true' && (
            <button
              onClick={submitPayment}
              disabled={submitting || fee === null}
              className="text-[10px] font-mono text-[#00e87a] bg-[#00e87a10] border border-[#00e87a20] px-3 py-1.5 rounded-lg hover:bg-[#00e87a18] disabled:opacity-40 transition-all"
            >
              {submitting ? 'Processing…' : `Renew early — ₹${fee ?? '—'}`}
            </button>
          )}
        </div>
      )}

      {/* ── Challenge list — shown to everyone (subscribers get full access, others see preview) ── */}
      {challenges.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="text-4xl opacity-20">📅</div>
          <p className="text-[#999] font-mono text-sm">
            No active weekly challenge right now — check back soon!
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {challenges.map((ch) => {
            const now = Date.now();
            const startMs = new Date(ch.starts_at).getTime();
            const endMs = new Date(ch.ends_at).getTime();
            const isUpcoming = now < startMs;
            const isActive = now >= startMs && now <= endMs && ch.status !== "ended";
            const isEnded = ch.status === "ended" || now > endMs;
            const bonus = computeBonus(ch.starts_at, ch.ends_at);
            const chProblems = (ch.problem_ids || []).map((id) => problems[id]).filter(Boolean);

            return (
              <div
                key={ch.id}
                className="bg-[#0a0a0a] border border-[#161616] rounded-2xl overflow-hidden transition-all duration-300 hover:border-[#1c1c1c]"
              >
                {/* Challenge header */}
                <div className="px-5 py-4 border-b border-[#1a1a1a]">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="font-mono font-bold text-[#e2e2e2] text-base">
                        {ch.title}
                      </h2>
                      {ch.description && (
                        <p className="text-xs text-[#777] font-mono mt-0.5">
                          {ch.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isActive && (
                        <span className="flex items-center gap-1 text-[10px] font-mono text-[#00e87a] bg-[#00e87a12] px-2 py-0.5 rounded-lg">
                          <span className="live-dot" />{" "}LIVE
                        </span>
                      )}
                      {isUpcoming && (
                        <span className="text-[10px] font-mono text-[#f0b429] bg-[#f0b42912] px-2 py-0.5 rounded-lg">
                          UPCOMING
                        </span>
                      )}
                      {isEnded && (
                        <span className="text-[10px] font-mono text-[#aaa] bg-[#1a1a1a] px-2 py-0.5 rounded-lg">
                          ENDED
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-4 text-[10px] font-mono text-[#999]">
                    <span>
                      📅 {new Date(ch.starts_at).toLocaleString()} –{" "}
                      {new Date(ch.ends_at).toLocaleString()}
                    </span>
                    {isUpcoming && (
                      <span className="text-[#f0b429]">
                        ⏳ Starts in {timeLeft(ch.starts_at)}
                      </span>
                    )}
                    {isActive && (
                      <span className="text-[#f0b429]">
                        ⏱ {timeLeft(ch.ends_at)}
                      </span>
                    )}
                    {isActive && isSubscribed && (
                      <span className="text-[#a78bfa]">
                        ⚡ Current bonus: {fmtBonus(bonus)}
                      </span>
                    )}
                    <span>🔓 Free with subscription</span>
                  </div>
                </div>

                {/* Problems list */}
                <div className="px-5 py-4">
                  <p className="text-[10px] text-[#666] font-mono uppercase tracking-widest mb-3">
                    Problems ({chProblems.length})
                  </p>
                  <div className="space-y-2">
                    {chProblems.length === 0 && (
                      <p className="text-xs text-[#888] font-mono">
                        Problems not yet loaded.
                      </p>
                    )}
                    {chProblems.map((p) => {
                      if (!p) return null;
                      const mySub = mySubmissions.find(
                        (s) =>
                          s.weekly_challenge_id === ch.id &&
                          s.problem_id === p.id,
                      );
                      const solved = !!mySub;

                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            if (!isSubscribed) return;
                            if (isUpcoming) return;
                            setActiveChallenge(ch);
                            setActiveProblem(p);
                          }}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-150
                            ${isSubscribed && isActive
                              ? "border-[#181818] hover:bg-[#0f0f0f] hover:border-[#00e87a15] cursor-pointer group"
                              : isSubscribed && isEnded
                              ? "border-[#a78bfa20] hover:bg-[#a78bfa08] hover:border-[#a78bfa30] cursor-pointer group"
                              : "border-[#161616] opacity-50 cursor-not-allowed select-none"
                            }`}
                        >
                          <span
                            className={`text-sm ${solved ? "text-[#00e87a]" : "text-[#888]"}`}
                          >
                            {solved ? "✓" : "◯"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span
                              className={`font-mono text-sm transition-colors truncate block
                            ${solved
                                ? "text-[#00e87a]"
                                : isSubscribed && isActive
                                  ? "text-[#e0e0e0] group-hover:text-[#00e87a]"
                                  : "text-[#aaa]"
                              }`}
                            >
                              {p.title}
                            </span>
                          </div>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg
                            ${p.difficulty === "Easy"
                              ? "text-[#00e87a] bg-[#00e87a12]"
                              : p.difficulty === "Medium"
                                ? "text-[#f0b429] bg-[#f0b42912]"
                                : "text-[#ff4d4d] bg-[#ff4d4d12]"}`}>
                            {p.difficulty}
                          </span>
                          <span className="text-xs font-mono text-[#a78bfa] font-bold">
                            {p.points} pts
                          </span>
                          {solved && mySub && (
                            <span className="text-[10px] font-mono text-[#00e87a]">
                              +{mySub.points_awarded}
                            </span>
                          )}
                          {!isSubscribed && (
                            <span className="text-[#999] text-xs">🔒</span>
                          )}
                          {isSubscribed && isUpcoming && (
                            <span className="text-[10px] font-mono text-[#f0b429]">
                              starts soon
                            </span>
                          )}
                          {isSubscribed && isEnded && !solved && (
                            <span className="text-[10px] font-mono text-[#a78bfa]">
                              🏁 practice
                            </span>
                          )}
                          {isSubscribed && isEnded && solved && (
                            <span className="text-[10px] font-mono text-[#555]">
                              ended
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Access section */}
                <div className="px-5 pb-4">
                  {!user ? (
                    <div className="text-center py-3 border border-[#1a1a1a] rounded-xl">
                      <p className="text-xs font-mono text-[#999]">Sign in with GitHub to participate</p>
                    </div>
                  ) : isSubscribed ? (
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-2 text-xs font-mono">
                        {isUpcoming ? (
                          <span className="text-[#f0b429]">
                            ✓ Subscribed — problems unlock on {new Date(ch.starts_at).toLocaleString()}
                          </span>
                        ) : isEnded ? (
                          <span className="text-[#aaa]">✓ Challenge ended</span>
                        ) : (
                          <span className="text-[#00e87a]">✓ Subscribed — solve all week!</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {ch.whatsapp_link && (
                          <a href={ch.whatsapp_link} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] text-white font-mono text-xs font-bold rounded-lg hover:bg-[#22c55e] transition-all">
                            💬 WhatsApp Group
                          </a>
                        )}
                        {!isUpcoming && (
                          <button
                            onClick={() => setShowLeader(showLeader === ch.id ? null : ch.id)}
                            className="text-xs font-mono text-[#a78bfa] hover:text-[#c4b5fd] transition-colors">
                            {showLeader === ch.id ? "Hide" : "View"} leaderboard ↕
                          </button>
                        )}
                      </div>
                    </div>
                  ) : subStatus === "confirmed" ? (
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-xs font-mono text-[#f0b429] flex-1">
                        ⏳ Your monthly access has expired — renew to continue
                      </p>
                      <button
                        onClick={() => onNavigate?.('subscribe')}
                        className="px-4 py-2 bg-[#f0b429] text-black font-mono font-bold text-xs rounded-xl hover:bg-[#fbbf24] transition-all shrink-0"
                      >
                        Renew ⭐
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-xs font-mono text-[#777] flex-1">
                        Subscribe for monthly access to all weekly challenges
                      </p>
                      <button
                        onClick={() => onNavigate?.('subscribe')}
                        className="px-4 py-2 bg-[#00e87a] text-black font-mono font-bold text-xs rounded-xl hover:bg-[#00ff88] transition-all shrink-0"
                      >
                        Subscribe ⭐
                      </button>
                    </div>
                  )}

                  {/* Leaderboard */}
                  {isSubscribed && showLeader === ch.id && (
                    <div className="mt-4 border-t border-[#1a1a1a] pt-4">
                      <p className="text-[10px] text-[#bbb] font-mono uppercase tracking-widest mb-2">
                        Weekly Leaderboard
                      </p>
                      <WeeklyLeaderboard challengeId={ch.id} />
                    </div>
                  )}

                  {/* AI Summary — only for ended challenges */}
                  {isEnded && (
                    <div className="mt-3 border-t border-[#141414] pt-3">
                      {/* Toggle button */}
                      {!summaries[ch.id] && (
                        <button
                          onClick={() => generateSummary(ch)}
                          disabled={loadingSummary === ch.id}
                          className="flex items-center gap-2 text-[10px] font-mono px-3 py-1.5
                            bg-[#a78bfa10] border border-[#a78bfa20] text-[#a78bfa] rounded-lg
                            hover:bg-[#a78bfa18] disabled:opacity-50 transition-all"
                        >
                          {loadingSummary === ch.id ? (
                            <><span className="w-2.5 h-2.5 border border-[#a78bfa] border-t-transparent rounded-full animate-spin inline-block" /> Generating summary…</>
                          ) : '✦ Generate AI Summary'}
                        </button>
                      )}

                      {/* Summary card */}
                      {summaries[ch.id] && (
                        <div className="bg-[#0a0a0a] border border-[#a78bfa20] rounded-xl p-4 space-y-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[#a78bfa] text-xs">✦</span>
                            <span className="text-[10px] font-mono font-bold text-[#a78bfa] uppercase tracking-widest">
                              Challenge Summary
                            </span>
                          </div>

                          {[
                            { icon: '🧠', label: 'Concept tested',    text: summaries[ch.id].concept },
                            { icon: '⚡', label: 'Optimal approach',  text: summaries[ch.id].optimalApproach },
                            { icon: '⚠️', label: 'Common mistakes',   text: summaries[ch.id].commonMistakes },
                            { icon: '🏆', label: 'Top finishers',     text: summaries[ch.id].shoutout },
                            { icon: '💪', label: 'Keep going',        text: summaries[ch.id].closing },
                          ].map(({ icon, label, text }) => text ? (
                            <div key={label} className="flex gap-2.5 items-start">
                              <span className="text-sm shrink-0 mt-0.5">{icon}</span>
                              <div>
                                <div className="text-[9px] font-mono text-[#555] uppercase tracking-widest mb-0.5">
                                  {label}
                                </div>
                                <p className="text-[11px] font-mono text-[#bbb] leading-relaxed">
                                  {text}
                                </p>
                              </div>
                            </div>
                          ) : null)}

                          <button
                            onClick={() => generateSummary(ch)}
                            disabled={loadingSummary === ch.id}
                            className="text-[9px] font-mono text-[#444] hover:text-[#a78bfa] transition-colors mt-1"
                          >
                            ↻ Regenerate
                          </button>
                        </div>
                      )}
                    </div>
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