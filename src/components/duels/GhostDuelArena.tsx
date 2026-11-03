"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { GhostRun } from "@/types/ghost";
import type { Problem, SupportedLang } from "@/types/database";
import { recordGhostMatchAction, recordGhostRunAction } from "@/app/actions/ghosts";

const DuelEditor = dynamic(() => import("@/app/duel/[roomId]/DuelEditor"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center font-mono text-xs text-slate-500">
      Loading Code Environment…
    </div>
  ),
});

interface GhostDuelArenaProps {
  ghost: GhostRun;
  problem: Problem;
  currentUser: { github: string; name: string; avatar?: string } | null;
  onExit?: () => void;
}

export default function GhostDuelArena({
  ghost,
  problem,
  currentUser,
  onExit,
}: GhostDuelArenaProps) {
  const router = useRouter();

  // Language & Code
  const [lang, setLang] = useState<SupportedLang>(
    (ghost.language as SupportedLang) || "python"
  );
  const starterCode =
    (problem.starter_code && (problem.starter_code as any)[lang]) ||
    (lang === "python"
      ? `class Solution:\n    def solve(self, *args):\n        # Beat ${ghost.user_name}'s record of ${Math.floor(ghost.time_seconds / 60)}m ${ghost.time_seconds % 60}s!\n        pass\n`
      : `function solve(...args) {\n    // Beat ${ghost.user_name}'s record of ${Math.floor(ghost.time_seconds / 60)}m ${ghost.time_seconds % 60}s!\n}\n`);

  const [code, setCode] = useState<string>(starterCode);

  // Timer & Race State
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [raceActive, setRaceActive] = useState(true);

  // Execution states
  const [testResults, setTestResults] = useState<any[]>([]);
  const [passedTests, setPassedTests] = useState(0);
  const [totalTests, setTotalTests] = useState(problem.test_cases?.length || 4);
  const [statusMessage, setStatusMessage] = useState("Race in progress! Beat the Ghost.");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Match Result Modal
  const [matchOutcome, setMatchOutcome] = useState<"won" | "lost" | null>(null);
  const [submittingMatch, setSubmittingMatch] = useState(false);
  const [awardedPoints, setAwardedPoints] = useState(0);
  const [awardedSquadPoints, setAwardedSquadPoints] = useState(0);

  // Timer Tick
  useEffect(() => {
    if (!raceActive) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [raceActive]);

  // Format mm:ss
  function formatTime(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  // Active Ghost Milestones
  const activeCheckpoints = ghost.checkpoints.filter((cp) => elapsedSeconds >= cp.at);
  const ghostFinished = elapsedSeconds >= ghost.time_seconds;
  const timeDifference = ghost.time_seconds - elapsedSeconds;

  // Run Tests / Submit
  async function executeSolution(isSubmit: boolean) {
    if (isRunning || !raceActive) return;
    setIsRunning(true);
    setErrorMsg(null);
    setStatusMessage(isSubmit ? "Testing all verification cases…" : "Running sample cases…");

    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          language: lang,
          problem_id: problem.id,
          mode: isSubmit ? "submit" : "run",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Execution failed. Check syntax.");
      }

      const results = data.results || [];
      const passed = data.passed ?? results.filter((r: any) => r.ok).length;
      const total = (data.total ?? results.length) || totalTests;

      setTestResults(results);
      setPassedTests(passed);
      setTotalTests(total);

      if (isSubmit) {
        const allGreen = passed === total && total > 0;
        if (allGreen) {
          // RACE FINISHED!
          setRaceActive(false);
          setSubmittingMatch(true);

          const won = elapsedSeconds < ghost.time_seconds;
          const diff = ghost.time_seconds - elapsedSeconds;
          setMatchOutcome(won ? "won" : "lost");

          // Save match result to DB
          if (currentUser?.github) {
            const outcome = await recordGhostMatchAction({
              ghost_run_id: ghost.id.startsWith("seed") ? null : ghost.id,
              problem_id: problem.id,
              problem_title: problem.title,
              challenger_github: currentUser.github,
              challenger_name: currentUser.name || currentUser.github,
              challenger_time_seconds: elapsedSeconds,
              result: won ? "won" : "lost",
              time_diff_seconds: diff,
            });

            if (outcome.success) {
              setAwardedPoints(outcome.pointsAwarded);
              setAwardedSquadPoints(outcome.squadPointsAwarded);
            }

            // Also record user's own run as a new ghost if fast
            if (won) {
              recordGhostRunAction({
                problem_id: problem.id,
                problem_title: problem.title,
                github: currentUser.github,
                user_name: currentUser.name || currentUser.github,
                user_avatar: currentUser.avatar,
                time_seconds: elapsedSeconds,
                language: lang,
                code_length: code.length,
                checkpoints: [
                  { at: 15, label: "Analyzed constraints & logic" },
                  { at: Math.floor(elapsedSeconds * 0.6), label: "Passed sample cases" },
                  { at: elapsedSeconds, label: "All test cases passed!" },
                ],
              }).catch(() => {});
            }
          } else {
            // Unauthenticated local win
            setMatchOutcome(won ? "won" : "lost");
          }
          setSubmittingMatch(false);
        } else {
          setStatusMessage(`Passed ${passed}/${total} tests. Keep debugging!`);
        }
      } else {
        setStatusMessage(`Sample tests completed: ${passed}/${total} passed.`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error running code");
      setStatusMessage("Error running code.");
    } finally {
      setIsRunning(false);
    }
  }

  function handleExit() {
    if (onExit) {
      onExit();
    } else {
      router.push("/duels");
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* 1. TOP RACE HUD */}
      <header className="h-16 px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={handleExit}
            className="text-xs font-mono text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition"
          >
            ← Exit Race
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded">
                👻 Ghost Duel Arena
              </span>
              <h1 className="text-sm font-bold font-mono text-white">
                {problem.title}
              </h1>
            </div>
            <p className="text-[11px] font-mono text-slate-400">
              Racing against <strong className="text-cyan-300">@{ghost.github}</strong>'s recorded run
            </p>
          </div>
        </div>

        {/* Speedometer Center */}
        <div className="flex items-center gap-6">
          <div className="text-center font-mono">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Your Time</div>
            <div className="text-xl font-black text-amber-400 tracking-tight">
              {formatTime(elapsedSeconds)}
            </div>
          </div>

          <div className="text-xl font-bold font-mono text-slate-600">VS</div>

          <div className="text-center font-mono">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Ghost Record</div>
            <div className="text-xl font-black text-cyan-400 tracking-tight">
              {formatTime(ghost.time_seconds)}
            </div>
          </div>

          <div
            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border ${
              timeDifference >= 0
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-rose-500/10 text-rose-400 border-rose-500/30"
            }`}
          >
            {timeDifference >= 0
              ? `⚡ +${formatTime(timeDifference)} ahead`
              : `⚠️ -${formatTime(Math.abs(timeDifference))} behind`}
          </div>
        </div>

        {/* Right Action buttons */}
        <div className="flex items-center gap-3">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as SupportedLang)}
            disabled={!raceActive}
            className="bg-slate-800 border border-slate-700 text-xs font-mono text-slate-200 px-2.5 py-1.5 rounded-lg focus:outline-hidden"
          >
            <option value="python">Python 3</option>
            <option value="javascript">JavaScript</option>
            <option value="cpp">C++</option>
            <option value="java">Java</option>
          </select>

          <button
            onClick={() => executeSolution(false)}
            disabled={isRunning || !raceActive}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono font-medium text-slate-200 transition disabled:opacity-50"
          >
            Run Tests
          </button>

          <button
            onClick={() => executeSolution(true)}
            disabled={isRunning || !raceActive}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold transition shadow-xs shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-1.5"
          >
            <span>{isRunning ? "Testing…" : "Submit & Finish 🏁"}</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN SPLIT ARENA */}
      <div className="flex-1 grid grid-cols-12 gap-0 overflow-hidden">
        {/* LEFT COLUMN: Problem Description & Test Runner (4 cols) */}
        <div className="col-span-4 border-r border-slate-800 flex flex-col bg-slate-900/40 overflow-hidden">
          {/* Problem Details */}
          <div className="p-4 border-b border-slate-800 flex-1 overflow-y-auto space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold uppercase">
                {problem.difficulty}
              </span>
              <span className="text-xs font-mono text-slate-400">
                {problem.points || 100} points
              </span>
            </div>

            <div className="prose prose-invert prose-xs max-w-none font-mono text-slate-300 leading-relaxed whitespace-pre-wrap">
              {problem.description || "Solve the problem before the Ghost beats your time!"}
            </div>

            {/* Constraints */}
            {(problem as any).constraints && (problem as any).constraints.length > 0 && (
              <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 space-y-1">
                <div className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                  Constraints
                </div>
                <ul className="text-xs font-mono text-slate-300 list-disc list-inside space-y-0.5">
                  {((problem as any).constraints as string[]).map((c: string, i: number) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Test Case Execution Output */}
          <div className="h-44 border-t border-slate-800 bg-slate-950 p-3 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-mono text-slate-400 font-bold uppercase">
                Test Output
              </div>
              <span className="text-xs font-mono text-slate-400">
                Passed: {passedTests}/{totalTests}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1 text-slate-300">
              {errorMsg && (
                <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400">
                  {errorMsg}
                </div>
              )}
              {testResults.length === 0 && !errorMsg && (
                <div className="text-slate-500 text-xs">
                  {statusMessage}
                </div>
              )}
              {testResults.map((r, i) => (
                <div
                  key={i}
                  className={`p-1.5 rounded flex items-center justify-between border ${
                    r.ok
                      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-300 border-rose-500/20"
                  }`}
                >
                  <span>Test Case #{i + 1}</span>
                  <span>{r.ok ? "✓ Passed" : "✗ Failed"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: Code Editor (5 cols) */}
        <div className="col-span-5 flex flex-col bg-slate-950 overflow-hidden">
          <div className="h-8 bg-slate-900 px-3 flex items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-800">
            <span>solution.{lang === "python" ? "py" : lang === "javascript" ? "js" : "cpp"}</span>
            <span>Ctrl+Enter to Run • Ctrl+Shift+Enter to Submit</span>
          </div>

          <div className="flex-1">
            <DuelEditor
              value={code}
              language={lang}
              onChange={(val) => setCode(val)}
              onRun={() => executeSolution(false)}
              onSubmit={() => executeSolution(true)}
              height="100%"
            />
          </div>
        </div>

        {/* RIGHT COLUMN: Ghost Competitor HUD & Telemetry (3 cols) */}
        <div className="col-span-3 border-l border-slate-800 bg-slate-900/60 flex flex-col overflow-hidden">
          {/* Ghost Profile Card */}
          <div className="p-4 border-b border-slate-800 space-y-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                {ghost.user_avatar ? (
                  <img
                    src={ghost.user_avatar}
                    alt={ghost.user_name}
                    className="w-11 h-11 rounded-full border border-cyan-500/40 object-cover"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-cyan-600/30 border border-cyan-500/40 flex items-center justify-center font-mono font-bold text-cyan-300">
                    {ghost.github.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="absolute -bottom-1 -right-1 text-xs">👻</span>
              </div>

              <div>
                <div className="text-xs font-bold font-mono text-white flex items-center gap-1">
                  <span>{ghost.user_name}</span>
                </div>
                <div className="text-[11px] font-mono text-cyan-400">
                  @{ghost.github}
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  Language: {ghost.language}
                </div>
              </div>
            </div>

            {/* Duel Race Track Progress Bars */}
            <div className="space-y-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex justify-between">
                <span>Race Track</span>
                <span>Finish</span>
              </div>

              {/* User track */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-amber-400 font-bold">You (Live)</span>
                  <span className="text-slate-400">{passedTests}/{totalTests} tests</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-300 rounded-full"
                    style={{ width: `${(passedTests / Math.max(1, totalTests)) * 100}%` }}
                  />
                </div>
              </div>

              {/* Ghost track */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-cyan-400 font-bold">Ghost</span>
                  <span className="text-slate-400">
                    {ghostFinished ? "Finished!" : `${Math.min(100, Math.floor((elapsedSeconds / ghost.time_seconds) * 100))}%`}
                  </span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      ghostFinished ? "bg-rose-500" : "bg-cyan-400"
                    }`}
                    style={{
                      width: `${Math.min(100, (elapsedSeconds / ghost.time_seconds) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Live Ghost Checkpoints Ticker */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Ghost Telemetry</span>
              <span className="text-[10px] text-cyan-400">LIVE FEED</span>
            </div>

            <div className="space-y-2 font-mono text-xs">
              {ghost.checkpoints.map((cp, idx) => {
                const passed = elapsedSeconds >= cp.at;
                return (
                  <div
                    key={idx}
                    className={`p-2 rounded-lg border transition flex items-start gap-2 ${
                      passed
                        ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                        : "bg-slate-950/40 border-slate-800/80 text-slate-600"
                    }`}
                  >
                    <span className="text-[10px] font-bold mt-0.5">
                      {passed ? "✓" : "○"} {formatTime(cp.at)}
                    </span>
                    <span className="text-[11px] leading-tight">{cp.label}</span>
                  </div>
                );
              })}

              {ghostFinished && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs leading-relaxed font-bold animate-pulse">
                  🏁 Ghost completed run in {formatTime(ghost.time_seconds)}!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. VICTORY / OUTCOME MODAL */}
      {matchOutcome && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 max-w-md w-full rounded-2xl p-6 text-center shadow-2xl space-y-5 animate-scale-up">
            <div className="text-5xl">
              {matchOutcome === "won" ? "🏆" : "👻"}
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-bold font-mono text-white">
                {matchOutcome === "won" ? "GHOST RECORD BEATEN!" : "GHOST CROSSED FIRST!"}
              </h2>
              <p className="text-xs font-mono text-slate-400">
                {matchOutcome === "won"
                  ? `Incredible! You beat @${ghost.github} by ${Math.abs(timeDifference)} seconds!`
                  : `Ghost finished ${Math.abs(timeDifference)} seconds ahead. Great attempt!`}
              </p>
            </div>

            {/* Stats Comparison */}
            <div className="grid grid-cols-2 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono">
              <div>
                <div className="text-[10px] uppercase text-slate-400">Your Time</div>
                <div className="text-lg font-bold text-amber-400">
                  {formatTime(elapsedSeconds)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-400">Ghost Time</div>
                <div className="text-lg font-bold text-cyan-400">
                  {formatTime(ghost.time_seconds)}
                </div>
              </div>
            </div>

            {matchOutcome === "won" && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1 font-mono text-xs text-emerald-400">
                <div className="font-bold">🎉 Rewards Claimed:</div>
                <div>+100 Duel Points Awarded</div>
                {awardedSquadPoints > 0 && (
                  <div className="text-indigo-400 font-bold">
                    +50 Points Contributed to your Squad!
                  </div>
                )}
                <div>⚔️ Duelist Badge Progress Updated</div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setMatchOutcome(null);
                  setElapsedSeconds(0);
                  setRaceActive(true);
                  setPassedTests(0);
                  setTestResults([]);
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold transition border border-slate-700"
              >
                Race Again ↺
              </button>

              <button
                onClick={handleExit}
                className="flex-1 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold transition shadow-xs shadow-cyan-500/20"
              >
                Back to Duels Lobby →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
