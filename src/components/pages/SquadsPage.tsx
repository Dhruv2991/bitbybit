"use client";

import React, { useState, useEffect } from "react";
import type { User } from "@/types/database";
import type { Squad } from "@/types/community";
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

const FALLBACK_LEADERBOARD: Squad[] = [
  {
    id: "fb-1",
    name: "VIT ByteBusters",
    tag: "VIT",
    code: "VIT-4091",
    leader_github: "rahul_dev",
    total_points: 38400,
    created_at: new Date().toISOString(),
    member_count: 5,
  },
  {
    id: "fb-2",
    name: "IIT Dynamic Programmers",
    tag: "IIT",
    code: "IIT-2194",
    leader_github: "ananya_s",
    total_points: 32150,
    created_at: new Date().toISOString(),
    member_count: 4,
  },
  {
    id: "fb-3",
    name: "Recursion Rebels",
    tag: "REBL",
    code: "REBL-9920",
    leader_github: "karthik_k",
    total_points: 29800,
    created_at: new Date().toISOString(),
    member_count: 5,
  },
];

export default function SquadsPage({ user }: SquadsPageProps) {
  const [mySquad, setMySquad] = useState<Squad | null>(null);
  const [leaderboard, setLeaderboard] = useState<Squad[]>(FALLBACK_LEADERBOARD);
  const [loading, setLoading] = useState(true);

  // Forms
  const [createName, setCreateName] = useState("");
  const [createTag, setCreateTag] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  async function loadData() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [userSquad, lb] = await Promise.all([
        user?.github ? getUserSquadAction(user.github) : Promise.resolve(null),
        getSquadsLeaderboardAction(),
      ]);

      setMySquad(userSquad);
      if (lb && lb.length > 0) {
        setLeaderboard(lb);
      }
    } catch (err) {
      console.warn("Could not load squad data", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [user?.github]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      alert("Please sign in to create a squad!");
      return;
    }
    if (!createName.trim() || !createTag.trim()) return;

    setActionLoading(true);
    setErrorMsg(null);
    const res = await createSquadAction(createName, createTag, user.github, user.name);
    setActionLoading(false);

    if (res.success) {
      setCreateName("");
      setCreateTag("");
      loadData();
    } else {
      setErrorMsg(res.error || "Failed to create squad");
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      alert("Please sign in to join a squad!");
      return;
    }
    if (!joinCode.trim()) return;

    setActionLoading(true);
    setErrorMsg(null);
    const res = await joinSquadAction(joinCode, user.github, user.name);
    setActionLoading(false);

    if (res.success) {
      setJoinCode("");
      loadData();
    } else {
      setErrorMsg(res.error || "Failed to join squad");
    }
  }

  async function handleLeave() {
    if (!user || !mySquad) return;
    if (!confirm(`Are you sure you want to leave ${mySquad.name}?`)) return;

    setActionLoading(true);
    const res = await leaveSquadAction(mySquad.id, user.github);
    setActionLoading(false);

    if (res.success) {
      setMySquad(null);
      loadData();
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
      <div className="bg-gradient-to-r from-sky-900/40 via-indigo-900/30 to-purple-900/40 border border-sky-500/20 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm">
        <div className="absolute -right-8 -top-8 w-48 h-48 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2.5 py-0.5 rounded-full">
              Multiplayer Coding Clans
            </span>
            <span className="text-[10px] font-mono text-slate-400">3–5 Members</span>
          </div>
          <h1 className="text-2xl font-display font-bold text-white tracking-tight">
            Squads & College Guilds
          </h1>
          <p className="text-xs font-mono text-slate-300 mt-1 max-w-2xl">
            Never code alone. Form a 3-5 person squad with your college peers or friends. Points from daily problems, weekly challenges, and live 1v1 duels pool together into your Clan score!
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 p-3 rounded-xl font-mono text-xs flex items-center justify-between">
          <span>⚠️ {errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 font-bold ml-2">✕</button>
        </div>
      )}

      {/* User's Squad or Create/Join */}
      {mySquad ? (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-600 dark:text-sky-400 font-mono text-xs font-bold">
                  [{mySquad.tag}]
                </span>
                <h2 className="text-xl font-bold font-mono text-slate-900 dark:text-zinc-100">
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
                <span className="font-bold text-sky-600 dark:text-sky-400">{mySquad.code}</span>
              </div>
              <button
                onClick={copyInvite}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-mono text-xs transition"
              >
                {copiedCode ? "✓ Copied!" : "📋 Copy Invite"}
              </button>
              <button
                onClick={shareWhatsApp}
                className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 font-mono text-xs transition"
              >
                💬 WhatsApp
              </button>
              <button
                onClick={handleLeave}
                disabled={actionLoading}
                className="px-3 py-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 font-mono text-xs transition"
              >
                Leave
              </button>
            </div>
          </div>

          {/* Member Roster */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Squad Members ({mySquad.members?.length || 1}/5)
              </h3>
              {(mySquad.members?.length || 1) < 5 && (
                <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                  + {5 - (mySquad.members?.length || 1)} open slot(s)
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
                      alt={m.name}
                      className="w-8 h-8 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-200 dark:bg-zinc-800"
                      onError={(e) => {
                        (e.target as any).src = `https://github.com/identicons/${m.github}.png`;
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
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Squad */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div>
              <span className="text-xl">🛡️</span>
              <h2 className="text-base font-bold font-mono text-slate-900 dark:text-zinc-100 mt-1">
                Create a New Squad
              </h2>
              <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                Start a clan for your college club or friend circle (up to 5 members).
              </p>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs font-mono font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                  Squad Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VIT ByteBusters"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-xs font-mono font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                  Squad Tag (3-4 Characters)
                </label>
                <input
                  type="text"
                  required
                  maxLength={4}
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
                {actionLoading ? "Creating..." : "Create Squad & Get Invite Code"}
              </button>
            </form>
          </div>

          {/* Join Squad */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div>
              <span className="text-xl">🤝</span>
              <h2 className="text-base font-bold font-mono text-slate-900 dark:text-zinc-100 mt-1">
                Join with Code
              </h2>
              <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                Did a friend or club invite you? Enter their squad code below.
              </p>
            </div>

            <form onSubmit={handleJoin} className="space-y-3">
              <div>
                <label className="text-xs font-mono font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                  Squad Invite Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BYTE-4921"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 uppercase"
                />
              </div>

              <div className="pt-7">
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold transition shadow-sm disabled:opacity-50"
                >
                  {actionLoading ? "Joining..." : "Join Squad"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Clan Leaderboard */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-slate-50/70 dark:bg-zinc-950/40">
          <div>
            <h3 className="font-mono font-bold text-sm text-slate-900 dark:text-zinc-100">
              🏆 Clan & College Leaderboard
            </h3>
            <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
              Ranked by combined member points earned across all challenges
            </p>
          </div>
          <button
            onClick={loadData}
            className="px-3 py-1 text-xs font-mono rounded-lg bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300"
          >
            ↻ Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-100/70 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 uppercase text-[10px] border-b border-slate-200 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Squad / Guild</th>
                <th className="px-4 py-3">Leader</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3 text-right">Clan Score</th>
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
                      {s.member_count || 1}/5
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
      </div>
    </div>
  );
}
