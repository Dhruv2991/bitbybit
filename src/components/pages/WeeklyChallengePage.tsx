"use client";
// ════════════════════════════════════════════════════════════
// src/components/pages/WeeklyChallengePage.tsx
// Weekly Challenge: 3 paid problems, open all week.
// Points = base_points × time_bonus (earlier = more pts).
// ════════════════════════════════════════════════════════════
import { payWithRazorpay } from "@/lib/razorpay";
import { isActiveSubscription } from "@/lib/subscription";
import { PRICING_CONFIG, formatPrice } from "@/lib/pricing";
import { setAiUser } from "@/lib/gemini";
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
      <p className="text-xs text-slate-500 dark:text-[#999] font-mono text-center py-4">
        No submissions yet.
      </p>
    );

  return (
    <div className="space-y-1.5 mt-2">
      {rows.map((r, i) => (
        <div
          key={r.github}
          className="flex items-center gap-3 px-3 py-2 bg-slate-50 dark:bg-[#080808] border border-slate-200/80 dark:border-[#141414] rounded-xl transition-all duration-150 hover:border-slate-300 dark:hover:border-[#1c1c1c]"
        >
          <span
            className={`w-6 text-center font-mono text-xs font-bold shrink-0 ${i === 0 ? "text-amber-500 dark:text-[#ffd700]" : i === 1 ? "text-slate-400 dark:text-[#c0c0c0]" : i === 2 ? "text-amber-700 dark:text-[#cd7f32]" : "text-slate-400 dark:text-[#555] tabular-nums"}`}
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
          <span className="flex-1 text-xs font-mono text-slate-800 dark:text-[#e0e0e0] truncate font-medium">
            {r.name}
          </span>
          <span className="text-[10px] font-mono text-slate-500 dark:text-[#999]">
            {r.solved} solved
          </span>
          <span className="text-sm font-mono font-bold text-purple-600 dark:text-[#a78bfa]">
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
  const [expandedMonths,  setExpandedMonths]  = useState<Record<string, boolean>>({});
  const [summaries,       setSummaries]       = useState<Record<string, any>>({});
  const [loadingSummary,  setLoadingSummary]  = useState<string | null>(null);
  const [summaryErrors,   setSummaryErrors]   = useState<Record<string, string>>({});
  const [fee,            setFee]            = useState<number | null>(PRICING_CONFIG.defaultMonthlyFee);
  const [submitting,     setSubmitting]     = useState(false);
  const [payErr,         setPayErr]         = useState('');

  // Ticks every second so the countdown + decaying bonus bar update live
  // instead of only refreshing on unrelated re-renders.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

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
        let probs: any[] | null = null;
        try {
          const res1 = await db
            .from("problems")
            .select("id, title, difficulty, points, tags, visibility, is_contest_problem, submission_count, created_at, updated_at, sample_test_cases, test_cases")
            .in("id", Array.from(ids));
          if (!res1.error && res1.data) probs = res1.data;
        } catch {}

        if (!probs) {
          try {
            const res2 = await db
              .from("problems")
              .select("id, title, difficulty, points, tags, visibility, is_contest_problem, submission_count, created_at, updated_at, test_cases")
              .in("id", Array.from(ids));
            if (!res2.error && res2.data) probs = res2.data;
          } catch {}
        }

        if (!probs) {
          const res3 = await db
            .from("problems")
            .select("id, title, difficulty, points, tags, visibility, is_contest_problem, submission_count, created_at, updated_at")
            .in("id", Array.from(ids));
          probs = res3.data;
        }

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
        const isSub = isActiveSubscription(sub?.status, sub?.current_period_end);
        setIsSubscribed(isSub);
        setAiUser(user.github, isSub);

        // Load user's weekly submissions
        const { data: subs } = await (db.from("weekly_submissions") as any)
          .select("*")
          .eq("github", user.github);
        setMySubmissions((subs || []) as WeeklySubmission[]);
      } else {
        setAiUser("", false);
      }
    } catch {}
    setLoading(false);
  }

  async function generateSummary(ch: WeeklyChallenge) {
    if (summaries[ch.id] || loadingSummary === ch.id) return;
    setSummaryErrors(prev => ({ ...prev, [ch.id]: '' }));
    setLoadingSummary(ch.id);

    try {
      if (!user) {
        throw new Error("Sign in with GitHub to generate an AI summary.");
      }
      if (!isSubscribed) {
        throw new Error("AI Challenge Summaries are available exclusively to Pro subscribers. Upgrade to Pro to view AI analysis.");
      }

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

      if (summary) {
        setSummaries(prev => ({ ...prev, [ch.id]: summary }));
      } else {
        throw new Error("Unable to generate summary. Please try again.");
      }
    } catch (err: any) {
      console.error("Failed to generate challenge summary:", err);
      setSummaryErrors(prev => ({
        ...prev,
        [ch.id]: err.message || "Failed to generate AI summary. Please try again.",
      }));
    } finally {
      setLoadingSummary(null);
    }
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

    try {
      // Submissions and points are already verified and written server-side by /api/execute.
      // Refresh user's submissions list from database:
      // eslint-disable-next-line
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

  // Renders one challenge card — shared between the standalone live
  // card and the cards nested inside a collapsed month group, so this
  // long, detail-heavy markup only has to exist once.
  function renderChallengeCard(ch: WeeklyChallenge) {
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
                className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs"
              >
                {/* Challenge header */}
                <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800/80">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="font-display font-semibold text-slate-900 dark:text-zinc-100 text-base">
                        {ch.title}
                      </h2>
                      {ch.description && (
                        <p className="text-xs text-slate-600 dark:text-zinc-400 font-sans mt-0.5">
                          {ch.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isActive && (
                        <span className="flex items-center gap-1.5 text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" /> LIVE
                        </span>
                      )}
                      {isUpcoming && (
                        <span className="text-[10px] font-mono font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                          UPCOMING
                        </span>
                      )}
                      {isEnded && (
                        <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/60 px-2 py-0.5 rounded-full">
                          ENDED
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-4 text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                    <span>
                      📅 {new Date(ch.starts_at).toLocaleDateString()} –{" "}
                      {new Date(ch.ends_at).toLocaleDateString()}
                    </span>
                    {isUpcoming && (
                      <span className="text-amber-600 dark:text-amber-400">
                        ⏳ Starts in {timeLeft(ch.starts_at)}
                      </span>
                    )}
                    {isActive && (
                      <span className="text-amber-600 dark:text-amber-400">
                        ⏱ {timeLeft(ch.ends_at)}
                      </span>
                    )}
                    {isActive && isSubscribed && (
                      <span className="text-cyan-600 dark:text-cyan-400">
                        ⚡ Current bonus: {fmtBonus(bonus)}
                      </span>
                    )}
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Included with subscription</span>
                  </div>

                  {isActive && isSubscribed && (
                    <div className="mt-3">
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-zinc-950 rounded-full overflow-hidden border border-slate-200 dark:border-zinc-800/60">
                        <div
                          className="h-full rounded-full transition-all duration-1000 ease-linear bg-cyan-500 dark:bg-cyan-400 shadow-xs"
                          style={{
                            width: `${Math.max(0, Math.min(100, ((bonus - 0.2) / 0.8) * 100))}%`,
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono mt-1">
                        Bonus decays from 100% → 20% over the week — solve sooner to lock in more.
                      </p>
                    </div>
                  )}
                </div>

                {/* Problems list */}
                <div className="px-5 py-4">
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono uppercase tracking-widest mb-3">
                    Problems ({chProblems.length})
                  </p>
                  <div className="space-y-2">
                    {chProblems.length === 0 && (
                      <p className="text-xs text-slate-500 dark:text-zinc-500 font-mono">
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
                            if (!user) {
                              const db = getSupabaseClient();
                              db.auth.signInWithOAuth({
                                provider: "github",
                                options: { redirectTo: window.location.href, queryParams: { prompt: "select_account" } },
                              });
                              return;
                            }
                            if (!isSubscribed) return;
                            if (isUpcoming) return;
                            setActiveChallenge(ch);
                            setActiveProblem(p);
                          }}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-150
                            ${!user
                              ? "border-slate-200/80 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-950/40 hover:bg-slate-100/80 dark:hover:bg-zinc-900/80 hover:border-slate-300 dark:hover:border-zinc-700 cursor-pointer group"
                              : isSubscribed && isActive
                              ? "border-slate-200/80 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-950/40 hover:bg-slate-100/80 dark:hover:bg-zinc-900/80 hover:border-slate-300 dark:hover:border-zinc-700 cursor-pointer group"
                              : isSubscribed && isEnded
                              ? "border-slate-200/80 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-950/40 hover:bg-slate-100/60 dark:hover:bg-zinc-900/60 hover:border-slate-300 dark:hover:border-zinc-700 cursor-pointer group"
                              : "border-slate-200/50 dark:border-zinc-800/40 bg-slate-50/30 dark:bg-zinc-950/20 opacity-50 cursor-not-allowed select-none"
                            }`}
                        >
                          <span
                            className={`text-sm ${solved ? "text-emerald-500 dark:text-emerald-400" : "text-slate-400 dark:text-zinc-600"}`}
                          >
                            {solved ? "✓" : "◯"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span
                              className={`font-mono text-sm transition-colors truncate block
                            ${solved
                                ? "text-emerald-600 dark:text-emerald-400"
                                : isSubscribed && isActive
                                  ? "text-slate-800 group-hover:text-slate-950 dark:text-zinc-200 dark:group-hover:text-zinc-100"
                                  : "text-slate-400 dark:text-zinc-500"
                              }`}
                            >
                              {p.title}
                            </span>
                          </div>
                          <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded border
                            ${p.difficulty === "Easy"
                              ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                              : p.difficulty === "Medium"
                                ? "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20"
                                : "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20"}`}>
                            {p.difficulty}
                          </span>
                          <span className="text-xs font-mono text-cyan-600 dark:text-cyan-400 font-semibold">
                            {p.points} pts
                          </span>
                          {solved && mySub && (
                            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                              +{mySub.points_awarded}
                            </span>
                          )}
                          {!isSubscribed && (
                            <span className="text-slate-400 dark:text-zinc-500 text-xs">🔒</span>
                          )}
                          {isSubscribed && isUpcoming && (
                            <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400">
                              starts soon
                            </span>
                          )}
                          {isSubscribed && isEnded && !solved && (
                            <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400">
                              🏁 practice
                            </span>
                          )}
                          {isSubscribed && isEnded && solved && (
                            <span className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">
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
                    <button
                      onClick={async () => {
                        const db = getSupabaseClient();
                        await db.auth.signInWithOAuth({
                          provider: "github",
                          options: { redirectTo: window.location.href, queryParams: { prompt: "select_account" } },
                        });
                      }}
                      className="w-full py-2.5 px-4 rounded-xl font-mono text-xs font-semibold bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white dark:from-cyan-400 dark:to-cyan-500 dark:text-zinc-950 transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Sign in with GitHub to participate</span>
                      <span>→</span>
                    </button>
                  ) : isSubscribed ? (
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-2 text-xs font-mono">
                        {isUpcoming ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            ✓ Subscribed — problems unlock on {new Date(ch.starts_at).toLocaleString()}
                          </span>
                        ) : isEnded ? (
                          <span className="text-slate-500 dark:text-zinc-400">✓ Challenge ended</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Subscribed — solve all week!</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {ch.whatsapp_link && (
                          <a href={ch.whatsapp_link} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white font-mono text-xs font-medium rounded-lg hover:bg-emerald-500 transition-all shadow-xs">
                            💬 WhatsApp Group
                          </a>
                        )}
                        {!isUpcoming && (
                          <button
                            onClick={() => setShowLeader(showLeader === ch.id ? null : ch.id)}
                            className="text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 transition-colors">
                            {showLeader === ch.id ? "Hide" : "View"} leaderboard ↕
                          </button>
                        )}
                      </div>
                    </div>
                  ) : subStatus === "confirmed" ? (
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-xs font-mono text-amber-600 dark:text-amber-400 flex-1">
                        ⏳ Your monthly access has expired — renew to continue
                      </p>
                      <button
                        onClick={() => onNavigate?.('subscribe')}
                        className="px-4 py-2 bg-amber-500 text-zinc-950 font-mono font-semibold text-xs rounded-xl hover:bg-amber-400 transition-all shrink-0 shadow-xs"
                      >
                        Renew ⭐
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-xs font-mono text-slate-600 dark:text-zinc-400 flex-1">
                        Subscribe for monthly access to all weekly challenges
                      </p>
                      <button
                        onClick={() => onNavigate?.('subscribe')}
                        className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white dark:from-cyan-400 dark:to-cyan-500 dark:text-zinc-950 font-mono font-semibold text-xs rounded-xl transition-all shrink-0 shadow-xs"
                      >
                        Subscribe ⭐
                      </button>
                    </div>
                  )}

                  {/* Leaderboard */}
                  {isSubscribed && showLeader === ch.id && (
                    <div className="mt-4 border-t border-slate-100 dark:border-zinc-800/60 pt-4">
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono uppercase tracking-widest mb-2">
                        Weekly Leaderboard
                      </p>
                      <WeeklyLeaderboard challengeId={ch.id} />
                    </div>
                  )}

                  {/* AI Summary — only for ended challenges */}
                  {isEnded && (
                    <div className="mt-3 border-t border-slate-100 dark:border-zinc-800/60 pt-3">
                      {!summaries[ch.id] && (
                        <div className="space-y-2.5">
                          <button
                            onClick={() => generateSummary(ch)}
                            disabled={loadingSummary === ch.id}
                            className="flex items-center gap-2 text-[10px] font-mono px-3 py-1.5
                              bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-300 rounded-lg
                              hover:bg-cyan-500/15 disabled:opacity-50 transition-all shadow-xs"
                          >
                            {loadingSummary === ch.id ? (
                              <><span className="w-2.5 h-2.5 border border-cyan-500 border-t-transparent rounded-full animate-spin inline-block" /> Generating summary…</>
                            ) : '✦ Generate AI Summary'}
                          </button>

                          {summaryErrors[ch.id] && (
                            <div className="text-xs p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <span>{summaryErrors[ch.id]}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                {!user ? (
                                  <button
                                    onClick={async () => {
                                      const db = getSupabaseClient();
                                      await db.auth.signInWithOAuth({
                                        provider: "github",
                                        options: { redirectTo: window.location.href, queryParams: { prompt: "select_account" } },
                                      });
                                    }}
                                    className="px-2.5 py-1 text-[11px] font-mono font-medium rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-700 dark:text-rose-300 transition-colors"
                                  >
                                    Sign In with GitHub →
                                  </button>
                                ) : !isSubscribed ? (
                                  <a
                                    href="/pricing"
                                    onClick={(e) => {
                                      if (onNavigate) {
                                        e.preventDefault();
                                        onNavigate("pricing");
                                      }
                                    }}
                                    className="px-2.5 py-1 text-[11px] font-mono font-medium rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 transition-colors"
                                  >
                                    Upgrade to Pro →
                                  </a>
                                ) : (
                                  <button
                                    onClick={() => generateSummary(ch)}
                                    className="px-2.5 py-1 text-[11px] font-mono font-medium rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-700 dark:text-rose-300 transition-colors"
                                  >
                                    Try Again
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {summaries[ch.id] && (
                        <div className="bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800/80 rounded-xl p-4 space-y-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-cyan-600 dark:text-cyan-400 text-xs">✦</span>
                            <span className="text-[10px] font-mono font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-widest">
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
                                <div className="text-[9px] font-mono text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-0.5">
                                  {label}
                                </div>
                                <p className="text-xs font-sans text-slate-700 dark:text-zinc-300 leading-relaxed">
                                  {text}
                                </p>
                              </div>
                            </div>
                          ) : null)}

                          {summaryErrors[ch.id] && (
                            <div className="text-xs p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400">
                              {summaryErrors[ch.id]}
                            </div>
                          )}

                          <button
                            onClick={() => generateSummary(ch)}
                            disabled={loadingSummary === ch.id}
                            className="text-[10px] font-mono text-slate-400 dark:text-zinc-500 hover:text-cyan-600 dark:hover:text-cyan-400 disabled:opacity-50 transition-colors mt-1 flex items-center gap-1.5"
                          >
                            {loadingSummary === ch.id ? (
                              <><span className="w-2.5 h-2.5 border border-cyan-500 border-t-transparent rounded-full animate-spin inline-block" /> Regenerating…</>
                            ) : (
                              '↻ Regenerate'
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
  }

  const nowTs = Date.now();
  const liveChallenge = challenges.find((ch) => {
    const startMs = new Date(ch.starts_at).getTime();
    const endMs = new Date(ch.ends_at).getTime();
    return nowTs >= startMs && nowTs <= endMs && ch.status !== "ended";
  });
  const otherChallenges = challenges.filter((ch) => ch.id !== liveChallenge?.id);

  const monthGroups = new Map<string, WeeklyChallenge[]>();
  for (const ch of otherChallenges) {
    const d = new Date(ch.starts_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthGroups.has(key)) monthGroups.set(key, []);
    monthGroups.get(key)!.push(ch);
  }
  const monthKeys = [...monthGroups.keys()].sort().reverse();
  const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="animate-fade-up max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display font-semibold text-xl md:text-2xl mb-1 text-slate-900 dark:text-zinc-100">
          Weekly Challenge <span className="text-amber-500">🏅</span>
        </h1>
        <p className="text-slate-500 dark:text-zinc-400 text-xs font-mono">
          3 new problems every week · Subscribe once · Solve earlier for more points
        </p>
      </div>

      {/* Scoring info */}
      <div className="mb-6 bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-4 flex flex-wrap gap-4 shadow-xs">
        <div className="flex-1 min-w-[140px]">
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono uppercase tracking-widest mb-1">
            Scoring Formula
          </p>
          <p className="text-xs text-slate-800 dark:text-zinc-200 font-mono">
            Points = Base × Time Bonus
          </p>
        </div>
        <div className="flex-1 min-w-[140px]">
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono uppercase tracking-widest mb-1">
            Day 1 bonus
          </p>
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 font-mono">100%</p>
        </div>
        <div className="flex-1 min-w-[140px]">
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono uppercase tracking-widest mb-1">
            Day 7 bonus
          </p>
          <p className="text-sm font-semibold text-amber-600 dark:text-amber-400 font-mono">20%</p>
        </div>
      </div>

      {/* ── Non-subscriber / expired paywall ───────────────────────────────── */}
      {!isSubscribed && (
        <div className="mb-6">
          {subStatus === 'confirmed' && periodEnd ? (
            <div className="bg-white dark:bg-zinc-900/50 border border-amber-500/25 rounded-2xl p-6 text-center shadow-xs">
              <div className="text-4xl mb-3">⏳</div>
              <h2 className="font-display font-semibold text-lg text-slate-900 dark:text-zinc-100 mb-2">Your access expired</h2>
              <p className="text-slate-600 dark:text-zinc-400 font-mono text-sm mb-4">
                Your monthly access ended on {new Date(periodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}. Renew for {formatPrice(fee)} to keep going.
              </p>
              {payErr && <p className="text-xs text-rose-500 dark:text-rose-400 font-mono mb-3">{payErr}</p>}
              {process.env.NEXT_PUBLIC_PAYMENTS_LIVE === 'true' ? (
                <button
                  onClick={submitPayment}
                  disabled={submitting || fee === null}
                  className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white dark:from-cyan-400 dark:to-cyan-500 dark:text-zinc-950 font-mono font-semibold text-sm rounded-xl hover:opacity-95 shadow-xs disabled:opacity-40 transition-all"
                >
                  {submitting ? 'Processing…' : `Renew — ${formatPrice(fee)} →`}
                </button>
              ) : (
                <p className="text-xs text-slate-400 dark:text-zinc-500 font-mono">Renewals are temporarily unavailable. Check back shortly.</p>
              )}
            </div>
          ) : !user ? (
            <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-6 text-center shadow-xs">
              <div className="text-4xl mb-3">🔒</div>
              <h2 className="font-display font-semibold text-lg text-slate-900 dark:text-zinc-100 mb-2">Sign in to subscribe</h2>
              <p className="text-slate-600 dark:text-zinc-400 font-mono text-sm mb-4">Sign in with GitHub to get monthly access to all weekly challenges.</p>
              <button
                onClick={async () => {
                  const db = getSupabaseClient();
                  await db.auth.signInWithOAuth({
                    provider: "github",
                    options: { redirectTo: window.location.href, queryParams: { prompt: "select_account" } },
                  });
                }}
                className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white dark:from-cyan-400 dark:to-cyan-500 dark:text-zinc-950 font-mono font-semibold text-xs rounded-xl transition-all shadow-xs inline-flex items-center gap-2 cursor-pointer"
              >
                <span>Sign in with GitHub</span>
                <span>→</span>
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs">
              {/* Hero */}
              <div className="px-5 py-5 border-b border-slate-100 dark:border-zinc-800/80">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">⭐</span>
                  <div>
                    <h2 className="font-display font-semibold text-lg text-slate-900 dark:text-zinc-100">Monthly Access</h2>
                    <p className="text-xs font-sans text-slate-600 dark:text-zinc-400">Unlock all weekly challenges, Arena contests & AI features</p>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-2xl font-display font-bold text-cyan-600 dark:text-cyan-400">
                      {formatPrice(fee)}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 dark:text-zinc-500">/ {PRICING_CONFIG.periodUnit}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs font-sans">
                  {['All current & future weekly problems', 'Free Arena contest entry', 'Time bonus scoring', 'Weekly leaderboard', 'AI features'].map(f => (
                    <span key={f} className="flex items-center gap-1.5 text-slate-700 dark:text-zinc-300">
                      <span className="text-emerald-500 dark:text-emerald-400">✓</span>{f}
                    </span>
                  ))}
                </div>
              </div>

              {/* Payment */}
              <div className="px-5 py-5">
                {payErr && <p className="text-xs text-rose-500 dark:text-rose-400 font-mono mb-3 text-center">{payErr}</p>}
                {process.env.NEXT_PUBLIC_PAYMENTS_LIVE === 'true' ? (
                  <>
                    <button
                      onClick={submitPayment}
                      disabled={submitting || fee === null}
                      className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white dark:from-cyan-400 dark:to-cyan-500 dark:text-zinc-950 font-mono font-bold text-sm rounded-xl
                        hover:opacity-95 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {submitting ? 'Processing…' : `Pay ${formatPrice(fee)} for 30 days →`}
                    </button>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-500 font-mono text-center mt-3">
                      Secured by Razorpay · Access unlocks instantly · Renews manually every month, no auto-debit
                    </p>
                  </>
                ) : (
                  <div className="text-center">
                    <div className="w-full py-2.5 bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-500 font-mono font-semibold text-sm rounded-xl cursor-not-allowed">
                      We'll be back soon
                    </div>
                    <p className="text-xs text-slate-400 dark:text-zinc-500 font-mono mt-3">
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
        <div className="mb-6 bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl px-4 py-3 flex items-center justify-between flex-wrap gap-2 shadow-xs">
          <span className="text-xs font-mono text-slate-700 dark:text-zinc-300">
            ✓ Active — access until {new Date(periodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </span>
          {process.env.NEXT_PUBLIC_PAYMENTS_LIVE === 'true' && (
            <button
              onClick={submitPayment}
              disabled={submitting || fee === null}
              className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 rounded-lg hover:bg-cyan-500/15 disabled:opacity-40 transition-all shadow-xs"
            >
              {submitting ? 'Processing…' : `Renew early — ${formatPrice(fee)}`}
            </button>
          )}
        </div>
      )}

      {/* ── Challenge list ── */}
      {challenges.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="text-4xl opacity-20">📅</div>
          <p className="text-slate-500 dark:text-zinc-400 font-mono text-sm">
            No active weekly challenge right now — check back soon!
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {liveChallenge && renderChallengeCard(liveChallenge)}

          {monthKeys.map((key) => {
            const group = monthGroups.get(key)!;
            const [y, m] = key.split('-');
            const label = new Date(Number(y), Number(m) - 1, 1)
              .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            const isOpen = expandedMonths[key] ?? (key === currentMonthKey);
            return (
              <div key={key} className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs">
                <button
                  onClick={() => setExpandedMonths((prev) => ({ ...prev, [key]: !isOpen }))}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-zinc-900/80 transition-colors"
                >
                  <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200 text-sm flex items-center gap-2">
                    📅 {label}
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-normal">
                      ({group.length} challenge{group.length !== 1 ? 's' : ''})
                    </span>
                  </span>
                  <span className={`text-slate-400 dark:text-zinc-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-4 border-t border-slate-100 dark:border-zinc-800/80 pt-4">
                    {group.map((ch) => renderChallengeCard(ch))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
