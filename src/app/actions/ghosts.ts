"use server";

import { getSupabaseClient } from "@/lib/supabase";
import type { GhostRun, GhostMatch } from "@/types/ghost";

const SEED_GHOSTS: GhostRun[] = [
  {
    id: "seed-ghost-1",
    problem_id: "two-sum",
    problem_title: "Two Sum",
    github: "arjun_dev",
    user_name: "Arjun Verma",
    user_avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face",
    time_seconds: 145, // 02:25
    language: "python",
    code_length: 198,
    checkpoints: [
      { at: 15, label: "Analyzing problem & constraints" },
      { at: 40, label: "Initialized complement hash map" },
      { at: 90, label: "Passed sample test cases" },
      { at: 145, label: "Submitted & 100% tests passed!" },
    ],
    is_verified: true,
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    id: "seed-ghost-2",
    problem_id: "valid-parentheses",
    problem_title: "Valid Parentheses",
    github: "karthik_r",
    user_name: "Karthik R.",
    user_avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&h=100&fit=crop&crop=face",
    time_seconds: 190, // 03:10
    language: "javascript",
    code_length: 240,
    checkpoints: [
      { at: 20, label: "Drafted bracket stack structure" },
      { at: 65, label: "Handling closing bracket match logic" },
      { at: 130, label: "Passed edge case: odd length & empty stack" },
      { at: 190, label: "Submitted & 100% tests passed!" },
    ],
    is_verified: true,
    created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
  },
  {
    id: "seed-ghost-3",
    problem_id: "reverse-linked-list",
    problem_title: "Reverse Linked List",
    github: "sneha_codes",
    user_name: "Sneha Patel",
    user_avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face",
    time_seconds: 110, // 01:50
    language: "python",
    code_length: 165,
    checkpoints: [
      { at: 12, label: "Set prev = None, curr = head" },
      { at: 45, label: "Three-pointer swap loop implemented" },
      { at: 80, label: "Passed single-node test" },
      { at: 110, label: "Submitted & 100% tests passed!" },
    ],
    is_verified: true,
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
  },
];

/**
 * Fetch public ghost runs, optionally filtered by problem_id.
 */
export async function getGhostRunsAction(problemId?: string): Promise<GhostRun[]> {
  try {
    const db = getSupabaseClient();
    let query = (db.from("ghost_runs") as any)
      .select("*")
      .eq("is_verified", true)
      .order("time_seconds", { ascending: true })
      .limit(30);

    if (problemId) {
      query = query.eq("problem_id", problemId);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      if (problemId) {
        return SEED_GHOSTS.filter((g) => g.problem_id === problemId);
      }
      return SEED_GHOSTS;
    }

    return data.map((d: any) => ({
      ...d,
      checkpoints: Array.isArray(d.checkpoints) ? d.checkpoints : [],
    }));
  } catch (err) {
    console.warn("[getGhostRunsAction] Error fetching ghosts:", err);
    return problemId ? SEED_GHOSTS.filter((g) => g.problem_id === problemId) : SEED_GHOSTS;
  }
}

/**
 * Fetch a single ghost run by ID.
 */
export async function getGhostRunByIdAction(ghostId: string): Promise<GhostRun | null> {
  try {
    const db = getSupabaseClient();
    const { data, error } = await (db.from("ghost_runs") as any)
      .select("*")
      .eq("id", ghostId)
      .maybeSingle();

    if (!error && data) {
      return {
        ...data,
        checkpoints: Array.isArray(data.checkpoints) ? data.checkpoints : [],
      };
    }

    // Check seed fallback
    const seed = SEED_GHOSTS.find((g) => g.id === ghostId);
    return seed || null;
  } catch (err) {
    console.warn("[getGhostRunByIdAction] Error:", err);
    const seed = SEED_GHOSTS.find((g) => g.id === ghostId);
    return seed || null;
  }
}

/**
 * Record a new ghost run when a user solves a problem.
 */
export async function recordGhostRunAction(
  payload: Omit<GhostRun, "id" | "created_at">
): Promise<{ success: boolean; ghostId?: string }> {
  try {
    const db = getSupabaseClient();

    // Check if user already has a ghost run for this problem
    const { data: existing } = await (db.from("ghost_runs") as any)
      .select("id, time_seconds")
      .eq("problem_id", payload.problem_id)
      .eq("github", payload.github)
      .maybeSingle();

    if (existing) {
      // Only overwrite if current run is faster!
      if (payload.time_seconds < existing.time_seconds) {
        const { data, error } = await (db.from("ghost_runs") as any)
          .update({
            time_seconds: payload.time_seconds,
            language: payload.language,
            code_length: payload.code_length,
            checkpoints: payload.checkpoints,
          })
          .eq("id", existing.id)
          .select("id")
          .single();

        return { success: !error, ghostId: data?.id };
      }
      return { success: true, ghostId: existing.id };
    }

    // Insert new ghost run
    const { data, error } = await (db.from("ghost_runs") as any)
      .insert({
        problem_id: payload.problem_id,
        problem_title: payload.problem_title,
        github: payload.github,
        user_name: payload.user_name,
        user_avatar: payload.user_avatar || null,
        time_seconds: payload.time_seconds,
        language: payload.language,
        code_length: payload.code_length,
        checkpoints: payload.checkpoints,
        is_verified: true,
      })
      .select("id")
      .single();

    return { success: !error, ghostId: data?.id };
  } catch (err) {
    console.warn("[recordGhostRunAction] Error recording ghost:", err);
    return { success: false };
  }
}

/**
 * Record match outcome when a challenger races against a ghost.
 * Automatically distributes +100 points to user and +50 points to user's Squad!
 */
export async function recordGhostMatchAction(
  payload: Omit<GhostMatch, "id" | "created_at">
): Promise<{ success: boolean; pointsAwarded: number; squadPointsAwarded: number }> {
  let pointsAwarded = 0;
  let squadPointsAwarded = 0;

  try {
    const db = getSupabaseClient();

    // 1. Insert match record
    await (db.from("ghost_duel_matches") as any).insert({
      ghost_run_id: payload.ghost_run_id || null,
      problem_id: payload.problem_id,
      problem_title: payload.problem_title,
      challenger_github: payload.challenger_github,
      challenger_name: payload.challenger_name,
      challenger_time_seconds: payload.challenger_time_seconds,
      result: payload.result,
      time_diff_seconds: payload.time_diff_seconds,
    });

    // 2. If won, award points & boost clan
    if (payload.result === "won") {
      pointsAwarded = 100;

      // Update user points in members table
      try {
        const { data: member } = await db
          .from("members")
          .select("total_points")
          .eq("github", payload.challenger_github)
          .maybeSingle();

        if (member) {
          await (db.from("members") as any)
            .update({ total_points: ((member as any).total_points || 0) + pointsAwarded })
            .eq("github", payload.challenger_github);
        }
      } catch (e) {
        console.warn("Could not update member points:", e);
      }

      // 3. Connect to user's Squad
      try {
        const { data: squadMembership } = await (db.from("squad_members") as any)
          .select("squad_id, points_contributed")
          .eq("github", payload.challenger_github)
          .maybeSingle();

        if (squadMembership?.squad_id) {
          squadPointsAwarded = 50;
          // Update member contribution
          await (db.from("squad_members") as any)
            .update({ points_contributed: (squadMembership.points_contributed || 0) + squadPointsAwarded })
            .eq("github", payload.challenger_github);

          // Update squad total
          const { data: squad } = await (db.from("squads") as any)
            .select("total_points")
            .eq("id", squadMembership.squad_id)
            .single();

          if (squad) {
            await (db.from("squads") as any)
              .update({ total_points: (squad.total_points || 0) + squadPointsAwarded })
              .eq("id", squadMembership.squad_id);
          }
        }
      } catch (sqErr) {
        console.warn("Could not update squad points for ghost match:", sqErr);
      }
    }

    return { success: true, pointsAwarded, squadPointsAwarded };
  } catch (err) {
    console.warn("[recordGhostMatchAction] Error:", err);
    return { success: false, pointsAwarded: 0, squadPointsAwarded: 0 };
  }
}

/**
 * Get recent ghost match victories for Community Pulse.
 */
export async function getRecentGhostMatchesAction(limit = 5): Promise<GhostMatch[]> {
  try {
    const db = getSupabaseClient();
    const { data, error } = await (db.from("ghost_duel_matches") as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data as GhostMatch[];
  } catch {
    return [];
  }
}
