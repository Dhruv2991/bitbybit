"use client";
// ════════════════════════════════════════════════════════════
// src/app/duel/[roomId]/page.tsx
// Real-Time 1v1 Code Duel War Room & Live Telemetry Arena
// ════════════════════════════════════════════════════════════

import { useEffect, useState, useRef, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { getSupabaseClient } from "@/lib/supabase";
import type { Problem, SupportedLang } from "@/types/database";
import { STARTER_CODE, LANG_LABELS } from "@/types/database";
import type { CodeDuel, DuelProgress } from "@/types/duels";
import {
  getDuelAction,
  joinDuelAction,
  updateDuelProgressAction,
  forfeitDuelAction,
} from "@/app/actions/duels";
import { getStrategy, runInBrowser } from "@/lib/browserExecutor";

import ProblemStatement from "./ProblemStatement";

// Dynamic import of Monaco Editor with ssr: false for bundle optimization
const CodeEditor = dynamic(() => import("./DuelEditor"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full min-h-[300px] flex-1 rounded-2xl bg-slate-100 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 flex items-center justify-center font-mono text-xs text-slate-500">
      ⚔️ Mounting Duel Code Editor...
    </div>
  ),
});

interface TestExecutionResult {
  input: string;
  expected: string;
  actual: string;
  ok: boolean;
  time?: string;
  error?: string;
}

export default function DuelWarRoomPage() {
  const params = useParams();
  const roomId = params?.roomId as string;
  const router = useRouter();

  const [duel, setDuel] = useState<CodeDuel | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [currentUser, setCurrentUser] = useState<{ github: string; name: string } | null>(null);
  const [language, setLanguage] = useState<SupportedLang>("python");
  const [code, setCode] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestExecutionResult[]>([]);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);
  const [showVictoryModal, setShowVictoryModal] = useState<boolean>(false);
  const [forfeiting, setForfeiting] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [, startTransition] = useTransition();
  const opponentTelemetryRef = useRef<DuelProgress | null>(null);

  // 1. Initial Load & Auth Resolution
  useEffect(() => {
    // Resolve user from localStorage or Supabase session
    try {
      const raw = localStorage.getItem("bitbybit-auth");
      if (raw) {
        const parsed = JSON.parse(raw);
        const su = parsed?.user ?? parsed?.session?.user;
        if (su?.user_metadata?.user_name) {
          setCurrentUser({
            github: su.user_metadata.user_name,
            name: su.user_metadata.full_name || su.user_metadata.user_name,
          });
        }
      }
    } catch {
      // Unauthenticated fallback
    }

    async function initDuel() {
      if (!roomId) return;
      const res = await getDuelAction(roomId);
      if (!res.success || !res.duel) {
        setErrorBanner(res.error || "Duel room not found.");
        return;
      }

      setDuel(res.duel);

      // Fetch problem details
      const db = getSupabaseClient();
      const { data: prob } = await db
        .from("problems")
        .select("*")
        .eq("id", res.duel.problem_id)
        .maybeSingle();

      if (prob) {
        setProblem(prob as Problem);
        const starter = STARTER_CODE["python"]?.(prob as Problem) || "def solution():\n    pass";
        setCode(starter);
      }
    }

    initDuel();
  }, [roomId]);

  // 2. Realtime Subscription to Supabase code_duels changes
  useEffect(() => {
    if (!roomId) return;
    const db = getSupabaseClient();

    const channel = db
      .channel(`duel-war-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "code_duels",
          filter: `id=eq.${roomId}`,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const updated = payload.new as CodeDuel;
          setDuel(updated);

          // Check if match just completed
          if (updated.status === "completed") {
            setShowVictoryModal(true);
          }
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      db.removeChannel(channel);
    };
  }, [roomId]);

  // 3. Auto-Join if viewer is not the host and room is waiting
  useEffect(() => {
    if (!duel || !currentUser || duel.status !== "waiting") return;
    if (duel.host_github !== currentUser.github && !duel.guest_github) {
      // Auto-join as guest
      joinDuelAction(duel.id, currentUser.github, currentUser.name).then((res) => {
        if (res.success && res.duel) {
          setDuel(res.duel);
        }
      });
    }
  }, [duel, currentUser]);

  // 4. Synchronized Countdown Timer
  useEffect(() => {
    if (!duel || duel.status !== "active" || !duel.started_at) {
      if (duel?.status === "completed") {
        setShowVictoryModal(true);
      }
      return;
    }

    const durationSeconds = (duel.time_limit_mins || 30) * 60;
    const startEpoch = new Date(duel.started_at).getTime();

    const interval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startEpoch) / 1000);
      const remaining = Math.max(0, durationSeconds - elapsedSeconds);
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        // Time expired: trigger completion
        setShowVictoryModal(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [duel?.status, duel?.started_at, duel?.time_limit_mins]);

  // 5. Language Switching handler
  function handleLanguageChange(newLang: SupportedLang) {
    setLanguage(newLang);
    const template = STARTER_CODE[newLang]?.(problem || undefined) || "";
    setCode(template);
  }

  // 6. Execute Test Cases & Transmit Numerical Telemetry
  async function handleRunTests() {
    if (!problem || !currentUser || !duel) return;
    setIsRunning(true);

    // Notify opponent: Status changed to 'running_tests'
    await updateDuelProgressAction(duel.id, currentUser.github, {
      status: "running_tests",
    });

    const strategy = getStrategy(language);
    try {
      let data: any = null;

      if (strategy === "browser") {
        // Python and JavaScript execute directly in the user's browser via Pyodide / Web Workers
        const cases = (problem.test_cases || []).map((tc) => ({
          input: tc.input,
          expected: tc.expected,
          is_hidden: tc.is_hidden,
        }));
        data = await runInBrowser(code, language, cases);
      } else {
        // Other languages (C++, Java, Go, Rust) execute on the server (Docker Judge0 with Wandbox fallback)
        try {
          const response = await fetch("/api/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code,
              language,
              problem_id: problem.id,
              mode: "submit",
            }),
          });

          if (response.ok) {
            data = await response.json();
          } else {
            const errData = await response.json().catch(() => ({}));
            console.warn("[Duel] /api/execute returned error:", errData);
            if (errData.error) {
              setErrorBanner(`Execution error: ${errData.error}`);
            }
          }
        } catch (fetchErr: any) {
          console.warn("[Duel] Network fetch to /api/execute failed:", fetchErr);
        }
      }

      if (!data) {
        setErrorBanner("Execution server failed to respond. Please verify your code and retry.");
        return;
      }

      setErrorBanner(null);
      const results: TestExecutionResult[] = data.results || [];
      setTestResults(results);

      const passedCount = data.passed || 0;
      const totalCount = data.total || results.length || 1;

      // Broadcast telemetry to opponent via server action -> Supabase Realtime
      const updateRes = await updateDuelProgressAction(duel.id, currentUser.github, {
        testsPassed: passedCount,
        totalTests: totalCount,
        status: passedCount === totalCount ? "submitted" : "coding",
      });

      if (updateRes.isVictory) {
        setShowVictoryModal(true);
      }
    } catch (err: any) {
      console.error("[Duel] Execution error:", err);
      setErrorBanner(err?.message || "Execution error encountered.");
    } finally {
      setIsRunning(false);
    }
  }

  // 7. Forfeit Handler
  async function handleForfeit() {
    if (!duel || !currentUser) return;
    if (!confirm("Are you sure you want to forfeit this duel? Your opponent will be awarded victory.")) {
      return;
    }

    setForfeiting(true);
    try {
      await forfeitDuelAction(duel.id, currentUser.github);
      setShowVictoryModal(true);
    } finally {
      setForfeiting(false);
    }
  }

  function formatTime(totalSeconds: number | null) {
    if (totalSeconds === null) return "--:--";
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  const isHost = duel?.host_github === currentUser?.github;
  const myProgress = isHost ? duel?.host_progress : duel?.guest_progress;
  const opponentProgress = isHost ? duel?.guest_progress : duel?.host_progress;
  const opponentName = isHost ? duel?.guest_name || duel?.guest_github || "Challenger" : duel?.host_name || duel?.host_github;
  const opponentConnected = Boolean(isHost ? duel?.guest_github : duel?.host_github);

  const isWinner = duel?.winner_github && currentUser && duel.winner_github === currentUser.github;
  const isDefeat = duel?.winner_github && currentUser && duel.winner_github !== currentUser.github;
  const isDraw = duel?.status === "completed" && !duel?.winner_github;

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-[var(--bg)] text-[var(--text)] font-mono">
      {/* ── Top Bar HUD ────────────────────────────────────────── */}
      <header className="h-16 px-4 sm:px-6 border-b border-[var(--border)] bg-[var(--surface)] backdrop-blur-xl flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/duels")}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            title="Return to Duels Lobby"
          >
            ← Lobby
          </button>
          <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse" />
            <h1 className="font-bold font-display text-sm sm:text-base text-slate-900 dark:text-slate-100 truncate max-w-xs sm:max-w-md">
              {duel?.problem_title || "1v1 Code Duel"}
            </h1>
          </div>
        </div>

        {/* Center: Live Synchronized Countdown Timer */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-sm font-bold shadow-xs">
          <span className="text-amber-500">⏱️</span>
          <span className={secondsRemaining && secondsRemaining < 180 ? "text-rose-500 animate-pulse" : "text-slate-800 dark:text-slate-200"}>
            {formatTime(secondsRemaining)}
          </span>
        </div>

        {/* Right: Realtime status & Forfeit */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`w-2 h-2 rounded-full ${realtimeConnected ? "bg-emerald-500" : "bg-amber-500 animate-ping"}`} />
            <span>{realtimeConnected ? "Live Telemetry" : "Reconnecting..."}</span>
          </div>

          {duel?.status === "active" && (
            <button
              onClick={handleForfeit}
              disabled={forfeiting}
              className="text-xs px-3 py-1.5 rounded-xl text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all font-medium"
            >
              {forfeiting ? "Conceding..." : "Forfeit"}
            </button>
          )}
        </div>
      </header>

      {/* ── Waiting for Opponent Banner ────────────────────────── */}
      {duel?.status === "waiting" && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20 px-4 py-3 text-center text-xs sm:text-sm text-amber-800 dark:text-amber-300 flex flex-col sm:flex-row items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <span className="spinner-sm" />
            <span>Waiting for challenger to join room...</span>
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            }}
            className="px-3 py-1 rounded-lg bg-amber-200/60 dark:bg-amber-500/20 font-bold hover:bg-amber-300/60 transition-colors text-xs"
          >
            {copiedLink ? "✓ Link Copied to Clipboard!" : "📋 Copy Invite Link"}
          </button>
        </div>
      )}

      {errorBanner && (
        <div className="bg-rose-50 dark:bg-rose-500/10 border-b border-rose-200 px-4 py-2.5 text-center text-xs text-rose-700 dark:text-rose-400">
          ⚠️ {errorBanner}
        </div>
      )}

      {/* ── Dual Split Workspace Body ──────────────────────────── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 w-full h-full overflow-hidden">
        {/* Left Panel: Problem Spec & Test Cases (5 cols) */}
        <div className="lg:col-span-5 border-r border-[var(--border)] overflow-y-auto p-5 sm:p-6 space-y-6 min-h-0 min-w-0 h-full">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`diff-${(problem?.difficulty || "Medium").toLowerCase()}`}>
                {problem?.difficulty || "Medium"}
              </span>
              <span className="text-xs text-slate-500">Points: {problem?.points || 150}</span>
            </div>
            <h2 className="text-xl font-bold font-display text-slate-900 dark:text-slate-100">
              {problem?.title || "Problem Description"}
            </h2>
          </div>

          {/* Description */}
          <div className="overflow-y-auto prose dark:prose-invert max-w-none text-sm text-slate-700 dark:text-slate-300 leading-relaxed break-words font-sans">
            <ProblemStatement description={problem?.description} />
          </div>

          {/* Examples */}
          {problem?.example && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Example Execution
              </h3>
              <pre className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs overflow-x-auto text-slate-800 dark:text-slate-200">
                {problem.example}
              </pre>
            </div>
          )}

          {/* Test Execution Output */}
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center justify-between">
              <span>Test Results</span>
              {testResults.length > 0 && (
                <span className="text-[11px] text-cyan-600 dark:text-cyan-400">
                  {testResults.filter((r) => r.ok).length} / {testResults.length} Passed
                </span>
              )}
            </h3>

            {testResults.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                Click &quot;Run Tests&quot; to test your code against authoritative cases.
              </div>
            ) : (
              <div className="space-y-2">
                {testResults.map((res, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border text-xs space-y-1 ${
                      res.ok
                        ? "bg-emerald-50/60 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                        : "bg-rose-50/60 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/20 text-rose-800 dark:text-rose-300"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5">
                        <span>Case {i + 1} {res.ok ? "✓ Passed" : "✗ Failed"}</span>
                        {(res.input === '[Hidden]' || (res as any).is_hidden) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-zinc-400">
                            🔒 Hidden
                          </span>
                        )}
                      </span>
                      {res.time && <span className="text-[10px] text-slate-400">{res.time}</span>}
                    </div>
                    {res.error && !res.ok && (
                      <div className="p-2 rounded-lg bg-rose-100/70 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 font-mono text-[11px] whitespace-pre-wrap break-all border border-rose-200 dark:border-rose-900/40">
                        {res.error}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
                      {res.input === '[Hidden]' || (res as any).is_hidden ? (
                        <div className="text-slate-500 dark:text-zinc-400 italic">
                          [Hidden test inputs are masked for security]
                        </div>
                      ) : (
                        <>
                          <div>Input: <code className="text-slate-800 dark:text-slate-200">{res.input}</code></div>
                          <div>Expected: <code className="text-slate-800 dark:text-slate-200">{res.expected}</code></div>
                          <div>Actual: <code className="text-slate-800 dark:text-slate-200">{res.actual || (res.ok ? res.expected : (res.error ? "Error" : "None"))}</code></div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Code Editor + Opponent Telemetry HUD (7 cols) */}
        <div className="lg:col-span-7 flex flex-col min-h-0 min-w-0 w-full h-full overflow-hidden bg-[var(--surface)]">
          {/* Opponent Real-Time Telemetry Bar (Floating HUD) */}
          <div className="p-4 border-b border-[var(--border)] bg-gradient-to-r from-slate-50 via-white to-slate-50 dark:from-slate-900/80 dark:via-slate-950/90 dark:to-slate-900/80 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Opponent Status */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-700 dark:text-slate-300 text-sm">
                  ⚔️
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Opponent: @{opponentName}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        opponentProgress?.status === "submitted"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                          : opponentProgress?.status === "running_tests"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 animate-pulse"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {opponentProgress?.status || "Waiting"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Passed {opponentProgress?.testsPassed || 0} / {opponentProgress?.totalTests || "?"} test cases
                  </p>
                </div>
              </div>

              {/* Opponent Progress Bar */}
              <div className="w-full sm:w-48 space-y-1">
                <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-sky-500 transition-all duration-300"
                    style={{
                      width: `${
                        opponentProgress?.totalTests
                          ? Math.round((opponentProgress.testsPassed / opponentProgress.totalTests) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Combat Progress</span>
                  <span>
                    {opponentProgress?.totalTests
                      ? `${Math.round((opponentProgress.testsPassed / opponentProgress.totalTests) * 100)}%`
                      : "0%"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Editor Header Bar */}
          <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between gap-3 bg-[var(--surface)] shrink-0">
            {/* Language Selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(["python", "javascript", "cpp", "java", "rust", "go"] as SupportedLang[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleLanguageChange(lang)}
                  className={`px-2.5 py-1 text-xs rounded-lg font-mono transition-colors ${
                    language === lang
                      ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300 font-bold border border-cyan-200 dark:border-cyan-500/30"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  }`}
                >
                  {LANG_LABELS[lang]}
                </button>
              ))}
            </div>

            {/* Run Button */}
            <button
              onClick={handleRunTests}
              disabled={isRunning || duel?.status !== "active"}
              className="btn-primary text-xs px-4 py-2 flex items-center gap-2"
            >
              {isRunning ? (
                <>
                  <span className="spinner-sm" />
                  <span>Evaluating...</span>
                </>
              ) : (
                <>
                  <span>Run Tests</span>
                  <span>▶</span>
                </>
              )}
            </button>
          </div>

          {/* Monaco Editor Container */}
          <div className="relative flex-1 min-h-0 w-full h-full flex flex-col">
            <CodeEditor
              value={code}
              language={language}
              onChange={(val) => setCode(val)}
              height="100%"
              onRun={handleRunTests}
              options={{ automaticLayout: true }}
              className="w-full h-full flex-1"
            />
          </div>
        </div>
      </div>

      {/* ── Victory / Defeat Modal ─────────────────────────────── */}
      {showVictoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="card max-w-md w-full p-6 sm:p-8 space-y-6 text-center border-2 border-slate-200 dark:border-slate-800 shadow-2xl animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center text-3xl bg-slate-100 dark:bg-slate-800">
              {isWinner ? "🏆" : isDefeat ? "💀" : "🤝"}
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-bold font-display text-slate-900 dark:text-slate-50">
                {isWinner ? "VICTORY!" : isDefeat ? "DEFEAT" : "MATCH CONCLUDED"}
              </h2>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {isWinner
                  ? "Outstanding execution! You passed all test cases first."
                  : isDefeat
                  ? `@${duel?.winner_github} passed all test cases first.`
                  : "Time expired without a definitive winner."}
              </p>
            </div>

            {/* Stats Comparison Card */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                <span className="text-slate-500">Your Tests Passed:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {myProgress?.testsPassed || 0} / {myProgress?.totalTests || "?"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-slate-800">
                <span className="text-slate-500">Opponent Tests Passed:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {opponentProgress?.testsPassed || 0} / {opponentProgress?.totalTests || "?"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500">Challenge:</span>
                <span className="font-bold text-cyan-600 dark:text-cyan-400 truncate max-w-[200px]">
                  {duel?.problem_title}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push("/duels")}
                className="w-full btn-secondary text-xs sm:text-sm py-2.5"
              >
                Back to Lobby
              </button>
              <button
                onClick={() => router.push("/problems")}
                className="w-full btn-primary text-xs sm:text-sm py-2.5"
              >
                Practice Problems
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
