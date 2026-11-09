"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { User } from "@/types/database";
import type { Squad } from "@/types/community";
import { SQUAD_CONFIG } from "@/config/community";
import { getSupabaseClient } from "@/lib/supabase";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import {
  getUserSquadAction,
  getSquadsLeaderboardAction,
  createSquadAction,
  joinSquadAction,
  leaveSquadAction,
} from "@/app/actions/squads";

interface SquadsPageProps {
  user: User | null;
}

export default function SquadsPage({ user }: SquadsPageProps) {
  const [mySquad, setMySquad] = useState<Squad | null>(null);
  const [leaderboard, setLeaderboard] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(true);

  // Forms
  const [createName, setCreateName] = useState("");
  const [createTag, setCreateTag] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [userSquad, lb] = await Promise.all([
        user?.github ? getUserSquadAction(user.github) : Promise.resolve(null),
        getSquadsLeaderboardAction(),
      ]);

      setMySquad(userSquad);
      setLeaderboard(lb || []);
    } catch (err) {
      console.warn("Could not load squad data", err);
    } finally {
      setLoading(false);
    }
  }, [user?.github]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time synchronization for squad membership and clan score changes
  useRealtimeChannel({
    channelName: "community-squads-feed",
    postgresChanges: [
      {
        event: "*",
        schema: "public",
        table: "squads",
        callback: () => loadData(),
      },
      {
        event: "*",
        schema: "public",
        table: "squad_members",
        callback: () => loadData(),
      },
    ],
    enabled: true,
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      setErrorMsg("Please sign in to create a squad!");
      return;
    }

    const trimmedName = createName.trim();
    const trimmedTag = createTag.trim().toUpperCase();

    if (trimmedName.length < SQUAD_CONFIG.NAME_MIN_LEN) {
      setErrorMsg(`Squad name must be at least ${SQUAD_CONFIG.NAME_MIN_LEN} characters.`);
      return;
    }
    if (trimmedTag.length < SQUAD_CONFIG.TAG_MIN_LEN) {
      setErrorMsg(`Squad tag must be at least ${SQUAD_CONFIG.TAG_MIN_LEN} characters.`);
      return;
    }

    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const { data: { session } } = await getSupabaseClient().auth.getSession();
    const res = await createSquadAction(trimmedName, trimmedTag, user.github, user.name, session?.access_token);
    setActionLoading(false);

    if (res.success) {
      setCreateName("");
      setCreateTag("");
      setSuccessMsg(`Squad "${trimmedName}" created successfully! Invite your friends to join.`);
      await loadData();
    } else {
      setErrorMsg(res.error || "Failed to create squad. Please try again.");
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      setErrorMsg("Please sign in to join a squad!");
      return;
    }

    const trimmedCode = joinCode.trim().toUpperCase();
    if (!trimmedCode) {
      setErrorMsg("Please enter a valid squad invite code.");
      return;
    }

    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const { data: { session } } = await getSupabaseClient().auth.getSession();
    const res = await joinSquadAction(trimmedCode, user.github, user.name, session?.access_token);
    setActionLoading(false);

    if (res.success) {
      setJoinCode("");
      setSuccessMsg("Welcome to your new squad! Let's conquer the leaderboard together.");
      await loadData();
    } else {
      setErrorMsg(res.error || "Failed to join squad. Double-check the code and try again.");
    }
  }

  async function handleLeave() {
    if (!user || !mySquad) return;

    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const { data: { session } } = await getSupabaseClient().auth.getSession();
    const res = await leaveSquadAction(mySquad.id, user.github, session?.access_token);
    setActionLoading(false);
    setConfirmLeaveOpen(false);

    if (res.success) {
      setMySquad(null);
      setSuccessMsg("You have left the squad.");
      await loadData();
    } else {
      setErrorMsg(res.error || "Failed to leave squad.");
    }
  }

  function copyInvite() {
    if (!mySquad) return;
    const msg = `Join my coding squad [${mySquad.tag}] "${mySquad.name}" on BitByBit! Use invite code: ${mySquad.code} -> https://bitbybit.org/squads`;
    navigator.clipboard.writeText(msg);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  }

  function shareWhatsApp() {
    if (!mySquad) return;
    const msg = `Join my coding squad [${mySquad.tag}] "${mySquad.name}" on BitByBit! Use invite code: ${mySquad.code} -> https://bitbybit.org/squads`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 animate-fade-up">
      {/* Top Banner */}
      <section
        aria-labelledby="squads-hero-heading"
        className="bg-gradient-to-r from-sky-900/40 via-indigo-900/30 to-purple-900/40 border border-sky-500/20 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm"
      >
        <div className="absolute -right-8 -top-8 w-48 h-48 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2.5 py-0.5 rounded-full">
              Multiplayer Coding Clans
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              Max {SQUAD_CONFIG.MAX_MEMBERS} Members
            </span>
          </div>
          <h1
            id="squads-hero-heading"
            className="text-2xl font-display font-bold text-white tracking-tight"
          >
            Squads & College Guilds
          </h1>
          <p className="text-xs font-mono text-slate-300 mt-1 max-w-2xl">
            Never code alone. Form a 3-5 person squad with your college peers or friends. Points from
            daily problems, weekly challenges, and live 1v1 duels pool together into your Clan score!
          </p>
        </div>
      </section>

      {/* Notifications */}
      {errorMsg && (
        <div
          role="alert"
          className="bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 p-3.5 rounded-xl font-mono text-xs flex items-center justify-between shadow-sm"
        >
          <div className="flex items-center gap-2">
            <span aria-hidden="true">⚠️</span>
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            aria-label="Dismiss error"
            className="text-rose-400 hover:text-rose-300 font-bold ml-2 p-1"
          >
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 p-3.5 rounded-xl font-mono text-xs flex items-center justify-between shadow-sm"
        >
          <div className="flex items-center gap-2">
            <span aria-hidden="true">🎉</span>
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            aria-label="Dismiss success message"
            className="text-emerald-400 hover:text-emerald-300 font-bold ml-2 p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-center"
        >
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">
            Gathering your squad intel...
          </p>
        </div>
      ) : mySquad ? (
        /* User's Current Squad */
        <section
          aria-labelledby="my-squad-title"
          className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-600 dark:text-sky-400 font-mono text-xs font-bold">
                  [{mySquad.tag}]
                </span>
                <h2
                  id="my-squad-title"
                  className="text-xl font-bold font-mono text-slate-900 dark:text-zinc-100"
                >
                  {mySquad.name}
                </h2>
              </div>
              <p className="text-xs font-mono text-slate-500 dark:text-zinc-400 mt-1">
                Leader: @{mySquad.leader_github} • Total Clan Score:{" "}
                <strong className="text-amber-500">⚡ {mySquad.total_points} pts</strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-slate-100 dark:bg-zinc-800/80 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-400">Code:</span>
                <span className="font-bold text-sky-600 dark:text-sky-400 tracking-wider">
                  {mySquad.code}
                </span>
              </div>
              <button
                type="button"
                onClick={copyInvite}
                aria-label="Copy squad invite link and code"
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-mono text-xs transition flex items-center gap-1.5"
              >
                <span>{copiedCode ? "✓" : "📋"}</span>
                <span>{copiedCode ? "Copied!" : "Copy Invite"}</span>
              </button>
              <button
                type="button"
                onClick={shareWhatsApp}
                aria-label="Share squad invite on WhatsApp"
                className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-mono text-xs transition"
              >
                💬 WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setConfirmLeaveOpen(true)}
                disabled={actionLoading}
                aria-label="Leave this squad"
                className="px-3 py-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 font-mono text-xs transition"
              >
                Leave
              </button>
            </div>
          </div>

          {/* Leave Confirmation Dialog */}
          {confirmLeaveOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-leave-heading"
              className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
            >
              <div>
                <p id="confirm-leave-heading" className="font-bold text-rose-700 dark:text-rose-300">
                  Are you sure you want to leave {mySquad.name}?
                </p>
                <p className="text-rose-600/80 dark:text-rose-400/80 text-[11px] mt-0.5">
                  If you are the leader, leadership will pass to the next highest contributor.
                </p>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setConfirmLeaveOpen(false)}
                  className="px-3 py-1 rounded-lg bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-zinc-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLeave}
                  disabled={actionLoading}
                  className="px-3 py-1 rounded-lg bg-rose-600 text-white hover:bg-rose-500 transition disabled:opacity-50"
                >
                  {actionLoading ? "Leaving..." : "Yes, Leave Squad"}
                </button>
              </div>
            </div>
          )}

          {/* Member Roster */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Squad Members ({mySquad.members?.length || 1}/{SQUAD_CONFIG.MAX_MEMBERS})
              </h3>
              {(mySquad.members?.length || 1) < SQUAD_CONFIG.MAX_MEMBERS && (
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                  + {SQUAD_CONFIG.MAX_MEMBERS - (mySquad.members?.length || 1)} open slot(s)
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {mySquad.members?.map((m) => (
                <div
                  key={m.id}
                  className="bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800/80 rounded-xl p-3 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <img
                      src={`https://github.com/${m.github}.png`}
                      alt={m.name || m.github}
                      className="w-8 h-8 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-200 dark:bg-zinc-800 object-cover"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.onerror = null;
                        target.src = `https://github.com/identicons/${m.github}.png`;
                      }}
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold font-mono text-slate-800 dark:text-zinc-200">
                          {m.name || m.github}
                        </span>
                        {m.github === mySquad.leader_github && (
                          <span className="text-[9px] px-1.5 rounded bg-amber-500/20 text-amber-500 font-bold uppercase">
                            Leader
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-slate-400">@{m.github}</p>
                    </div>
                  </div>

                  <span className="text-xs font-mono font-bold text-sky-600 dark:text-sky-400">
                    +{m.points_contributed || 0} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        /* Create or Join Squad */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Squad */}
          <section
            aria-labelledby="create-squad-heading"
            className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4"
          >
            <div>
              <span className="text-xl" aria-hidden="true">
                🛡️
              </span>
              <h2
                id="create-squad-heading"
                className="text-base font-bold font-mono text-slate-900 dark:text-zinc-100 mt-1"
              >
                Create a New Squad
              </h2>
              <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                Start a clan for your college club or friend circle (up to {SQUAD_CONFIG.MAX_MEMBERS} members).
              </p>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label
                  htmlFor="squad-name-input"
                  className="text-xs font-mono font-bold text-slate-700 dark:text-zinc-300 block mb-1"
                >
                  Squad Name (3–30 characters)
                </label>
                <input
                  id="squad-name-input"
                  type="text"
                  required
                  minLength={SQUAD_CONFIG.NAME_MIN_LEN}
                  maxLength={SQUAD_CONFIG.NAME_MAX_LEN}
                  placeholder="e.g. VIT ByteBusters"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label
                  htmlFor="squad-tag-input"
                  className="text-xs font-mono font-bold text-slate-700 dark:text-zinc-300 block mb-1"
                >
                  Squad Tag (2–8 Alphanumeric characters)
                </label>
                <input
                  id="squad-tag-input"
                  type="text"
                  required
                  minLength={SQUAD_CONFIG.TAG_MIN_LEN}
                  maxLength={SQUAD_CONFIG.TAG_MAX_LEN}
                  placeholder="e.g. VIT, BYTE, DYN"
                  value={createTag}
                  onChange={(e) => setCreateTag(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 uppercase"
                />
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-mono text-xs font-bold transition shadow-sm disabled:opacity-50"
              >
                {actionLoading ? "Creating Squad..." : "Create Squad & Get Invite Code"}
              </button>
            </form>
          </section>

          {/* Join Squad */}
          <section
            aria-labelledby="join-squad-heading"
            className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4"
          >
            <div>
              <span className="text-xl" aria-hidden="true">
                🤝
              </span>
              <h2
                id="join-squad-heading"
                className="text-base font-bold font-mono text-slate-900 dark:text-zinc-100 mt-1"
              >
                Join with Code
              </h2>
              <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                Did a friend or club invite you? Enter their squad code below.
              </p>
            </div>

            <form onSubmit={handleJoin} className="space-y-3">
              <div>
                <label
                  htmlFor="squad-code-input"
                  className="text-xs font-mono font-bold text-slate-700 dark:text-zinc-300 block mb-1"
                >
                  Squad Invite Code
                </label>
                <input
                  id="squad-code-input"
                  type="text"
                  required
                  placeholder="e.g. BYTE-7A9F2E"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 uppercase tracking-wider"
                />
              </div>

              <div className="pt-7">
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition shadow-sm disabled:opacity-50"
                >
                  {actionLoading ? "Joining Squad..." : "Join Squad"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Global Clan Leaderboard */}
      <section
        aria-labelledby="clan-leaderboard-heading"
        className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm"
      >
        <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50/70 dark:bg-zinc-950/40">
          <div>
            <h3
              id="clan-leaderboard-heading"
              className="font-mono font-bold text-sm text-slate-900 dark:text-zinc-100"
            >
              🏆 Clan & College Leaderboard
            </h3>
            <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
              Ranked by combined member points earned across all challenges
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            aria-label="Refresh leaderboard"
            className="px-3 py-1 text-xs font-mono rounded-lg bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-zinc-700 transition"
          >
            ↻ Refresh
          </button>
        </div>

        {leaderboard.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <span className="text-3xl block" aria-hidden="true">
              🛡️
            </span>
            <p className="font-mono text-sm font-bold text-slate-800 dark:text-zinc-200">
              No squads on the leaderboard yet!
            </p>
            <p className="font-mono text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
              Be the first to create a squad with your peers, solve challenges, and claim the #1 spot
              for your college or club.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-100/70 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 uppercase text-[10px] border-b border-slate-200 dark:border-zinc-800">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Rank
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Squad / Guild
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Leader
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Members
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Clan Score
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {leaderboard.map((s, idx) => {
                  const rank = idx + 1;
                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="px-4 py-3 font-bold">
                        {rank === 1 ? "🥇 #1" : rank === 2 ? "🥈 #2" : rank === 3 ? "🥉 #3" : `#${rank}`}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold text-[10px]">
                            [{s.tag}]
                          </span>
                          <span className="font-bold text-slate-900 dark:text-zinc-100">{s.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-zinc-400">
                        @{s.leader_github}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-zinc-300">
                        {s.member_count ?? 1}/{SQUAD_CONFIG.MAX_MEMBERS}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-amber-500">
                        ⚡ {s.total_points} pts
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
