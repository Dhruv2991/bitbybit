"use client";
// ════════════════════════════════════════════════════════════
// src/components/pages/DuelsLobbyPage.tsx
// 1v1 Code Duel Lobby & Real-Time Matchmaker Dashboard
// ════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";
import type { User, Problem } from "@/types/database";
import type { CodeDuel } from "@/types/duels";
import type { GhostRun, GhostMatch } from "@/types/ghost";
import type { PageId } from "@/components/layout/AppShellContext";
import { createDuelAction, joinDuelAction, leaveOrDiscardDuelAction } from "@/app/actions/duels";
import { getGhostRunsAction, getRecentGhostMatchesAction } from "@/app/actions/ghosts";

interface DuelsLobbyPageProps {
  user: User | null;
  onNavigate: (page: PageId) => void;
}

export default function DuelsLobbyPage({ user, onNavigate }: DuelsLobbyPageProps) {
  const router = useRouter();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [selectedProblemId, setSelectedProblemId] = useState<string>("");
  const [timeLimitMins, setTimeLimitMins] = useState<number>(30);
  const [openDuels, setOpenDuels] = useState<CodeDuel[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdRoomLink, setCreatedRoomLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Tab: live 1v1 vs ghost duels
  const [duelTab, setDuelTab] = useState<"live" | "ghost">("live");
  const [ghosts, setGhosts] = useState<GhostRun[]>([]);
  const [ghostMatches, setGhostMatches] = useState<GhostMatch[]>([]);
  const [ghostLoading, setGhostLoading] = useState(false);

  // Fetch problems and active waiting duels
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const db = getSupabaseClient();

        // 1. Load active DSA problems for the dropdown
        const { data: problemsData } = await db
          .from("problems")
          .select("id, title, difficulty, points")
          .eq("visibility", "public")
          .limit(50);

        const list = (problemsData || []) as unknown as Problem[];
        if (list.length > 0) {
          setProblems(list);
          setSelectedProblemId(list[0].id);
        }

        // 2. Load open duels waiting for opponents
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: duelsData } = await (db.from("code_duels") as any)
          .select("*")
          .eq("status", "waiting")
          .order("created_at", { ascending: false })
          .limit(20);

        if (duelsData) {
          setOpenDuels(duelsData as CodeDuel[]);
        }

        // 3. Load Ghost Runs & Recent Matches
        setGhostLoading(true);
        const [ghostList, matchesList] = await Promise.all([
          getGhostRunsAction(),
          getRecentGhostMatchesAction(5),
        ]);
        setGhosts(ghostList);
        setGhostMatches(matchesList);
        setGhostLoading(false);
      } catch (err) {
        console.error("[DuelsLobby] Error loading data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();

    // Subscribe to new waiting duels via Supabase Realtime
    const db = getSupabaseClient();
    const channel = db
      .channel("duels-lobby-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "code_duels" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          if (payload.eventType === "INSERT") {
            const newDuel = payload.new as CodeDuel;
            if (newDuel.status === "waiting") {
              setOpenDuels((prev) => [newDuel, ...prev.filter((d) => d.id !== newDuel.id)]);
            }
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as CodeDuel;
            if (updated.status !== "waiting") {
              // Remove duel if it is no longer waiting
              setOpenDuels((prev) => prev.filter((d) => d.id !== updated.id));
            } else {
              setOpenDuels((prev) =>
                prev.map((d) => (d.id === updated.id ? updated : d))
              );
            }
          } else if (payload.eventType === "DELETE") {
            setOpenDuels((prev) => prev.filter((d) => d.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      db.removeChannel(channel);
    };
  }, []);

  async function handleCreateDuel() {
    if (!user?.github) {
      setErrorMsg("Please sign in with GitHub to create a duel room.");
      return;
    }

    const problem = problems.find((p) => p.id === selectedProblemId);
    if (!problem) {
      setErrorMsg("Please select an algorithmic problem.");
      return;
    }

    setCreating(true);
    setErrorMsg(null);

    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      const token = session?.access_token;

      const res = await createDuelAction({
        problem_id: problem.id,
        problem_title: problem.title,
        time_limit_mins: timeLimitMins,
        host_github: user.github,
        host_name: user.name || user.github,
      }, token);

      if (!res.success || !res.duelId) {
        setErrorMsg(res.error || "Failed to create duel.");
        return;
      }

      const inviteUrl = `${window.location.origin}/duel/${res.duelId}`;
      setCreatedRoomLink(inviteUrl);
      router.push(`/duel/${res.duelId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error initiating duel.";
      setErrorMsg(message);
    } finally {
      setCreating(false);
    }
  }

  async function handleJoinDuel(duel: CodeDuel) {
    if (!user?.github) {
      setErrorMsg("Please sign in with GitHub to join a duel.");
      return;
    }

    setJoiningId(duel.id);
    setErrorMsg(null);

    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      const token = session?.access_token;

      const res = await joinDuelAction(duel.id, user.github, user.name || user.github, token);
      if (!res.success) {
        setErrorMsg(res.error || "Failed to join duel room.");
        return;
      }

      router.push(`/duel/${duel.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error joining duel.";
      setErrorMsg(message);
    } finally {
      setJoiningId(null);
    }
  }

  async function handleDiscardDuel(duelId: string) {
    if (!user?.github) return;
    if (!confirm("Are you sure you want to discard this waiting duel room?")) return;

    setDiscardingId(duelId);
    try {
      const { data: { session } } = await getSupabaseClient().auth.getSession();
      const res = await leaveOrDiscardDuelAction(duelId, user.github, session?.access_token);
      if (res.success) {
        setOpenDuels((prev) => prev.filter((d) => d.id !== duelId));
      } else {
        setErrorMsg(res.error || "Failed to discard room.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error discarding room.";
      setErrorMsg(message);
    } finally {
      setDiscardingId(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* ── Header Hero ────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800/60 bg-gradient-to-b from-white via-slate-50/50 to-white dark:from-slate-900/60 dark:via-slate-950/40 dark:to-slate-900/40 p-8 sm:p-10 backdrop-blur-xl shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-mono text-xs font-semibold tracking-wide">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
              REAL-TIME 1v1 CODE DUEL ARENA
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 font-display">
              Battle head-to-head in synchronized code combat.
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 font-mono max-w-2xl">
              Lock into a private room, solve the same algorithmic challenge simultaneously, and observe live opponent test-case progress and telemetry without code leakage.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigate("arena")}
              className="w-full sm:w-auto btn-secondary text-xs sm:text-sm px-4 py-2.5"
            >
              Browse Solo Arena
            </button>
            <a
              href="#create-room"
              className="w-full sm:w-auto btn-primary text-xs sm:text-sm px-5 py-2.5 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
                <path d="M9.5 6.5 21 18v3h-3L6.5 9.5" />
              </svg>
              Create Duel Room
            </a>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400 font-mono text-xs flex items-center justify-between">
          <span>⚠️ {errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Mode Switcher: Live 1v1 vs Ghost Duels ──────────────── */}
      <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setDuelTab("live")}
          className={`pb-2 px-4 font-mono text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition cursor-pointer ${
            duelTab === "live"
              ? "border-cyan-500 text-cyan-600 dark:text-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
          }`}
        >
          <span>⚔️ Live 1v1 Arena</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
            {openDuels.length} waiting
          </span>
        </button>

        <button
          onClick={() => setDuelTab("ghost")}
          className={`pb-2 px-4 font-mono text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition cursor-pointer ${
            duelTab === "ghost"
              ? "border-cyan-500 text-cyan-600 dark:text-cyan-400"
              : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
          }`}
        >
          <span>👻 Ghost Duels (Race Replays)</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
            {ghosts.length} available
          </span>
        </button>
      </div>

      {duelTab === "live" ? (
      /* ── Match Creation & Open Lobbies Grid ──────────────────── */
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Match Creation Card */}
        <div
          id="create-room"
          className="lg:col-span-5 card p-6 sm:p-7 space-y-6 border border-slate-200/80 dark:border-slate-800/80"
        >
          <div className="border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <h2 className="text-xl font-bold font-display text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span className="text-cyan-500">⚔️</span> Create Private Duel
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">
              Select problem parameters and initiate a shareable combat link.
            </p>
          </div>

          <div className="space-y-4">
            {/* Problem Selection */}
            <div>
              <label className="block text-xs font-mono font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Target Algorithmic Problem
              </label>
              {loading ? (
                <div className="h-10 bg-slate-100 dark:bg-slate-800/60 rounded-xl animate-pulse" />
              ) : (
                <select
                  value={selectedProblemId}
                  onChange={(e) => setSelectedProblemId(e.target.value)}
                  className="w-full input-base"
                >
                  {problems.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.difficulty}] {p.title} ({p.points} pts)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Time Limit Selection */}
            <div>
              <label className="block text-xs font-mono font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Match Countdown Duration
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[15, 30, 45].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setTimeLimitMins(mins)}
                    className={`py-2 text-xs font-mono rounded-xl border transition-all ${
                      timeLimitMins === mins
                        ? "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-300 dark:border-cyan-500/40 font-bold"
                        : "bg-white dark:bg-slate-900/40 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300"
                    }`}
                  >
                    ⏱️ {mins} Mins
                  </button>
                ))}
              </div>
            </div>

            {/* Duel Rules Summary */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/60 dark:border-slate-800/50 space-y-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
              <p className="font-semibold text-slate-800 dark:text-slate-200">⚔️ Combat Rules:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Both players receive the identical problem prompt and starter code.</li>
                <li>Opponent progress updates in real-time as test cases pass.</li>
                <li>First participant to pass 100% of test cases wins immediately.</li>
              </ul>
            </div>

            {/* Trigger Button */}
            <button
              onClick={user ? handleCreateDuel : async () => {
                const db = getSupabaseClient();
                await db.auth.signInWithOAuth({
                  provider: "github",
                  options: { redirectTo: window.location.href, queryParams: { prompt: "select_account" } },
                });
              }}
              disabled={creating}
              className="w-full btn-primary py-3 text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              {creating ? (
                <>
                  <span className="spinner-sm" />
                  <span>Generating Room...</span>
                </>
              ) : user ? (
                <>
                  <span>Create Room & Get Link</span>
                  <span>→</span>
                </>
              ) : (
                <>
                  <span>Sign in with GitHub to Play</span>
                  <span>→</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Open Waiting Lobbies */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between pb-1">
            <div>
              <h2 className="text-xl font-bold font-display text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>🔥</span> Active Open Rooms ({openDuels.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Click join to enter a waiting challenger’s arena instantly.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Sync
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 card p-4 animate-pulse bg-slate-100 dark:bg-slate-900/40" />
              ))}
            </div>
          ) : openDuels.length === 0 ? (
            <div className="card p-10 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl">
                🛡️
              </div>
              <h3 className="text-base font-bold font-display text-slate-800 dark:text-slate-200">
                No challengers waiting right now.
              </h3>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Be the first to create a private duel room above and invite a colleague or friend to battle!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {openDuels.map((duel) => {
                const isMyRoom = user?.github === duel.host_github;
                return (
                  <div
                    key={duel.id}
                    className="card-hover p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-slate-200/80 dark:border-slate-800/70"
                  >
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="badge-upcoming">WAITING</span>
                        <span className="text-xs font-mono text-slate-400">⏱️ {duel.time_limit_mins} mins</span>
                      </div>
                      <h4 className="text-sm sm:text-base font-bold font-mono text-slate-900 dark:text-slate-100 truncate">
                        {duel.problem_title || `Problem ${duel.problem_id}`}
                      </h4>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <span>Challenger:</span>
                        <span className="text-cyan-600 dark:text-cyan-400 font-semibold">@{duel.host_github}</span>
                      </p>
                    </div>

                    <div className="shrink-0 w-full sm:w-auto">
                      {isMyRoom ? (
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <button
                            onClick={() => router.push(`/duel/${duel.id}`)}
                            className="flex-1 sm:flex-initial btn-secondary text-xs px-3.5 py-2 flex items-center justify-center gap-1.5"
                          >
                            <span>Re-enter</span>
                            <span>→</span>
                          </button>
                          <button
                            onClick={() => handleDiscardDuel(duel.id)}
                            disabled={discardingId === duel.id}
                            title="Discard / close this waiting room"
                            className="px-3 py-2 text-xs font-mono font-medium rounded-xl text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all cursor-pointer"
                          >
                            {discardingId === duel.id ? "Discarding..." : "Discard"}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={user ? () => handleJoinDuel(duel) : async () => {
                            const db = getSupabaseClient();
                            await db.auth.signInWithOAuth({
                              provider: "github",
                              options: { redirectTo: window.location.href, queryParams: { prompt: "select_account" } },
                            });
                          }}
                          disabled={joiningId === duel.id}
                          className="w-full sm:w-auto btn-primary text-xs px-4 py-2 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {joiningId === duel.id ? (
                            <>
                              <span className="spinner-sm" />
                              <span>Joining...</span>
                            </>
                          ) : (
                            <>
                              <span>{user ? 'Accept Duel' : 'Sign in to Duel'}</span>
                              <span>⚔️</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      ) : (
      /* ── Ghost Duels (Asynchronous Replays) ───────────────────── */
      <div className="space-y-8 animate-fade-up">
        {/* Ghost Explanation Banner */}
        <div className="bg-gradient-to-r from-amber-500/10 via-slate-900 to-cyan-500/10 border border-amber-500/20 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 text-base">👻</span>
                <h3 className="text-base font-bold font-mono text-white">
                  Race Recorded Runs — No Opponent Waiting Required
                </h3>
              </div>
              <p className="text-xs font-mono text-slate-400 max-w-2xl">
                Every verified accepted solution on BitByBit generates an asynchronous Ghost runner. Challenge friends or top community coders, watch their telemetry progress in real-time, and win points for your Squad when you beat their clock!
              </p>
            </div>
            <button
              onClick={() => onNavigate("problems")}
              className="text-xs font-mono font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-3.5 py-2 rounded-xl hover:bg-amber-500/30 transition shrink-0"
            >
              Record Your Own Ghost →
            </button>
          </div>
        </div>

        {/* Recent Ghost Conquests Ticker */}
        {ghostMatches.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Recent Ghost Conquests</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {ghostMatches.slice(0, 3).map((m) => (
                <div
                  key={m.id}
                  className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between font-mono text-xs"
                >
                  <div className="space-y-0.5 truncate pr-2">
                    <div className="text-white font-bold truncate">
                      {m.result === "won" ? "🏆" : "👻"} @{m.challenger_github}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {m.problem_title}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-bold shrink-0 ${
                      m.result === "won" ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {m.result === "won"
                      ? `+${m.time_diff_seconds}s beat`
                      : "Defeated"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available Ghost Runners */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>👻 Community Ghosts Ready to Race</span>
              </h2>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                Pick a record below to summon the ghost runner in the live duel arena
              </p>
            </div>
          </div>

          {ghostLoading ? (
            <div className="p-12 text-center font-mono text-xs text-slate-500">
              Loading ghost records...
            </div>
          ) : ghosts.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-dashed border-slate-800 font-mono text-xs text-slate-500 space-y-3">
              <div>👻 No ghost runs recorded yet.</div>
              <button
                onClick={() => onNavigate("problems")}
                className="btn-primary text-xs px-4 py-2"
              >
                Solve a Problem to Set the First Record
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {ghosts.map((ghost) => {
                const mins = Math.floor(ghost.time_seconds / 60);
                const secs = ghost.time_seconds % 60;
                const formattedTime = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

                return (
                  <div
                    key={ghost.id}
                    className="bg-slate-900/60 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-cyan-500/40 transition group"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                          {ghost.language.toUpperCase()}
                        </span>
                        <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-amber-400">
                          <span>⏱️</span>
                          <span>{formattedTime}</span>
                        </div>
                      </div>

                      <h3 className="text-base font-bold font-mono text-slate-900 dark:text-white group-hover:text-cyan-400 transition">
                        {ghost.problem_title}
                      </h3>

                      {/* Ghost holder identity */}
                      <div className="flex items-center gap-2.5 pt-1">
                        {ghost.user_avatar ? (
                          <img
                            src={ghost.user_avatar}
                            alt={ghost.user_name}
                            className="w-7 h-7 rounded-full border border-slate-700 object-cover"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-cyan-600/30 border border-cyan-500/30 flex items-center justify-center font-mono font-bold text-xs text-cyan-300">
                            {ghost.github.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="truncate">
                          <div className="text-xs font-mono font-semibold text-slate-300 truncate">
                            {ghost.user_name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            @{ghost.github}
                          </div>
                        </div>
                      </div>

                      <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
                        <span>🎯 {ghost.checkpoints.length} race checkpoints</span>
                      </div>
                    </div>

                    <button
                      onClick={() => router.push(`/duel/ghost/${ghost.id}`)}
                      className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold transition shadow-xs shadow-cyan-500/20 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>👻 Race This Ghost</span>
                      <span>→</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
