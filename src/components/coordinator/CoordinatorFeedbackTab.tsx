"use client";

import React, { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import type { ContestFeedback } from "@/types/database";

interface CoordinatorFeedbackTabProps {
  showToast: (msg: string, type?: "ok" | "err" | "warn" | "info") => void;
}

export default function CoordinatorFeedbackTab({ showToast }: CoordinatorFeedbackTabProps) {
  const db = getSupabaseClient();
  const [feedback, setFeedback] = useState<ContestFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [contestFilter, setContestFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await (db.from("contest_feedback") as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFeedback((data || []) as ContestFeedback[]);
    } catch (err: any) {
      showToast("Failed to load feedback: " + (err.message || ""), "err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const contestNames = Array.from(
    new Set(feedback.map((f) => f.contest_name).filter(Boolean))
  ).sort();

  const filtered = feedback.filter((f) => {
    if (contestFilter !== "all" && f.contest_name !== contestFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchContest = (f.contest_name || "").toLowerCase().includes(q);
      const matchComments = (f.comments || "").toLowerCase().includes(q);
      const matchUser = (f.github || "").toLowerCase().includes(q);
      if (!matchContest && !matchComments && !matchUser) return false;
    }
    return true;
  });

  const rated = filtered.filter((f) => f.rating);
  const avgRating = rated.length
    ? (rated.reduce((sum, f) => sum + (f.rating || 0), 0) / rated.length).toFixed(1)
    : "—";

  const recommendYes = filtered.filter((f) => f.would_recommend === true).length;
  const recommendNo = filtered.filter((f) => f.would_recommend === false).length;
  const recommendTotal = recommendYes + recommendNo;
  const recommendPct = recommendTotal > 0 ? Math.round((recommendYes / recommendTotal) * 100) : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500 font-mono text-sm">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mb-3" />
        Loading participant feedback...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4">
          <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">Total Responses</p>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-zinc-100 mt-1">
            {feedback.length}
          </p>
        </div>

        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs font-mono text-amber-600 dark:text-amber-400">Average Rating</p>
          <p className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-300 mt-1 flex items-center gap-1.5">
            <span>⭐ {avgRating}</span>
            <span className="text-xs text-amber-600/70 dark:text-amber-400/70 font-normal">/ 5.0</span>
          </p>
        </div>

        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
          <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">Recommendation Rate</p>
          <p className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-300 mt-1">
            {recommendPct !== null ? `${recommendPct}%` : "—"}
          </p>
        </div>

        <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl p-4">
          <p className="text-xs font-mono text-sky-600 dark:text-sky-400">Contests Covered</p>
          <p className="text-2xl font-bold font-mono text-sky-700 dark:text-sky-300 mt-1">
            {contestNames.length}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search feedback or user..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 w-full sm:w-64"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <select
            value={contestFilter}
            onChange={(e) => setContestFilter(e.target.value)}
            className="bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-sky-500"
          >
            <option value="all">All Contests ({feedback.length})</option>
            {contestNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <button
            onClick={load}
            className="px-3 py-1.5 text-xs font-mono rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 transition"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Feedback Feed */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-12 text-center text-slate-400 dark:text-zinc-500 font-mono text-xs">
          No feedback entries found matching your filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 px-2 py-0.5 rounded border border-sky-200 dark:border-sky-900">
                  {item.contest_name}
                </span>
                <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">
                  {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs font-mono">
                {item.rating && (
                  <div className="flex items-center gap-1 text-amber-500 font-bold">
                    {"★".repeat(item.rating)}
                    <span className="text-slate-400 dark:text-zinc-600 font-normal">
                      {"★".repeat(5 - item.rating)}
                    </span>
                    <span className="text-slate-700 dark:text-zinc-300 ml-1">({item.rating}/5)</span>
                  </div>
                )}
                {item.would_recommend !== undefined && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                      item.would_recommend
                        ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                        : "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400"
                    }`}
                  >
                    {item.would_recommend ? "Recommends 👍" : "Needs Work 👎"}
                  </span>
                )}
              </div>

              {item.comments && (
                <div className="bg-slate-50 dark:bg-zinc-950/50 rounded-lg p-3 text-xs font-mono text-slate-700 dark:text-zinc-300 border border-slate-100 dark:border-zinc-800/60 leading-relaxed whitespace-pre-wrap">
                  "{item.comments}"
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800 text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                <span>
                  By:{" "}
                  {item.github ? (
                    <a
                      href={`https://github.com/${item.github}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-600 dark:text-sky-400 hover:underline"
                    >
                      @{item.github}
                    </a>
                  ) : (
                    "Anonymous"
                  )}
                </span>
                {item.difficulty && (
                  <span className="capitalize">Difficulty: {item.difficulty}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
