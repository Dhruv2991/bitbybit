"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { ProblemDiscussion, ApproachType } from "@/types/community";
import type { User } from "@/types/database";
import { INPUT_LIMITS } from "@/config/community";
import { getSupabaseClient } from "@/lib/supabase";
import { useRealtimeChannel } from "@/hooks/useRealtimeChannel";
import {
  getDiscussionsAction,
  createDiscussionAction,
  upvoteDiscussionAction,
} from "@/app/actions/discussions";

interface ProblemDiscussionsTabProps {
  problemId: string;
  user: User | null;
}

const APPROACH_BADGE_COLORS: Record<ApproachType, string> = {
  intuitive: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  brute_force: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
  optimized: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  one_liner: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
};

export default function ProblemDiscussionsTab({ problemId, user }: ProblemDiscussionsTabProps) {
  const [discussions, setDiscussions] = useState<ProblemDiscussion[]>([]);
  const [approachFilter, setApproachFilter] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState("");
  const [approachType, setApproachType] = useState<ApproachType>("intuitive");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadDiscussions = useCallback(async () => {
    try {
      const data = await getDiscussionsAction(problemId, user?.github);
      setDiscussions(data);
    } catch (err) {
      console.warn("Could not load discussions:", err);
    } finally {
      setLoading(false);
    }
  }, [problemId, user?.github]);

  useEffect(() => {
    loadDiscussions();
  }, [loadDiscussions]);

  // Real-time synchronization for discussions on this problem
  useRealtimeChannel({
    channelName: `problem-discussions-${problemId}`,
    postgresChanges: [
      {
        event: "*",
        schema: "public",
        table: "problem_discussions",
        filter: `problem_id=eq.${problemId}`,
        callback: () => loadDiscussions(),
      },
    ],
    enabled: true,
  });

  async function handleUpvote(id: string) {
    if (!user) {
      setNotice("Please sign in with GitHub to upvote explanations!");
      return;
    }

    const target = discussions.find((d) => d.id === id);
    if (!target) return;

    if (target.github === user.github) {
      setNotice("You cannot upvote your own explanation.");
      return;
    }

    if (target.has_upvoted) {
      setNotice("You have already upvoted this explanation.");
      return;
    }

    // Optimistically update
    setDiscussions((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, upvotes: d.upvotes + 1, has_upvoted: true } : d
      )
    );

    const { data: { session } } = await getSupabaseClient().auth.getSession();
    const res = await upvoteDiscussionAction(id, user.github, session?.access_token);
    if (!res.success) {
      setNotice(res.error || "Could not record upvote.");
      loadDiscussions(); // Rollback to actual state
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      setFormError("Please sign in to share your explanation!");
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (trimmedTitle.length < INPUT_LIMITS.DISCUSSION_TITLE_MIN) {
      setFormError(`Title must be at least ${INPUT_LIMITS.DISCUSSION_TITLE_MIN} characters.`);
      return;
    }
    if (trimmedContent.length < INPUT_LIMITS.DISCUSSION_CONTENT_MIN) {
      setFormError(`Content must be at least ${INPUT_LIMITS.DISCUSSION_CONTENT_MIN} characters.`);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const { data: { session } } = await getSupabaseClient().auth.getSession();
    const res = await createDiscussionAction({
      problemId,
      userGithub: user.github,
      userName: user.name || user.github,
      title: trimmedTitle,
      content: trimmedContent,
      approachType,
      token: session?.access_token,
    });

    setSubmitting(false);

    if (res.success && res.discussion) {
      setDiscussions((prev) => [res.discussion!, ...prev]);
      setTitle("");
      setContent("");
      setShowModal(false);
      setNotice("Your explanation was published! You will earn Mentor Karma when peers upvote it.");
    } else {
      setFormError(res.error || "Failed to publish explanation.");
    }
  }

  const filtered = discussions.filter((d) => {
    if (approachFilter !== "all" && d.approach_type !== approachFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4 py-2">
      {notice && (
        <div
          role="status"
          className="bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 text-xs font-mono p-3 rounded-xl flex items-center justify-between"
        >
          <span>💡 {notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-sky-400 hover:text-sky-300 font-bold ml-2"
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Filter and Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setApproachFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition ${
              approachFilter === "all"
                ? "bg-sky-600 text-white font-bold"
                : "text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800"
            }`}
          >
            All Takes ({discussions.length})
          </button>
          <button
            type="button"
            onClick={() => setApproachFilter("intuitive")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition ${
              approachFilter === "intuitive"
                ? "bg-amber-600 text-white font-bold"
                : "text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800"
            }`}
          >
            💡 Intuitive (ELI5)
          </button>
          <button
            type="button"
            onClick={() => setApproachFilter("optimized")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition ${
              approachFilter === "optimized"
                ? "bg-emerald-600 text-white font-bold"
                : "text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800"
            }`}
          >
            ⚡ Optimized
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-mono font-medium flex items-center justify-center gap-1.5 shadow-sm transition"
        >
          <span>✍️ Share Your Intuition</span>
        </button>
      </div>

      {/* Discussions Feed */}
      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-10 flex flex-col items-center justify-center gap-3 text-center"
        >
          <div className="w-7 h-7 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">
            Fetching community explanations...
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-10 text-center space-y-3">
          <span className="text-3xl block" aria-hidden="true">
            💡
          </span>
          <h4 className="font-mono text-sm font-bold text-slate-800 dark:text-zinc-200">
            No explanations shared yet for this problem!
          </h4>
          <p className="font-mono text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
            Solved this problem? Explain it in plain English ("Explain Like I'm 5") or share an
            optimization trick to help peers learn and earn community Mentor Karma.
          </p>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-mono font-bold transition inline-flex items-center gap-1.5 shadow-sm"
          >
            <span>✍️ Be the First to Share</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <article
              key={item.id}
              aria-labelledby={`disc-title-${item.id}`}
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5 shadow-xs space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <img
                    src={`https://github.com/${item.github}.png`}
                    alt={item.author_name}
                    className="w-7 h-7 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 object-cover"
                    onError={(e) => {
                      const target = e.currentTarget;
                      target.onerror = null;
                      target.src = `https://github.com/identicons/${item.github}.png`;
                    }}
                  />
                  <div>
                    <h4
                      id={`disc-title-${item.id}`}
                      className="text-sm font-bold font-mono text-slate-900 dark:text-zinc-100"
                    >
                      {item.title}
                    </h4>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                      by @{item.github} • {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border capitalize font-bold ${
                    APPROACH_BADGE_COLORS[item.approach_type] || APPROACH_BADGE_COLORS.intuitive
                  }`}
                >
                  {item.approach_type.replace("_", " ")}
                </span>
              </div>

              {/* Content Body */}
              <div className="bg-slate-50 dark:bg-zinc-950/50 rounded-lg p-3 text-xs font-mono text-slate-700 dark:text-zinc-300 border border-slate-100 dark:border-zinc-800/60 leading-relaxed whitespace-pre-wrap">
                {item.content}
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => handleUpvote(item.id)}
                  disabled={item.has_upvoted || item.github === user?.github}
                  className={`px-3 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition border ${
                    item.has_upvoted
                      ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-bold cursor-default"
                      : item.github === user?.github
                      ? "bg-slate-100 dark:bg-zinc-800/50 border-slate-200 dark:border-zinc-700 text-slate-400 cursor-not-allowed"
                      : "bg-slate-100 dark:bg-zinc-800/80 hover:bg-slate-200 dark:hover:bg-zinc-700 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300"
                  }`}
                >
                  <span aria-hidden="true">👍</span>
                  <span>{item.has_upvoted ? "Upvoted" : "Helpful"}</span>
                  <span>({item.upvotes})</span>
                </button>

                <span className="text-[10px] font-mono text-slate-400">
                  Peer Mentor Karma +1
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Share Modal */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-intuition-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              aria-label="Close dialog"
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white font-mono p-1"
            >
              ✕
            </button>

            <div>
              <h3
                id="share-intuition-title"
                className="text-base font-bold font-mono text-slate-900 dark:text-zinc-100"
              >
                Share Your Intuition / Approach
              </h3>
              <p className="text-xs font-mono text-slate-500 dark:text-zinc-400 mt-0.5">
                Explain your thought process to help juniors and peers learn from your perspective.
              </p>
            </div>

            {formError && (
              <div
                role="alert"
                className="bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-mono p-2.5 rounded-lg"
              >
                ⚠️ {formError}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label
                  htmlFor="disc-title-input"
                  className="text-xs font-mono font-bold text-slate-700 dark:text-zinc-300 block mb-1"
                >
                  Title ({INPUT_LIMITS.DISCUSSION_TITLE_MIN}–{INPUT_LIMITS.DISCUSSION_TITLE_MAX} characters)
                </label>
                <input
                  id="disc-title-input"
                  type="text"
                  required
                  minLength={INPUT_LIMITS.DISCUSSION_TITLE_MIN}
                  maxLength={INPUT_LIMITS.DISCUSSION_TITLE_MAX}
                  placeholder="e.g. How I visualized the sliding window using two pointers"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label
                  htmlFor="disc-approach-select"
                  className="text-xs font-mono font-bold text-slate-700 dark:text-zinc-300 block mb-1"
                >
                  Approach Type
                </label>
                <select
                  id="disc-approach-select"
                  value={approachType}
                  onChange={(e) => setApproachType(e.target.value as ApproachType)}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 focus:outline-none focus:border-sky-500"
                >
                  <option value="intuitive">💡 Intuitive / Explain Like I'm 5</option>
                  <option value="optimized">⚡ Optimized (Time / Space efficient)</option>
                  <option value="brute_force">🔨 Brute Force & How to Improve</option>
                  <option value="one_liner">🪄 Clever One-Liner / Pythonic</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="disc-content-textarea"
                  className="text-xs font-mono font-bold text-slate-700 dark:text-zinc-300 block mb-1"
                >
                  Explanation & Code Walkthrough ({INPUT_LIMITS.DISCUSSION_CONTENT_MIN}–{INPUT_LIMITS.DISCUSSION_CONTENT_MAX} chars)
                </label>
                <textarea
                  id="disc-content-textarea"
                  rows={6}
                  required
                  minLength={INPUT_LIMITS.DISCUSSION_CONTENT_MIN}
                  maxLength={INPUT_LIMITS.DISCUSSION_CONTENT_MAX}
                  placeholder="Explain the mental model: What was your initial thought? Where did you get stuck? What made the solution click?"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg p-3 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-xs font-mono hover:bg-slate-200 dark:hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-mono font-bold transition disabled:opacity-50"
                >
                  {submitting ? "Publishing..." : "Publish Explanation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
