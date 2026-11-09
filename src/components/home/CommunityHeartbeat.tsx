"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import type { PageId } from "@/components/layout/AppShellContext";

interface CommunityHeartbeatProps {
  onNavigate: (page: PageId) => void;
  isSubscriber?: boolean;
}

interface TopSquadData {
  name: string;
  tag: string;
  total_points: number;
}

interface TopDuelData {
  problem_title: string;
  winner_github: string;
  loser_github?: string;
  time_diff_text?: string;
}

interface TopDiscussionData {
  title: string;
  content: string;
  author_name: string;
  github: string;
  upvotes: number;
}

export default function CommunityHeartbeat({ onNavigate }: CommunityHeartbeatProps) {
  const [topSquad, setTopSquad] = useState<TopSquadData | null>(null);
  const [topDuel, setTopDuel] = useState<TopDuelData | null>(null);
  const [topDiscussion, setTopDiscussion] = useState<TopDiscussionData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadCommunityHighlights = useCallback(async () => {
    try {
      const db = getSupabaseClient();

      // 1. Fetch real top squad
      const { data: squadData } = await (db.from("squads") as any)
        .select("name, tag, total_points")
        .order("total_points", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (squadData) {
        setTopSquad(squadData);
      }

      // 2. Fetch real latest duel or ghost duel match
      const { data: duelData } = await (db.from("code_duels") as any)
        .select("problem_title, host_github, guest_github, winner_github")
        .eq("status", "completed")
        .order("ended_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (duelData && duelData.winner_github) {
        const loser =
          duelData.winner_github === duelData.host_github
            ? duelData.guest_github
            : duelData.host_github;
        setTopDuel({
          problem_title: duelData.problem_title || "Algorithm Duel",
          winner_github: duelData.winner_github,
          loser_github: loser || "opponent",
          time_diff_text: "Won Live Match",
        });
      } else {
        // Check ghost match table
        const { data: ghostMatch } = await (db.from("ghost_duel_matches") as any)
          .select("problem_title, challenger_github, result, time_diff_seconds")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (ghostMatch) {
          setTopDuel({
            problem_title: ghostMatch.problem_title,
            winner_github: ghostMatch.challenger_github,
            time_diff_text:
              ghostMatch.result === "won"
                ? `Beat Ghost by ${Math.abs(ghostMatch.time_diff_seconds)}s`
                : "Raced Ghost",
          });
        }
      }

      // 3. Fetch real top ELI5 discussion
      const { data: discData } = await (db.from("problem_discussions") as any)
        .select("title, content, author_name, github, upvotes")
        .order("upvotes", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (discData) {
        setTopDiscussion(discData);
      }
    } catch (err) {
      console.warn("Could not load dynamic community highlights:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCommunityHighlights();
  }, [loadCommunityHighlights]);

  // Real-time synchronization for community changes
  useRealtimeChannel({
    channelName: "community-heartbeat-feed",
    postgresChanges: [
      {
        event: "*",
        schema: "public",
        table: "squads",
        callback: () => loadCommunityHighlights(),
      },
      {
        event: "INSERT",
        schema: "public",
        table: "ghost_duel_matches",
        callback: () => loadCommunityHighlights(),
      },
    ],
    enabled: true,
  });

  return (
    <section aria-labelledby="community-heartbeat-heading" className="space-y-4 animate-fade-up">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono font-bold tracking-widest uppercase bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">
              Community Pulse
            </span>
            <span className="text-xs font-mono text-slate-500 dark:text-zinc-400">
              Active peer highlights & clan rankings
            </span>
          </div>
          <h2
            id="community-heartbeat-heading"
            className="text-lg font-bold font-mono text-slate-900 dark:text-zinc-100"
          >
            What's Happening in BitByBit
          </h2>
        </div>

        <button
          type="button"
          onClick={() => onNavigate("squads")}
          aria-label="Explore all community squads"
          className="text-xs font-mono text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
        >
          <span>Explore All Squads</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>

      {/* 3-Column Community Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Squad / Clan of the Week */}
        <div className="bg-gradient-to-br from-indigo-950/30 via-slate-900 to-slate-950 border border-indigo-500/30 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 relative overflow-hidden">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                🛡️ Clan Ranking #1
              </span>
              <span className="text-xs font-mono font-bold text-amber-400">
                ⚡ {topSquad ? `${topSquad.total_points.toLocaleString()} pts` : "0 pts"}
              </span>
            </div>

            {loading ? (
              <div className="space-y-2 py-2">
                <div className="h-4 bg-slate-800 rounded w-2/3 animate-pulse" />
                <div className="h-3 bg-slate-800/60 rounded w-full animate-pulse" />
              </div>
            ) : topSquad ? (
              <>
                <h3 className="text-base font-bold font-mono text-white flex items-center gap-2">
                  <span className="text-indigo-400">[{topSquad.tag}]</span>
                  <span>{topSquad.name}</span>
                </h3>
                <p className="text-xs font-mono text-slate-400 leading-relaxed">
                  Leading the global clan standings with points pooled from daily problems, weekly
                  challenges, and duels.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold font-mono text-white">Assemble Your Clan</h3>
                <p className="text-xs font-mono text-slate-400 leading-relaxed">
                  No clan holds the throne yet. Rally 3–5 college friends or peers to claim the #1
                  spot on the leaderboard!
                </p>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigate("squads")}
            className="w-full py-2 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-xs font-mono font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>{topSquad ? "View Clan Standings →" : "Create First Clan →"}</span>
          </button>
        </div>

        {/* 2. Duel of the Day */}
        <div className="bg-gradient-to-br from-cyan-950/30 via-slate-900 to-slate-950 border border-cyan-500/30 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 relative overflow-hidden">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                ⚔️ Duels & Ghosts
              </span>
              <span className="text-[10px] font-mono text-cyan-300">
                {topDuel?.time_diff_text || "Live & Async"}
              </span>
            </div>

            {loading ? (
              <div className="space-y-2 py-2">
                <div className="h-4 bg-slate-800 rounded w-2/3 animate-pulse" />
                <div className="h-3 bg-slate-800/60 rounded w-full animate-pulse" />
              </div>
            ) : topDuel ? (
              <>
                <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 font-mono text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="font-bold text-white">@{topDuel.winner_github}</span>
                  </div>
                  <span className="text-amber-400 font-bold text-[10px]">VICTORY</span>
                  {topDuel.loser_github && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-400">@{topDuel.loser_github}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs font-mono text-slate-400 leading-relaxed truncate">
                  Problem: <strong>{topDuel.problem_title}</strong>.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold font-mono text-white">
                  1v1 Battle Arena Ready
                </h3>
                <p className="text-xs font-mono text-slate-400 leading-relaxed">
                  Challenge a friend to a real-time showdown or race against an asynchronous Ghost
                  runner at your own speed!
                </p>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigate("duels")}
            className="w-full py-2 rounded-xl bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-cyan-200 text-xs font-mono font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>{topDuel ? "Enter Duels & Race Ghosts →" : "Start a Duel Now →"}</span>
          </button>
        </div>

        {/* 3. Top Community Explanation (ELI5) */}
        <div className="bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-950 border border-amber-500/30 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 relative overflow-hidden">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                💡 Top Mentor Take
              </span>
              <span className="text-xs font-mono text-amber-400 font-bold">
                👍 {topDiscussion?.upvotes || 0} Upvotes
              </span>
            </div>

            {loading ? (
              <div className="space-y-2 py-2">
                <div className="h-4 bg-slate-800 rounded w-2/3 animate-pulse" />
                <div className="h-3 bg-slate-800/60 rounded w-full animate-pulse" />
              </div>
            ) : topDiscussion ? (
              <>
                <h3 className="text-sm font-bold font-mono text-white truncate">
                  "{topDiscussion.title}"
                </h3>
                <p className="text-xs font-mono text-slate-400 leading-relaxed line-clamp-3">
                  {topDiscussion.content}
                </p>
                <div className="text-[10px] font-mono text-amber-300">
                  By @{topDiscussion.github}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-bold font-mono text-white">
                  Be the First Community Mentor
                </h3>
                <p className="text-xs font-mono text-slate-400 leading-relaxed">
                  Explain tricky algorithms in plain English on any problem's discussion tab to
                  earn peer upvotes and mentor badges!
                </p>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigate("problems")}
            className="w-full py-2 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 text-amber-200 text-xs font-mono font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>{topDiscussion ? "Browse Problem Intuitions →" : "Share First Solution →"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
