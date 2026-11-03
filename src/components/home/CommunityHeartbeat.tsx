"use client";

import React from "react";
import type { PageId } from "@/components/layout/AppShellContext";

interface CommunityHeartbeatProps {
  onNavigate: (page: PageId) => void;
  isSubscriber?: boolean;
}

export default function CommunityHeartbeat({ onNavigate, isSubscriber }: CommunityHeartbeatProps) {
  return (
    <div className="space-y-4 animate-fade-up">
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
          <h2 className="text-lg font-bold font-mono text-slate-900 dark:text-zinc-100">
            What's Happening in BitByBit
          </h2>
        </div>

        <button
          onClick={() => onNavigate("squads")}
          className="text-xs font-mono text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
        >
          <span>Explore All Squads</span>
          <span>→</span>
        </button>
      </div>

      {/* 3-Column Community Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Squad / Clan of the Week */}
        <div className="bg-gradient-to-br from-indigo-950/30 via-slate-900 to-slate-950 border border-indigo-500/30 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 relative overflow-hidden">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                🛡️ Clan of the Week
              </span>
              <span className="text-xs font-mono font-bold text-amber-400">
                ⚡ 38,400 pts
              </span>
            </div>

            <h3 className="text-base font-bold font-mono text-white flex items-center gap-2">
              <span className="text-indigo-400">[VIT]</span>
              <span>ByteBusters</span>
            </h3>

            <p className="text-xs font-mono text-slate-400 leading-relaxed">
              5 college friends holding the #1 spot on the global clan leaderboard with an unbroken 14-day team streak.
            </p>
          </div>

          <button
            onClick={() => onNavigate("squads")}
            className="w-full py-2 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 text-xs font-mono font-bold transition flex items-center justify-center gap-1.5"
          >
            <span>Rally Your Own Squad →</span>
          </button>
        </div>

        {/* 2. Duel of the Day */}
        <div className="bg-gradient-to-br from-cyan-950/30 via-slate-900 to-slate-950 border border-cyan-500/30 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 relative overflow-hidden">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                ⚔️ Duel of the Day
              </span>
              <span className="text-[10px] font-mono text-cyan-300">
                Won by 8s!
              </span>
            </div>

            <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 font-mono text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="font-bold text-white">@karthik</span>
              </div>
              <span className="text-rose-400 font-bold">VS</span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-400">@priya_dev</span>
                <span className="w-2 h-2 rounded-full bg-slate-500" />
              </div>
            </div>

            <p className="text-xs font-mono text-slate-400 leading-relaxed">
              Problem: <strong>Valid Parentheses</strong>. 10/10 test cases passed under intense 3-minute battle pressure.
            </p>
          </div>

          <button
            onClick={() => onNavigate("duels")}
            className="w-full py-2 rounded-xl bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-cyan-200 text-xs font-mono font-bold transition flex items-center justify-center gap-1.5"
          >
            <span>Challenge Someone in 1v1 →</span>
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
                👍 28 Upvotes
              </span>
            </div>

            <h3 className="text-sm font-bold font-mono text-white truncate">
              "Why a Hash Map turns O(N²) into O(N)"
            </h3>

            <p className="text-xs font-mono text-slate-400 leading-relaxed line-clamp-3">
              "Imagine searching for your matching socks in a giant unorganized basket. Instead of checking every pair, you have labelled cubbies on your wall..."
            </p>
          </div>

          <button
            onClick={() => onNavigate("problems")}
            className="w-full py-2 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 text-amber-200 text-xs font-mono font-bold transition flex items-center justify-center gap-1.5"
          >
            <span>Browse Problem Intuitions →</span>
          </button>
        </div>
      </div>
    </div>
  );
}
