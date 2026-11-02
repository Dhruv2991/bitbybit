"use client";

import React, { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import type { ProblemDiscussion, ApproachType } from "@/types/community";
import type { User } from "@/types/database";

interface ProblemDiscussionsTabProps {
  problemId: string;
  user: User | null;
}

const SAMPLE_DISCUSSIONS: ProblemDiscussion[] = [
  {
    id: "sample-disc-1",
    problem_id: "sample",
    github: "alex_coder",
    author_name: "Alex Coder",
    title: "Explain Like I'm 5: Why a Hash Map turns O(N²) into O(N)",
    approach_type: "intuitive",
    content: `Imagine you're searching for your favorite matching socks in a giant unorganized laundry basket.

**The Brute Force Way:** You pick one sock, then check every single other sock in the basket until you find its pair. That takes forever (O(N²)).

**The Hash Map Way:** You have labelled cubbies for each color on your wall. As you pull each sock out, you check: "Is its pair already sitting in the cubby?" If yes, match found! If not, drop it in the cubby and move to the next. You only touch each sock once!

- Time Complexity: O(N)
- Space Complexity: O(N)`,
    upvotes: 28,
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: "sample-disc-2",
    problem_id: "sample",
    github: "deepak_v",
    author_name: "Deepak V.",
    title: "Watch out for off-by-one errors on the right pointer!",
    approach_type: "optimized",
    content: `When contracting the sliding window, make sure you decrement the frequency before shifting \`left++\`, otherwise the window state will be out of sync.

Spent 30 minutes debugging this test case: \`[1, 2, 1, 2, 3]\` with \`k=2\`. Hope this saves someone's time!`,
    upvotes: 14,
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
];

export default function ProblemDiscussionsTab({ problemId, user }: ProblemDiscussionsTabProps) {
  const [discussions, setDiscussions] = useState<ProblemDiscussion[]>(SAMPLE_DISCUSSIONS);
  const [approachFilter, setApproachFilter] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form states
  const [title, setTitle] = useState("");
  const [approachType, setApproachType] = useState<ApproachType>("intuitive");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const db = getSupabaseClient();

  async function loadDiscussions() {
    setLoading(true);
    try {
      const { data, error } = await (db.from("problem_discussions") as any)
        .select("*")
        .eq("problem_id", problemId)
        .order("upvotes", { ascending: false });

      if (!error && data && data.length > 0) {
        setDiscussions(data as ProblemDiscussion[]);
      } else {
        setDiscussions(SAMPLE_DISCUSSIONS);
      }
    } catch (err) {
      console.warn("Could not load discussions", err);
      setDiscussions(SAMPLE_DISCUSSIONS);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDiscussions();
  }, [problemId]);

  async function handleUpvote(id: string) {
    if (!user) {
      alert("Please sign in to upvote discussions!");
      return;
    }

    setDiscussions((prev) =>
      prev.map((d) => (d.id === id ? { ...d, upvotes: d.upvotes + 1, has_upvoted: true } : d))
    );

    try {
      if (!id.startsWith("sample-")) {
        await (db.from("problem_discussion_votes") as any).insert({
          discussion_id: id,
          github: user.github,
        });

        const target = discussions.find((d) => d.id === id);
        if (target) {
          await (db.from("problem_discussions") as any)
            .update({ upvotes: target.upvotes + 1 })
            .eq("id", id);
        }
      }
    } catch {}
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      alert("Please sign in to share your explanation!");
      return;
    }
    if (!title.trim() || !content.trim()) return;

    setSubmitting(true);
    const newEntry: ProblemDiscussion = {
      id: "disc-" + Date.now(),
      problem_id: problemId,
      github: user.github,
      author_name: user.name || user.github,
      title: title.trim(),
      content: content.trim(),
      approach_type: approachType,
      upvotes: 1,
      created_at: new Date().toISOString(),
      has_upvoted: true,
    };

    setDiscussions((prev) => [newEntry, ...prev]);
    setTitle("");
    setContent("");
    setShowModal(false);

    try {
      await (db.from("problem_discussions") as any).insert({
        problem_id: problemId,
        github: user.github,
        author_name: user.name || user.github,
        title: newEntry.title,
        content: newEntry.content,
        approach_type: newEntry.approach_type,
        upvotes: 1,
      });
    } catch (err) {
      console.error("Failed to save discussion", err);
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = discussions.filter((d) => {
    if (approachFilter !== "all" && d.approach_type !== approachFilter) return false;
    return true;
  });

  const approachBadgeColors: Record<ApproachType, string> = {
    intuitive: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    brute_force: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
    optimized: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    one_liner: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  };

  return (
    <div className="space-y-4 py-2">
      {/* Top Filter and Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
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
          onClick={() => setShowModal(true)}
          className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-mono font-medium flex items-center justify-center gap-1.5 shadow-sm transition"
        >
          <span>✍️ Share Your Intuition</span>
        </button>
      </div>

      {/* Discussions Feed */}
      <div className="space-y-3">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5 shadow-xs space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <img
                  src={`https://github.com/${item.github}.png`}
                  alt={item.author_name}
                  className="w-7 h-7 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800"
                  onError={(e) => {
                    (e.target as any).src = `https://github.com/identicons/${item.github}.png`;
                  }}
                />
                <div>
                  <h4 className="text-sm font-bold font-mono text-slate-900 dark:text-zinc-100">
                    {item.title}
                  </h4>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                    by @{item.github} • {new Date(item.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border capitalize font-bold ${
                  approachBadgeColors[item.approach_type] || approachBadgeColors.intuitive
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
                onClick={() => handleUpvote(item.id)}
                className={`px-3 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 transition border ${
                  item.has_upvoted
                    ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-bold"
                    : "bg-slate-100 dark:bg-zinc-800/80 hover:bg-slate-200 dark:hover:bg-zinc-700 border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300"
                }`}
              >
                <span>👍 Helpful</span>
                <span>({item.upvotes})</span>
              </button>

              <span className="text-[10px] font-mono text-slate-400">
                Peer Mentor Karma +1
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Share Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white font-mono"
            >
              ✕
            </button>

            <div>
              <h3 className="text-base font-bold font-mono text-slate-900 dark:text-zinc-100">
                Share Your Intuition / Approach
              </h3>
              <p className="text-xs font-mono text-slate-500 dark:text-zinc-400 mt-0.5">
                Explain your thought process to help juniors and peers learn from your perspective.
              </p>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="text-xs font-mono font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. How I visualized the sliding window using two pointers"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-xs font-mono font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                  Approach Type
                </label>
                <select
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
                <label className="text-xs font-mono font-bold text-slate-700 dark:text-zinc-300 block mb-1">
                  Explanation & Code Walkthrough
                </label>
                <textarea
                  rows={6}
                  required
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
                  {submitting ? "Posting..." : "Publish Explanation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
