"use client";

import React, { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import type { CommunityPoll } from "@/types/community";
import type { User } from "@/types/database";

interface DailyCommunityPollProps {
  user: User | null;
}

const FALLBACK_POLL: CommunityPoll = {
  id: "daily-default-1",
  question: "🔥 Daily Debate: Recursion vs Iteration in Technical Interviews — which is your go-to?",
  options: [
    { id: "opt-1", text: "Recursion (Cleaner, easier to visualize trees/graphs)", votes: 42 },
    { id: "opt-2", text: "Iteration (No stack overflow risk, faster in prod)", votes: 68 },
    { id: "opt-3", text: "Depends on whether the interviewer asks for O(1) space", votes: 85 },
  ],
  is_active: true,
  created_at: new Date().toISOString(),
};

export default function DailyCommunityPoll({ user }: DailyCommunityPollProps) {
  const [poll, setPoll] = useState<CommunityPoll>(FALLBACK_POLL);
  const [votedOptionId, setVotedOptionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const db = getSupabaseClient();

  useEffect(() => {
    async function loadActivePoll() {
      try {
        const { data, error } = await (db.from("community_polls") as any)
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          const rawOptions = Array.isArray(data.options) ? data.options : [];
          setPoll({
            id: data.id,
            question: data.question,
            options: rawOptions,
            expires_at: data.expires_at,
            is_active: data.is_active,
            created_at: data.created_at,
          });

          // Check if user already voted on this poll
          if (user?.github) {
            const { data: voteData } = await (db.from("community_poll_votes") as any)
              .select("option_id")
              .eq("poll_id", data.id)
              .eq("github", user.github)
              .maybeSingle();

            if (voteData?.option_id) {
              setVotedOptionId(voteData.option_id);
            }
          }
        }
      } catch (err) {
        console.warn("Could not load community poll, using default", err);
      } finally {
        setLoading(false);
      }
    }

    loadActivePoll();
  }, [user?.github]);

  async function handleVote(optionId: string) {
    if (!user) {
      alert("Please sign in with GitHub to vote in daily community polls!");
      return;
    }
    if (votedOptionId || submitting) return;

    setSubmitting(true);
    setVotedOptionId(optionId);

    // Optimistically update vote counts
    const updatedOptions = poll.options.map((opt) =>
      opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt
    );
    setPoll((prev) => ({ ...prev, options: updatedOptions }));

    try {
      if (poll.id !== "daily-default-1") {
        // Record vote in DB
        await (db.from("community_poll_votes") as any).insert({
          poll_id: poll.id,
          github: user.github,
          option_id: optionId,
        });

        // Update poll options payload
        await (db.from("community_polls") as any)
          .update({ options: updatedOptions })
          .eq("id", poll.id);
      }
    } catch (err) {
      console.error("Failed to persist vote", err);
    } finally {
      setSubmitting(false);
    }
  }

  const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes || 0), 0);

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-sky-950/40 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 relative overflow-hidden">
      {/* Decorative accent */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 relative z-10">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest font-bold bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
            Daily Community Question
          </span>
          <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-500">
            • {totalVotes} votes cast
          </span>
        </div>
        <span className="text-xs font-mono text-slate-400">
          {votedOptionId ? "✓ You voted" : "Pick an answer to see community stats"}
        </span>
      </div>

      {/* Question */}
      <h3 className="text-base sm:text-lg font-display font-bold text-slate-900 dark:text-white leading-snug">
        {poll.question}
      </h3>

      {/* Options List */}
      <div className="space-y-2.5 pt-1">
        {poll.options.map((opt) => {
          const isSelected = votedOptionId === opt.id;
          const pct = totalVotes > 0 ? Math.round(((opt.votes || 0) / totalVotes) * 100) : 0;

          return (
            <button
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              disabled={submitting}
              className={`w-full text-left p-3 rounded-xl border transition-all relative overflow-hidden flex items-center justify-between ${
                isSelected
                  ? "bg-sky-500/15 border-sky-400 text-sky-900 dark:text-sky-200 shadow-sm"
                  : votedOptionId
                  ? "bg-slate-50 dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 opacity-90"
                  : "bg-white dark:bg-zinc-900/90 hover:bg-slate-50 dark:hover:bg-zinc-800 border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 cursor-pointer"
              }`}
            >
              {/* Animated Progress fill when voted */}
              {votedOptionId && (
                <div
                  className={`absolute inset-y-0 left-0 transition-all duration-700 ease-out ${
                    isSelected ? "bg-sky-500/25" : "bg-slate-200/50 dark:bg-zinc-800/60"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              )}

              <div className="relative z-10 flex items-center gap-2.5 min-w-0 pr-4">
                <span
                  className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 text-[10px] ${
                    isSelected
                      ? "border-sky-400 bg-sky-500 text-white font-bold"
                      : "border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
                  }`}
                >
                  {isSelected ? "✓" : ""}
                </span>
                <span className="text-xs font-mono font-medium truncate">{opt.text}</span>
              </div>

              {votedOptionId && (
                <div className="relative z-10 shrink-0 font-mono text-xs font-bold text-slate-700 dark:text-zinc-300 pl-2">
                  {pct}% <span className="text-[10px] font-normal text-slate-400">({opt.votes})</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
