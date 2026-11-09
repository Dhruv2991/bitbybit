"use client";

import React, { useMemo } from "react";
import type { Problem } from "@/types/database";

interface ProblemQuestRoadmapProps {
  problems: Problem[];
  solvedIds: string[];
  onSelectProblem: (problem: Problem) => void;
  weeklyIds?: Set<string>;
  unlockedIds?: Set<string>;
  paidEndedIds?: Set<string>;
}

interface QuestRealm {
  id: string;
  title: string;
  tagline: string;
  icon: string;
  color: string;
  filterKeywords: string[];
}

const REALMS: QuestRealm[] = [
  {
    id: "realm-arrays",
    title: "Realm I: Arrays & Two Pointers",
    tagline: "Master sequential traversal, pointer manipulation, and in-place swapping.",
    icon: "🛡️",
    color: "from-sky-500/20 to-blue-500/10 border-sky-500/30 text-sky-400",
    filterKeywords: ["array", "pointer", "two-pointer", "sort", "easy"],
  },
  {
    id: "realm-hashing",
    title: "Realm II: Hash Maps & Sliding Window",
    tagline: "Trade memory for speed. Substring matching, frequency maps, and window expansion.",
    icon: "⚡",
    color: "from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-400",
    filterKeywords: ["hash", "map", "string", "window", "sliding", "frequency"],
  },
  {
    id: "realm-stacks",
    title: "Realm III: Stacks, Queues & Recursion",
    tagline: "LIFO state tracking, monotonic stacks, and nested structure evaluation.",
    icon: "🧠",
    color: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400",
    filterKeywords: ["stack", "queue", "recursion", "backtracking", "parentheses"],
  },
  {
    id: "realm-trees",
    title: "Realm IV: Trees & Graph Traversal",
    tagline: "Navigate non-linear hierarchies with BFS, DFS, and topological ordering.",
    icon: "🌳",
    color: "from-purple-500/20 to-indigo-500/10 border-purple-500/30 text-purple-400",
    filterKeywords: ["tree", "graph", "bfs", "dfs", "binary", "path"],
  },
  {
    id: "realm-dp",
    title: "Realm V: The Citadel (Dynamic Programming & Bosses)",
    tagline: "Break down complex problems into overlapping subproblems and optimal substructures.",
    icon: "👑",
    color: "from-rose-500/20 to-red-500/10 border-rose-500/30 text-rose-400",
    filterKeywords: ["dp", "dynamic", "hard", "optimization", "subsequence", "greedy"],
  },
];

export default function ProblemQuestRoadmap({
  problems,
  solvedIds,
  onSelectProblem,
}: ProblemQuestRoadmapProps) {
  // Categorize problems into realms
  const realmBuckets = useMemo(() => {
    const buckets: Record<string, Problem[]> = {
      "realm-arrays": [],
      "realm-hashing": [],
      "realm-stacks": [],
      "realm-trees": [],
      "realm-dp": [],
    };

    const usedIds = new Set<string>();

    // 1. Keyword-based matching
    for (const r of REALMS) {
      for (const p of problems) {
        if (usedIds.has(p.id)) continue;
        const tags = (p.tags || []).map((t) => t.toLowerCase());
        const titleWords = p.title.toLowerCase().split(" ");
        const allTerms = [...tags, ...titleWords];

        const matches = r.filterKeywords.some((kw) =>
          allTerms.some((term) => term.includes(kw))
        );

        if (matches) {
          buckets[r.id].push(p);
          usedIds.add(p.id);
        }
      }
    }

    // 2. Distribute any remaining problems evenly
    for (const p of problems) {
      if (!usedIds.has(p.id)) {
        if (p.difficulty === "Easy") buckets["realm-arrays"].push(p);
        else if (p.difficulty === "Hard") buckets["realm-dp"].push(p);
        else buckets["realm-stacks"].push(p);
        usedIds.add(p.id);
      }
    }

    return buckets;
  }, [problems]);

  const totalSolved = solvedIds.length;

  return (
    <div className="space-y-10 py-4 animate-fade-up">
      {/* Top Quest Banner */}
      <section
        aria-labelledby="quest-roadmap-heading"
        className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/20 rounded-2xl p-6 relative overflow-hidden backdrop-blur-md"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-0.5 rounded-full">
                Interactive DSA Quest Tree
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                5 Realms • Progressive Skill Mastery
              </span>
            </div>
            <h2
              id="quest-roadmap-heading"
              className="text-xl font-bold font-mono text-white"
            >
              The Developer's Journey
            </h2>
            <p className="text-xs font-mono text-slate-300 mt-1 max-w-xl">
              Forget endless tables. Move through structured skill realms, conquer boss battles, and
              unlock badges with your squad!
            </p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex items-center gap-4 shrink-0 font-mono">
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">
                Total Conquered
              </span>
              <span className="text-lg font-bold text-emerald-400">
                {totalSolved} / {problems.length}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Overall quest progress"
              aria-valuenow={problems.length > 0 ? Math.round((totalSolved / problems.length) * 100) : 0}
              aria-valuemin={0}
              aria-valuemax={100}
              className="w-12 h-12 rounded-full border-2 border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-300"
            >
              {problems.length > 0 ? Math.round((totalSolved / problems.length) * 100) : 0}%
            </div>
          </div>
        </div>
      </section>

      {/* Empty State for zero problems */}
      {problems.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-12 text-center space-y-3">
          <span className="text-3xl block" aria-hidden="true">
            🗺️
          </span>
          <h3 className="text-base font-bold font-mono text-slate-900 dark:text-zinc-100">
            No problems loaded yet in the DSA Quest Realms
          </h3>
          <p className="text-xs font-mono text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
            Check back soon for new coding quests and boss challenges!
          </p>
        </div>
      ) : (
        /* Realms Map */
        <div className="space-y-8">
          {REALMS.map((realm) => {
            const realmProblems = realmBuckets[realm.id] || [];
            if (realmProblems.length === 0) return null;

            const solvedInRealm = realmProblems.filter((p) => solvedIds.includes(p.id)).length;
            const realmPct = Math.round((solvedInRealm / realmProblems.length) * 100);

            return (
              <section
                key={realm.id}
                aria-labelledby={`realm-title-${realm.id}`}
                className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5"
              >
                {/* Realm Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 pb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-xl shrink-0"
                      aria-hidden="true"
                    >
                      {realm.icon}
                    </div>
                    <div>
                      <h3
                        id={`realm-title-${realm.id}`}
                        className="text-base font-bold font-mono text-slate-900 dark:text-zinc-100 flex items-center gap-2"
                      >
                        <span>{realm.title}</span>
                      </h3>
                      <p className="text-xs font-mono text-slate-500 dark:text-zinc-400 mt-0.5">
                        {realm.tagline}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-slate-500 dark:text-zinc-400">
                      {solvedInRealm}/{realmProblems.length} Mastered
                    </span>
                    <div
                      role="progressbar"
                      aria-label={`${realm.title} completion`}
                      aria-valuenow={realmPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="w-24 bg-slate-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden"
                    >
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${realmPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Quest Nodes Grid / Roadmap */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 relative">
                  {realmProblems.map((prob, i) => {
                    const isSolved = solvedIds.includes(prob.id);
                    const isBoss = i === realmProblems.length - 1 && realmProblems.length >= 3;

                    return (
                      <button
                        key={prob.id}
                        type="button"
                        onClick={() => onSelectProblem(prob)}
                        aria-label={`Enter quest: ${prob.title}, Difficulty: ${prob.difficulty}, Status: ${
                          isSolved ? "Solved" : "Unsolved"
                        }`}
                        className={`p-3.5 rounded-xl border text-left transition-all duration-150 flex flex-col justify-between group relative overflow-hidden cursor-pointer ${
                          isSolved
                            ? "bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-100 shadow-xs"
                            : isBoss
                            ? "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/30 text-slate-900 dark:text-zinc-100 shadow-xs"
                            : "bg-slate-50 dark:bg-zinc-950/60 hover:bg-white dark:hover:bg-zinc-900 border-slate-200 dark:border-zinc-800/80 text-slate-900 dark:text-zinc-100"
                        }`}
                      >
                        <div className="space-y-1.5 w-full">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-400 dark:text-zinc-500">
                              {isBoss ? "🏆 BOSS QUEST" : `QUEST ${i + 1}`}
                            </span>
                            {isSolved ? (
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold">
                                ✓ Solved
                              </span>
                            ) : (
                              <span
                                className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${
                                  prob.difficulty === "Easy"
                                    ? "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : prob.difficulty === "Medium"
                                    ? "bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                    : "bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                }`}
                              >
                                {prob.difficulty}
                              </span>
                            )}
                          </div>

                          <h4 className="text-xs font-mono font-bold group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors truncate">
                            {prob.title}
                          </h4>
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 dark:text-zinc-500 pt-2 border-t border-slate-100 dark:border-zinc-800/60 mt-2">
                          <span>⚡ {prob.points || 100} pts</span>
                          <span className="text-sky-600 dark:text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            Enter →
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
