"use server";
import { getAuthenticatedServerUser, getVerifiedTokenUser } from "@/lib/serverAuth";

import { getSupabaseClient } from "@/lib/supabase";
import { COMMUNITY_POINTS } from "@/config/community";
import type {
  GhostRun,
  GhostMatch,
  RecordGhostMatchInput,
  RecordGhostMatchResult,
} from "@/types/ghost";

import { SEED_GHOSTS } from "@/config/community";

// Map legacy seed IDs to canonical UUIDs
const SEED_LEGACY_MAP: Record<string, string> = {
  "seed-ghost-1": "00000000-0000-0000-0000-000000000001",
  "seed-ghost-2": "00000000-0000-0000-0000-000000000002",
  "seed-ghost-3": "00000000-0000-0000-0000-000000000003",
};

function normalizeGhostId(id?: string | null): string | null {
  if (!id) return null;
  return SEED_LEGACY_MAP[id] || id;
}

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
    if (error || !data || (data as any[]).length === 0) {
      if (problemId) {
        return SEED_GHOSTS.filter((g) => g.problem_id === problemId);
      }
      return SEED_GHOSTS;
    }

    return (data as any[]).map((d: any) => ({
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
  const normalizedId = normalizeGhostId(ghostId);
  if (!normalizedId) return null;

  try {
    const db = getSupabaseClient();
    const { data, error } = await (db.from("ghost_runs") as any)
      .select("*")
      .eq("id", normalizedId)
      .maybeSingle();

    if (!error && data) {
      const record = data as any;
      return {
        ...record,
        checkpoints: Array.isArray(record.checkpoints) ? record.checkpoints : [],
      };
    }

    // Fallback to in-memory seeds
    const seed = SEED_GHOSTS.find(
      (g) => g.id === normalizedId || g.id === ghostId
    );
    return seed || null;
  } catch (err) {
    console.warn("[getGhostRunByIdAction] Error:", err);
    const seed = SEED_GHOSTS.find(
      (g) => g.id === normalizedId || g.id === ghostId
    );
    return seed || null;
  }
}

/**
 * Record a new ghost run when a user solves a problem.
 */
export async function recordGhostRunAction(
  payload: Omit<GhostRun, "id" | "created_at">
): Promise<{ success: boolean; ghostId?: string; error?: string }> {
  // Input validation
  const cleanProblemId = payload.problem_id?.trim();
  const cleanGithub = payload.github?.trim();
  const cleanTitle = (payload.problem_title || cleanProblemId)?.trim();
  const timeSec = Number(payload.time_seconds);

  if (!cleanProblemId || !cleanGithub || !Number.isInteger(timeSec) || timeSec <= 0 || timeSec > 10800) {
    return { success: false, error: "Invalid ghost run parameters." };
  }

  const validCheckpoints = Array.isArray(payload.checkpoints)
    ? payload.checkpoints
        .filter((cp) => typeof cp?.at === "number" && typeof cp?.label === "string")
        .slice(0, 20)
    : [];

  try {
    const db = getSupabaseClient();

    // Verify caller has a real approved submission for this problem before creating ghost run
    const subTable = (db.from as any)("submissions");
    if (typeof subTable?.select === "function") {
      const { data: approvedSub } = await subTable
        .select("id")
        .eq("problem_id", cleanProblemId)
        .eq("github", cleanGithub)
        .eq("status", "approved")
        .limit(1)
        .maybeSingle();

      if (!approvedSub) {
        return {
          success: false,
          error: "Cannot create ghost run: no approved submission found for this problem.",
        };
      }
    }

    // Check if user already has a ghost run for this problem
    const { data: existing } = await (db.from("ghost_runs") as any)
      .select("id, time_seconds")
      .eq("problem_id", cleanProblemId)
      .eq("github", cleanGithub)
      .maybeSingle();

    const existingRecord = existing as { id: string; time_seconds: number } | null;

    if (existingRecord) {
      // Only overwrite if current run is faster!
      if (timeSec < existingRecord.time_seconds) {
        const { data, error } = await (db.from("ghost_runs") as any)
          .update({
            time_seconds: timeSec,
            language: payload.language?.slice(0, 20) || "javascript",
            code_length: Math.max(0, Number(payload.code_length) || 0),
            checkpoints: validCheckpoints,
          })
          .eq("id", existingRecord.id)
          .select("id")
          .single();

        return { success: !error, ghostId: (data as any)?.id, error: error?.message };
      }
      return { success: true, ghostId: existingRecord.id };
    }

    // Insert new ghost run
    const { data, error } = await (db.from("ghost_runs") as any)
      .insert({
        problem_id: cleanProblemId,
        problem_title: cleanTitle.slice(0, 100),
        github: cleanGithub.slice(0, 50),
        user_name: (payload.user_name || cleanGithub).slice(0, 50),
        user_avatar: payload.user_avatar?.slice(0, 300) || null,
        time_seconds: timeSec,
        language: payload.language?.slice(0, 20) || "javascript",
        code_length: Math.max(0, Number(payload.code_length) || 0),
        checkpoints: validCheckpoints,
        is_verified: true,
      })
      .select("id")
      .single();

    return { success: !error, ghostId: (data as any)?.id, error: error?.message };
  } catch (err: any) {
    console.warn("[recordGhostRunAction] Error recording ghost:", err);
    return { success: false, error: err?.message || "Unexpected error recording ghost." };
  }
}

/**
 * Start a ghost duel session to establish server-side start timestamp.
 */
export async function startGhostDuelAction(
  ghostRunId: string,
  challengerGithub: string,
  problemId: string,
  token?: string
): Promise<{ success: boolean; startedAt?: string; error?: string }> {
  let cleanGithub = challengerGithub?.trim();
  if (token) {
    const authUser = await getVerifiedTokenUser(token);
    if (!authUser) {
      return { success: false, error: "Authentication failed. Valid GitHub session required." };
    }
    cleanGithub = authUser.github;
  } else {
    const authUser = await getAuthenticatedServerUser();
    if (authUser?.github) cleanGithub = authUser.github;
  }
  const cleanProblemId = problemId?.trim();
  const normalizedGhostId = normalizeGhostId(ghostRunId);

  if (!cleanGithub || !normalizedGhostId || !cleanProblemId) {
    return { success: false, error: "Invalid session parameters." };
  }

  // Anti-cheat: cannot challenge your own ghost
  const targetGhost = await getGhostRunByIdAction(normalizedGhostId);
  if (targetGhost?.github && targetGhost.github.toLowerCase() === cleanGithub.toLowerCase()) {
    return { success: false, error: "You cannot challenge your own ghost." };
  }

  try {
    const db = getSupabaseClient();
    const startedAt = new Date().toISOString();

    const { error } = await (db.from("ghost_duel_sessions") as any).upsert(
      {
        ghost_run_id: normalizedGhostId,
        challenger_github: cleanGithub,
        problem_id: cleanProblemId,
        started_at: startedAt,
        completed_at: null,
        solved_at: null,
      },
      { onConflict: "ghost_run_id,challenger_github" }
    );

    if (error) {
      console.warn("[startGhostDuelAction] session upsert warn:", error);
    }
    return { success: true, startedAt };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to start ghost duel session." };
  }
}

/**
 * Record match outcome when a challenger races against a ghost.
 *
 * MUST-VERIFY RULES:
 * 1. Result ('won' | 'lost') and timeDiffSeconds are computed server-side against target ghost.
 * 2. Points (+100 duel, +50 squad) are awarded once per ghost to prevent infinite farming.
 * 3. duels_won badge metric is safely updated on victory.
 */
export async function recordGhostMatchAction(
  input: RecordGhostMatchInput
): Promise<RecordGhostMatchResult> {
  let challengerGithub = input.challenger_github?.trim();
  if (input.token) {
    const authUser = await getVerifiedTokenUser(input.token);
    if (!authUser) {
      return {
        success: false,
        result: "lost",
        timeDiffSeconds: 0,
        pointsAwarded: 0,
        squadPointsAwarded: 0,
        error: "Authentication failed. Valid GitHub session required.",
      };
    }
    challengerGithub = authUser.github;
  } else {
    const authUser = await getAuthenticatedServerUser();
    if (authUser?.github) challengerGithub = authUser.github;
  }
  const problemId = input.problem_id?.trim();
  const timeSeconds = Number(input.challenger_time_seconds);

  if (!challengerGithub || !problemId || !Number.isInteger(timeSeconds) || timeSeconds <= 0) {
    return {
      success: false,
      result: "lost",
      timeDiffSeconds: 0,
      pointsAwarded: 0,
      squadPointsAwarded: 0,
      error: "Invalid match parameters.",
    };
  }

  const ghostRunId = normalizeGhostId(input.ghost_run_id);

  try {
    const db = getSupabaseClient();

    // 0. Resolve Target Ghost & Verify Challenger is not the Ghost Author
    let targetGhost: GhostRun | null = null;
    if (ghostRunId) {
      targetGhost = await getGhostRunByIdAction(ghostRunId);
    }

    if (targetGhost?.github && targetGhost.github.toLowerCase() === challengerGithub.toLowerCase()) {
      return {
        success: false,
        result: "lost",
        timeDiffSeconds: 0,
        pointsAwarded: 0,
        squadPointsAwarded: 0,
        error: "You cannot challenge your own ghost.",
      };
    }

    // 1. Time Integrity, Server-Side Start Verification & Session Single-Use
    let verifiedTimeSeconds = timeSeconds;
    let sessionId: string | null = null;
    let sessionStartedAt: string | null = null;
    let sessionSolvedAt: string | null = null;

    if (ghostRunId) {
      // Fetch newest UNCONSUMED session for this user and ghost
      const { data: session } = await (db.from("ghost_duel_sessions") as any)
        .select("id, started_at, completed_at, solved_at")
        .eq("ghost_run_id", ghostRunId)
        .eq("challenger_github", challengerGithub)
        .is("completed_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (session?.started_at) {
        sessionId = session.id;
        sessionStartedAt = session.started_at;
        sessionSolvedAt = session.solved_at || null;
        const serverElapsed = Math.floor(
          (Date.now() - new Date(session.started_at).getTime()) / 1000
        );

        // Reject expired sessions (> 2 hours)
        if (serverElapsed > 7200) {
          return {
            success: false,
            result: "lost",
            timeDiffSeconds: 0,
            pointsAwarded: 0,
            squadPointsAwarded: 0,
            error: "Duel session has expired (> 2 hours). Please restart the race.",
          };
        }

        // If solved_at was recorded by judge execution: compute elapsed = solved_at - started_at
        if (sessionSolvedAt) {
          const solveElapsed = Math.floor(
            (new Date(sessionSolvedAt).getTime() - new Date(session.started_at).getTime()) / 1000
          );
          if (solveElapsed < 5) {
            return {
              success: false,
              result: "lost",
              timeDiffSeconds: 0,
              pointsAwarded: 0,
              squadPointsAwarded: 0,
              error: "Duel completed implausibly fast (<5 seconds). Disqualified.",
            };
          }
          verifiedTimeSeconds = Math.max(solveElapsed, 1);
        } else {
          verifiedTimeSeconds = Math.max(serverElapsed, 1);
        }
      } else if (timeSeconds < 5) {
        return {
          success: false,
          result: "lost",
          timeDiffSeconds: 0,
          pointsAwarded: 0,
          squadPointsAwarded: 0,
          error: "Duel completed implausibly fast without verified start record.",
        };
      }
    } else if (timeSeconds < 5) {
      return {
        success: false,
        result: "lost",
        timeDiffSeconds: 0,
        pointsAwarded: 0,
        squadPointsAwarded: 0,
        error: "Duel completed implausibly fast (<5 seconds). Disqualified.",
      };
    }

    // 3. Compute authentic outcome on server
    let result: "won" | "lost" = "lost";
    let timeDiffSeconds = 0;

    if (targetGhost) {
      const isFaster = verifiedTimeSeconds < targetGhost.time_seconds;
      result = isFaster ? "won" : "lost";
      timeDiffSeconds = targetGhost.time_seconds - verifiedTimeSeconds;
    }

    // Anti-cheat: verify code was actually solved and verified by judge during this duel session
    if (result === "won" && ghostRunId && !sessionSolvedAt) {
      return {
        success: false,
        result: "lost",
        timeDiffSeconds: 0,
        pointsAwarded: 0,
        squadPointsAwarded: 0,
        error: "No verified solve recorded for this duel session. Replay rejected.",
      };
    }

    const problemTitle = (input.problem_title || targetGhost?.problem_title || problemId).slice(0, 100);

    // 4. Atomic Claim Execution (via PostgreSQL Advisory Lock Procedure)
    if (result === "won" && ghostRunId && typeof (db.rpc as any) === "function") {
      try {
        const { data: claimData, error: rpcErr } = await (db.rpc as any)("claim_ghost_duel_win", {
          p_ghost_run_id: ghostRunId,
          p_challenger_github: challengerGithub,
          p_challenger_name: (input.challenger_name || challengerGithub).slice(0, 50),
          p_problem_id: problemId,
          p_problem_title: problemTitle,
          p_elapsed_seconds: verifiedTimeSeconds,
        });

        if (!rpcErr && claimData && typeof claimData === "object" && claimData.success) {
          if (sessionId) {
            try {
              await (db.from("ghost_duel_sessions") as any)
                .update({ completed_at: new Date().toISOString() })
                .eq("id", sessionId);
            } catch {}
          }
          return {
            success: true,
            result: "won",
            timeDiffSeconds,
            pointsAwarded: claimData.points_awarded || 0,
            squadPointsAwarded: claimData.squad_points_awarded || 0,
            alreadyClaimed: claimData.already_claimed || false,
          };
        }
      } catch {}
    }

    // Fallback claim execution (for mock test environments)
    let alreadyClaimed = false;
    if (result === "won" && ghostRunId) {
      const { data: previousWin } = await (db.from("ghost_duel_matches") as any)
        .select("id")
        .eq("challenger_github", challengerGithub)
        .eq("ghost_run_id", ghostRunId)
        .eq("result", "won")
        .maybeSingle();

      if (previousWin) {
        alreadyClaimed = true;
      }
    }

    // Daily cap on duel XP (e.g. 500 XP / 5 wins per day)
    let dailyCapExceeded = false;
    if (result === "won" && !alreadyClaimed) {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      try {
        const { data: todayMatches } = await (db.from("ghost_duel_matches") as any)
          .select("id")
          .eq("challenger_github", challengerGithub)
          .eq("result", "won")
          .gte("created_at", startOfDay.toISOString());

        const winsToday = Array.isArray(todayMatches) ? todayMatches.length : 0;
        const maxWinsAllowed = Math.floor(
          COMMUNITY_POINTS.DAILY_GHOST_DUEL_XP_CAP / COMMUNITY_POINTS.GHOST_DUEL_WIN
        );
        if (winsToday >= maxWinsAllowed) {
          dailyCapExceeded = true;
        }
      } catch (capErr) {
        console.warn("[recordGhostMatchAction] Daily cap check error:", capErr);
      }
    }

    // 4. Insert match history row (with unique claim constraint protection)
    let claimCollision = false;
    const { error: matchInsertErr } = await (db.from("ghost_duel_matches") as any).insert({
      ghost_run_id: ghostRunId,
      problem_id: problemId,
      problem_title: problemTitle,
      challenger_github: challengerGithub,
      challenger_name: (input.challenger_name || challengerGithub).slice(0, 50),
      challenger_time_seconds: verifiedTimeSeconds,
      result,
      time_diff_seconds: timeDiffSeconds,
    });

    if (matchInsertErr) {
      if (
        result === "won" &&
        (matchInsertErr.code === "23505" ||
          matchInsertErr.message?.includes("duplicate") ||
          matchInsertErr.message?.includes("unique"))
      ) {
        alreadyClaimed = true;
        claimCollision = true;
      }
    }

    // Mark session completed (single-use consumption)
    if (sessionId) {
      try {
        await (db.from("ghost_duel_sessions") as any)
          .update({ completed_at: new Date().toISOString() })
          .eq("id", sessionId);
      } catch {}
    } else if (ghostRunId) {
      try {
        await (db.from("ghost_duel_sessions") as any)
          .update({ completed_at: new Date().toISOString() })
          .eq("ghost_run_id", ghostRunId)
          .eq("challenger_github", challengerGithub);
      } catch {}
    }

    let pointsAwarded = 0;
    let squadPointsAwarded = 0;

    // 5. Award points only if won, not already claimed, no claim collision, and daily cap not reached
    if (result === "won" && !alreadyClaimed && !claimCollision && !dailyCapExceeded) {
      pointsAwarded = COMMUNITY_POINTS.GHOST_DUEL_WIN;

      // Update user points and duels_won in members table
      try {
        const { data: member } = await (db.from("members") as any)
          .select("total_points, duels_won")
          .eq("github", challengerGithub)
          .maybeSingle();

        const memberData = member as { total_points?: number; duels_won?: number } | null;

        if (memberData) {
          await (db.from("members") as any)
            .update({
              total_points: (memberData.total_points || 0) + pointsAwarded,
              duels_won: (memberData.duels_won || 0) + 1,
            })
            .eq("github", challengerGithub);
        }
      } catch (e) {
        console.warn("Could not update member points:", e);
      }

      // Connect to user's Squad and award squad boost
      try {
        const { data: squadMembership } = await (db.from("squad_members") as any)
          .select("squad_id, points_contributed")
          .eq("github", challengerGithub)
          .maybeSingle();

        const membership = squadMembership as { squad_id: string; points_contributed: number } | null;

        if (membership?.squad_id) {
          squadPointsAwarded = COMMUNITY_POINTS.SQUAD_GHOST_DUEL_BOOST;

          // Update member contribution
          await (db.from("squad_members") as any)
            .update({
              points_contributed: (membership.points_contributed || 0) + squadPointsAwarded,
            })
            .eq("github", challengerGithub);

          // Update squad total points
          const { data: squad } = await (db.from("squads") as any)
            .select("total_points")
            .eq("id", membership.squad_id)
            .single();

          const squadData = squad as { total_points: number } | null;
          if (squadData) {
            await (db.from("squads") as any)
              .update({
                total_points: (squadData.total_points || 0) + squadPointsAwarded,
              })
              .eq("id", membership.squad_id);
          }
        }
      } catch (sqErr) {
        console.warn("Could not update squad points for ghost match:", sqErr);
      }
    }

    return {
      success: true,
      result,
      timeDiffSeconds,
      pointsAwarded,
      squadPointsAwarded,
      alreadyClaimed,
    };
  } catch (err: any) {
    console.warn("[recordGhostMatchAction] Error:", err);
    return {
      success: false,
      result: "lost",
      timeDiffSeconds: 0,
      pointsAwarded: 0,
      squadPointsAwarded: 0,
      error: err?.message || "Failed to record ghost match.",
    };
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
