"use client";
// ════════════════════════════════════════════════════════════
// src/components/pages/WeeklyChallengePage.tsx
// Weekly Challenge: 3 paid problems, open all week.
// Points = base_points × time_bonus (earlier = more pts).
// ════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { getSupabaseClient } from "@/lib/supabase";
import type { Problem, User } from "@/types/database";
import type {
  WeeklyChallenge,
  WeeklyAccess,
  WeeklySubmission,
} from "@/types/database";

const Workspace = dynamic(() => import("@/app/problems/Workspace"), {
  ssr: false,
});

// ── QR / Payment helpers (reused from PaymentButton) ────────
declare global {
  interface Window {
    _wqrLoaded?: boolean;
    _wqrCbs?: Array<() => void>;
  }
}
function loadQrScript(cb: () => void) {
  if (typeof window === "undefined") return;
  if (window._wqrLoaded) {
    cb();
    return;
  }
  if (!window._wqrCbs) window._wqrCbs = [];
  window._wqrCbs.push(cb);
  if (document.getElementById("wqr-script")) return;
  const s = document.createElement("script");
  s.id = "wqr-script";
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
  s.onload = () => {
    window._wqrLoaded = true;
    window._wqrCbs?.forEach((fn) => fn());
    window._wqrCbs = [];
  };
  document.head.appendChild(s);
}

function UpiQr({ upiUrl, size = 180 }: { upiUrl: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!upiUrl) return;
    loadQrScript(() => {
      const el = ref.current;
      if (!el) return;
      el.innerHTML = "";
      try {
        const QRCode = (window as any).QRCode;
        new QRCode(el, {
          text: upiUrl,
          width: size,
          height: size,
          colorDark: "#000",
          colorLight: "#fff",
        });
        setOk(true);
      } catch {
        setErr(true);
      }
    });
  }, [upiUrl, size]);
  if (err)
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center bg-white rounded-lg text-[10px] text-gray-400 font-mono p-2 text-center"
      >
        QR unavailable
      </div>
    );
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {!ok && (
        <div
          style={{ width: size, height: size }}
          className="absolute inset-0 bg-white rounded-lg flex items-center justify-center"
        >
          <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div ref={ref} className={ok ? "" : "opacity-0"} />
    </div>
  );
}

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

// ── Payment modal ────────────────────────────────────────────
function PayModal({
  challenge,
  user,
  onSuccess,
  onClose,
}: {
  challenge: WeeklyChallenge;
  user: User;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"qr" | "txn" | "done">("qr");
  const [txnId, setTxnId] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const upiUrl = `upi://pay?${new URLSearchParams({
    pa: challenge.upi_id,
    pn: "BitByBit",
    am: String(challenge.entry_fee),
    cu: "INR",
    tn: `Weekly: ${challenge.title}`,
  })}`;

  async function submit() {
    const tid = txnId.trim();
    if (tid.length < 6) {
      setErr("Transaction ID seems too short");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/submit-weekly-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weeklyChallengeId: challenge.id,
          weeklyChallengeTitle: challenge.title,
          github: user.github,
          name: user.name,
          txnId: tid,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setStep("done");
      onSuccess();
    } catch (e: any) {
      setErr(e.message || "Submission failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[#0f0f0f] border border-[#1f1f1f] rounded-2xl p-5 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-[#444] hover:text-[#e0e0e0] font-mono text-lg"
        >
          ×
        </button>

        {step === "qr" && (
          <>
            <h3 className="font-mono font-bold text-[#e0e0e0] mb-1">
              Unlock Weekly Challenge
            </h3>
            <p className="text-xs text-[#555] font-mono mb-4">
              {challenge.title}
            </p>
            <div className="text-center mb-3">
              <span className="font-mono font-bold text-2xl text-[#00e87a]">
                ₹{challenge.entry_fee}
              </span>
              <span className="text-[#444] font-mono text-xs ml-2">
                one-time, valid all week
              </span>
            </div>
            <div className="flex justify-center mb-3 bg-white p-3 rounded-xl">
              <UpiQr upiUrl={upiUrl} size={180} />
            </div>

            {/* UPI ID copy */}
            <div className="bg-[#1a1a1a] rounded-lg px-3 py-2 flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-mono text-[#888] truncate">
                {challenge.upi_id}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(challenge.upi_id).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
                className="text-[10px] font-mono text-[#00e87a] shrink-0"
              >
                {copied ? "✓ Copied" : "Copy UPI ID"}
              </button>
            </div>

            {/* UPI app shortcuts */}
            <div className="mb-3">
              <p className="text-[10px] text-[#444] font-mono mb-2 text-center">
                Pay via
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    name: "GPay",
                    url: `gpay://upi/pay?${new URLSearchParams({ pa: challenge.upi_id, pn: "BitByBit", am: String(challenge.entry_fee), cu: "INR", tn: `Weekly: ${challenge.title}` })}`,
                  },
                  {
                    name: "PhonePe",
                    url: `phonepe://pay?${new URLSearchParams({ pa: challenge.upi_id, pn: "BitByBit", am: String(challenge.entry_fee), cu: "INR", tn: `Weekly: ${challenge.title}` })}`,
                  },
                  {
                    name: "Paytm",
                    url: `paytmmp://pay?${new URLSearchParams({ pa: challenge.upi_id, pn: "BitByBit", am: String(challenge.entry_fee), cu: "INR", tn: `Weekly: ${challenge.title}` })}`,
                  },
                ].map((app) => (
                  <a
                    key={app.name}
                    href={app.url}
                    className="flex items-center justify-center py-2 bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg text-xs font-mono text-[#888] hover:text-[#e0e0e0] hover:border-[#3a3a3a] transition-all"
                  >
                    {app.name}
                  </a>
                ))}
              </div>
              <p className="text-[10px] text-[#333] font-mono mt-2 text-center">
                or scan the QR above with any UPI app
              </p>
            </div>

            <button
              onClick={() => setStep("txn")}
              className="w-full py-2.5 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-lg hover:bg-[#00ff88] transition-all"
            >
              I've Paid → Enter Txn ID
            </button>
          </>
        )}

        {step === "txn" && (
          <>
            <h3 className="font-mono font-bold text-[#e0e0e0] mb-1">
              Enter Transaction ID
            </h3>
            <p className="text-[10px] text-[#444] font-mono mb-3">
              Find it in your UPI app under payment history.
            </p>
            {err && (
              <p className="text-xs text-[#ff4d4d] font-mono mb-2">{err}</p>
            )}
            <input
              value={txnId}
              onChange={(e) => setTxnId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="e.g. 426112345678"
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-sm font-mono text-[#e0e0e0] placeholder-[#333] focus:outline-none focus:border-[#00e87a40] mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setStep("qr")}
                className="flex-1 py-2 bg-[#1a1a1a] text-[#666] font-mono text-sm rounded-lg hover:text-[#e0e0e0]"
              >
                ← Back
              </button>
              <button
                onClick={submit}
                disabled={loading || !txnId.trim()}
                className={`flex-1 py-2 font-mono font-bold text-sm rounded-lg transition-all ${loading || !txnId.trim() ? "bg-[#00e87a40] text-[#00e87a60] cursor-not-allowed" : "bg-[#00e87a] text-black hover:bg-[#00ff88]"}`}
              >
                {loading ? "Submitting…" : "Submit →"}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <div className="text-center py-4">
            <div className="text-3xl mb-3">⏳</div>
            <p className="text-sm font-mono text-[#f0b429] font-bold mb-1">
              Payment Submitted
            </p>
            <p className="text-xs font-mono text-[#555]">
              Admin will verify and grant access shortly.
            </p>
            {challenge.whatsapp_link && (
              <a
                href={challenge.whatsapp_link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 bg-[#25D366] text-white font-mono font-bold text-sm rounded-lg hover:bg-[#22c55e] transition-all"
              >
                <span>💬</span> Join WhatsApp Group
              </a>
            )}
            <button
              onClick={onClose}
              className="mt-3 px-6 py-2 bg-[#1a1a1a] text-[#888] font-mono text-sm rounded-lg hover:text-[#e0e0e0]"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
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
    .channel(`weekly-${challengeId}`)
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
      <p className="text-xs text-[#444] font-mono text-center py-4">
        No submissions yet.
      </p>
    );

  return (
    <div className="space-y-1.5 mt-2">
      {rows.map((r, i) => (
        <div
          key={r.github}
          className="flex items-center gap-3 px-3 py-2 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl"
        >
          <span
            className={`w-5 text-center font-mono text-xs font-bold ${i === 0 ? "text-[#ffd700]" : i === 1 ? "text-[#c0c0c0]" : i === 2 ? "text-[#cd7f32]" : "text-[#333]"}`}
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
          <span className="text-[10px] font-mono text-[#444]">
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
}

export default function WeeklyChallengePage({ user }: Props) {
  const [challenges, setChallenges] = useState<WeeklyChallenge[]>([]);
  const [myAccess, setMyAccess] = useState<WeeklyAccess[]>([]);
  const [problems, setProblems] = useState<Record<string, Problem>>({});
  const [mySubmissions, setMySubmissions] = useState<WeeklySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState<WeeklyChallenge | null>(null);
  const [activeChallenge, setActiveChallenge] =
    useState<WeeklyChallenge | null>(null);
  const [activeProblem, setActiveProblem] = useState<Problem | null>(null);
  const [showLeader, setShowLeader] = useState<string | null>(null);

  const db = getSupabaseClient();

  useEffect(() => {
    load();
  }, [user]);

  async function load() {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ch } = await (db.from("weekly_challenges") as any)
        .select("*")
        .order("created_at", { ascending: false });

      const list = (ch || []) as WeeklyChallenge[];

      // Show all challenges — ended ones are still visible for results/leaderboard
      setChallenges(list);

      // Load all problems referenced
      const ids = new Set<string>();
      list.forEach((c) =>
        (c.problem_ids || []).forEach((id: string) => ids.add(id)),
      );
      if (ids.size) {
        const { data: probs } = await db
          .from("problems")
          .select("*")
          .in("id", Array.from(ids));
        const map: Record<string, Problem> = {};
        (probs || []).forEach((p: Problem) => {
          map[p.id] = p;
        });
        setProblems(map);
      }

      // Load user's access records
      if (user?.github) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: acc } = await (db.from("weekly_access") as any)
          .select("*")
          .eq("github", user.github);
        setMyAccess((acc || []) as WeeklyAccess[]);

        // Load user's weekly submissions
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: subs } = await (db.from("weekly_submissions") as any)
          .select("*")
          .eq("github", user.github);
        setMySubmissions((subs || []) as WeeklySubmission[]);
      }
    } catch {}
    setLoading(false);
  }

  function accessFor(challengeId: string): WeeklyAccess | undefined {
    return myAccess.find((a) => a.weekly_challenge_id === challengeId);
  }

  function hasConfirmedAccess(challengeId: string) {
    return accessFor(challengeId)?.status === "confirmed";
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
    const finalPoints = Math.round(basePts * (1 + bonus));
    const passed = details?.passed ?? (problem.test_cases?.length || 0);
    const total = details?.total ?? (problem.test_cases?.length || 0);

    try {
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
          status: "pending",
          submitted_at: new Date().toISOString(),
        },
        { onConflict: "weekly_challenge_id,problem_id,github" },
      );

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
    return (
      <Workspace
        problem={activeProblem}
        user={user}
        onClose={() => {
          setActiveProblem(null);
        }}
        onSolved={handleSolved}
        isWeekly={true}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="spinner" />
        <span className="text-[#444] text-xs font-mono">
          Loading weekly challenges…
        </span>
      </div>
    );
  }

  return (
    <div className="animate-fade-up max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display font-bold text-xl md:text-2xl mb-1">
          Weekly Challenge <span className="text-[#f0b429]">🏅</span>
        </h1>
        <p className="text-[#444] text-xs font-mono">
          3 new problems every week. Pay once, solve all week. Earn more points
          by solving earlier!
        </p>
      </div>

      {/* Scoring info */}
      <div className="mb-6 bg-[#0f0f0f] border border-[#1a1a1a] rounded-xl p-4 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[140px]">
          <p className="text-[10px] text-[#444] font-mono uppercase tracking-widest mb-1">
            Scoring Formula
          </p>
          <p className="text-xs text-[#e0e0e0] font-mono">
            Points = Base × Time Bonus
          </p>
        </div>
        <div className="flex-1 min-w-[140px]">
          <p className="text-[10px] text-[#444] font-mono uppercase tracking-widest mb-1">
            Day 1 bonus
          </p>
          <p className="text-sm font-bold text-[#00e87a] font-mono">100%</p>
        </div>
        <div className="flex-1 min-w-[140px]">
          <p className="text-[10px] text-[#444] font-mono uppercase tracking-widest mb-1">
            Day 7 bonus
          </p>
          <p className="text-sm font-bold text-[#f0b429] font-mono">20%</p>
        </div>
      </div>

      {challenges.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="text-4xl opacity-20">📅</div>
          <p className="text-[#444] font-mono text-sm">
            No active weekly challenge right now — check back soon!
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {challenges.map((ch) => {
            const access = accessFor(ch.id);
            const confirmed = hasConfirmedAccess(ch.id);
            const now = Date.now();
            const startMs = new Date(ch.starts_at).getTime();
            const endMs = new Date(ch.ends_at).getTime();
            const isUpcoming = now < startMs;
            const isActive =
              now >= startMs && now <= endMs && ch.status !== "ended";
            const isEnded = ch.status === "ended" || now > endMs;
            const bonus = computeBonus(ch.starts_at, ch.ends_at);
            const chProblems = (ch.problem_ids || [])
              .map((id) => problems[id])
              .filter(Boolean);

            return (
              <div
                key={ch.id}
                className="card border border-[#1a1a1a] rounded-2xl overflow-hidden"
              >
                {/* Challenge header */}
                <div className="px-5 py-4 border-b border-[#1a1a1a]">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="font-mono font-bold text-[#e0e0e0] text-base">
                        {ch.title}
                      </h2>
                      {ch.description && (
                        <p className="text-xs text-[#555] font-mono mt-0.5">
                          {ch.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isActive && (
                        <span className="flex items-center gap-1 text-[10px] font-mono text-[#00e87a] bg-[#00e87a12] px-2 py-0.5 rounded-lg">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#00e87a] animate-pulse inline-block" />{" "}
                          LIVE
                        </span>
                      )}
                      {isUpcoming && (
                        <span className="text-[10px] font-mono text-[#f0b429] bg-[#f0b42912] px-2 py-0.5 rounded-lg">
                          UPCOMING
                        </span>
                      )}
                      {isEnded && (
                        <span className="text-[10px] font-mono text-[#555] bg-[#1a1a1a] px-2 py-0.5 rounded-lg">
                          ENDED
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-4 text-[10px] font-mono text-[#444]">
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
                    {isActive && confirmed && (
                      <span className="text-[#a78bfa]">
                        ⚡ Current bonus: {fmtBonus(bonus)}
                      </span>
                    )}
                    <span>💰 ₹{ch.entry_fee} entry</span>
                  </div>
                </div>

                {/* Problems list */}
                <div className="px-5 py-4">
                  <p className="text-[10px] text-[#444] font-mono uppercase tracking-widest mb-3">
                    Problems ({chProblems.length})
                  </p>
                  <div className="space-y-2">
                    {chProblems.length === 0 && (
                      <p className="text-xs text-[#333] font-mono">
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
                            if (!confirmed) return;
                            if (isUpcoming) return;
                            if (isEnded) return;
                            setActiveChallenge(ch);
                            setActiveProblem(p);
                          }}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-150
                            ${
                              confirmed && isActive
                                ? "border-[#1f1f1f] hover:bg-[#161616] hover:border-[#2a2a2a] cursor-pointer group"
                                : "border-[#161616] opacity-50 cursor-not-allowed select-none"
                            }`}
                        >
                          <span
                            className={`text-sm ${solved ? "text-[#00e87a]" : "text-[#333]"}`}
                          >
                            {solved ? "✓" : "◯"}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span
                              className={`font-mono text-sm transition-colors truncate block
                            ${
                              solved
                                ? "text-[#00e87a]"
                                : confirmed && isActive
                                  ? "text-[#e0e0e0] group-hover:text-[#00e87a]"
                                  : "text-[#555]"
                            }`}
                            >
                              {p.title}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg
                            ${
                              p.difficulty === "Easy"
                                ? "text-[#00e87a] bg-[#00e87a12]"
                                : p.difficulty === "Medium"
                                  ? "text-[#f0b429] bg-[#f0b42912]"
                                  : "text-[#ff4d4d] bg-[#ff4d4d12]"
                            }`}
                          >
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
                          {!confirmed && (
                            <span className="text-[#444] text-xs">🔒</span>
                          )}
                          {confirmed && isUpcoming && (
                            <span className="text-[10px] font-mono text-[#f0b429]">
                              starts soon
                            </span>
                          )}
                          {confirmed && isEnded && (
                            <span className="text-[10px] font-mono text-[#444]">
                              ended
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Access / payment section */}
                <div className="px-5 pb-4">
                  {!user ? (
                    <div className="text-center py-3 border border-[#1a1a1a] rounded-xl">
                      <p className="text-xs font-mono text-[#444]">
                        Sign in with GitHub to participate
                      </p>
                    </div>
                  ) : confirmed ? (
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-2 text-xs font-mono">
                        {isUpcoming ? (
                          <span className="text-[#f0b429]">
                            ✓ Payment confirmed — problems unlock on{" "}
                            {new Date(ch.starts_at).toLocaleString()}
                          </span>
                        ) : isEnded ? (
                          <span className="text-[#555]">✓ Challenge ended</span>
                        ) : (
                          <span className="text-[#00e87a]">
                            ✓ Access confirmed — solve all week!
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {ch.whatsapp_link && (
                          <a
                            href={ch.whatsapp_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#25D366] text-white font-mono text-xs font-bold rounded-lg hover:bg-[#22c55e] transition-all"
                          >
                            💬 WhatsApp Group
                          </a>
                        )}
                        {!isUpcoming && (
                          <button
                            onClick={() =>
                              setShowLeader(showLeader === ch.id ? null : ch.id)
                            }
                            className="text-xs font-mono text-[#a78bfa] hover:text-[#c4b5fd] transition-colors"
                          >
                            {showLeader === ch.id ? "Hide" : "View"} leaderboard
                            ↕
                          </button>
                        )}
                      </div>
                    </div>
                  ) : access?.status === "pending" ? (
                    <div className="flex items-center gap-2 text-xs font-mono text-[#f0b429]">
                      ⏳ Payment under review (Txn: {access.txn_id})
                    </div>
                  ) : isActive || isUpcoming ? (
                    <button
                      onClick={() => setPayTarget(ch)}
                      className="w-full py-2.5 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-xl hover:bg-[#00ff88] transition-all shadow-[0_0_16px_rgba(0,232,122,0.15)] active:scale-[0.99]"
                    >
                      Unlock for ₹{ch.entry_fee} →
                    </button>
                  ) : null}

                  {/* Leaderboard */}
                  {confirmed && showLeader === ch.id && (
                    <div className="mt-4 border-t border-[#1a1a1a] pt-4">
                      <p className="text-[10px] text-[#444] font-mono uppercase tracking-widest mb-2">
                        Weekly Leaderboard
                      </p>
                      <WeeklyLeaderboard challengeId={ch.id} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Payment modal */}
      {payTarget && user && (
        <PayModal
          challenge={payTarget}
          user={user}
          onSuccess={() => {
            load();
            setPayTarget(null);
          }}
          onClose={() => setPayTarget(null)}
        />
      )}
    </div>
  );
}