"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { CommunityPoll } from "@/types/community";
import type { User } from "@/types/database";
import { getSupabaseClient } from "@/lib/supabase";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import { CANONICAL_DAILY_POLL } from "@/config/community";
import { voteDailyPollAction } from "@/app/actions/polls";

interface DailyCommunityPollProps {
  user: User | null;
}

export default function DailyCommunityPoll({ user }: DailyCommunityPollProps) {
  const [poll, setPoll] = useState<CommunityPoll>(CANONICAL_DAILY_POLL);
  const [votedOptionId, setVotedOptionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPoll = useCallback(async () => {
    try {
      const db = getSupabaseClient();
      const { data: dbPoll } = await (db.from("community_polls") as any)
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const pollData: CommunityPoll = dbPoll
        ? {
            id: dbPoll.id,
            question: dbPoll.question,
            options: Array.isArray(dbPoll.options) ? dbPoll.options : [],
            created_by: dbPoll.created_by,
            expires_at: dbPoll.expires_at,
            is_active: dbPoll.is_active,
            created_at: dbPoll.created_at,
          }
        : CANONICAL_DAILY_POLL;

      setPoll(pollData);

      if (user?.github) {
        const { data: voteData } = await (db.from("community_poll_votes") as any)
          .select("option_id")
          .eq("poll_id", pollData.id)
          .eq("github", user.github)
          .maybeSingle();

        if (voteData?.option_id) {
          setVotedOptionId(voteData.option_id);
        }
      }
    } catch (err) {
      console.warn("Could not load community poll:", err);
      setPoll(CANONICAL_DAILY_POLL);
    } finally {
      setLoading(false);
    }
  }, [user?.github]);

  useEffect(() => {
    loadPoll();
  }, [loadPoll]);

  // Subscribe to real-time poll updates across users
  useRealtimeChannel({
    channelName: "community-daily-polls",
    postgresChanges: [
      {
        event: "UPDATE",
        schema: "public",
        table: "community_polls",
        callback: () => loadPoll(),
      },
    ],
    enabled: true,
  });

  async function handleVote(optionId: string) {
    if (!user) {
      setNotice("Please sign in with GitHub to cast your vote!");
      return;
    }
    if (votedOptionId || submitting) return;

    setSubmitting(true);
    setNotice(null);

    // Optimistic UI update
    setVotedOptionId(optionId);
    const optimisticOptions = poll.options.map((opt) =>
      opt.id === optionId ? { ...opt, votes: (opt.votes || 0) + 1 } : opt
    );
    setPoll((prev) => ({ ...prev, options: optimisticOptions }));

    const { data: { session } } = await getSupabaseClient().auth.getSession();
    const res = await voteDailyPollAction(poll.id, optionId, user.github, session?.access_token);
    setSubmitting(false);

    if (res.success && res.updatedOptions) {
      setPoll((prev) => ({ ...prev, options: res.updatedOptions! }));
    } else if (!res.success) {
      setNotice(res.error || "Could not record vote. Please try again.");
      // Rollback to server state
      loadPoll();
    }
  }

  const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes || 0), 0);

  return (
    <section
      aria-labelledby="daily-poll-title"
      className="bg-gradient-to-r from-slate-900 via-slate-900 to-sky-950/40 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4 relative overflow-hidden"
    >
      {/* Decorative accent */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 relative z-10">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest font-bold bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
            Daily Community Question
          </span>
          <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-500">
            • {totalVotes.toLocaleString()} votes cast
          </span>
        </div>
        <span className="text-xs font-mono text-slate-400">
          {votedOptionId ? "✓ You voted" : "Pick an answer to see community stats"}
        </span>
      </div>

      {notice && (
        <div
          role="status"
          className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-mono p-2.5 rounded-lg flex items-center justify-between"
        >
          <span>💡 {notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-amber-400 hover:text-amber-300 font-bold ml-2"
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      {/* Question */}
      <h3
        id="daily-poll-title"
        className="text-base sm:text-lg font-display font-bold text-slate-900 dark:text-white leading-snug"
      >
        {poll.question}
      </h3>

      {/* Options List */}
      <div
        role="radiogroup"
        aria-labelledby="daily-poll-title"
        className="space-y-2.5 pt-1"
      >
        {poll.options.map((opt) => {
          const isSelected = votedOptionId === opt.id;
          const pct = totalVotes > 0 ? Math.round(((opt.votes || 0) / totalVotes) * 100) : 0;

          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => handleVote(opt.id)}
              disabled={submitting || !!votedOptionId}
              className={`w-full text-left p-3 rounded-xl border transition-all relative overflow-hidden flex items-center justify-between ${
                isSelected
                  ? "bg-sky-500/15 border-sky-400 text-sky-900 dark:text-sky-200 shadow-sm"
                  : votedOptionId
                  ? "bg-slate-50 dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 opacity-90"
                  : "bg-white dark:bg-zinc-900/90 hover:bg-slate-50 dark:hover:bg-zinc-800 border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 cursor-pointer"
              }`}
            >
              {/* Progress bar fill when voted */}
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
                  {pct}%{" "}
                  <span className="text-[10px] font-normal text-slate-400">
                    ({opt.votes || 0})
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
