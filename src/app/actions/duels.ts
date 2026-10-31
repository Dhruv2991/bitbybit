"use server";
// ════════════════════════════════════════════════════════════
// src/app/actions/duels.ts
// Server Actions for Real-Time 1v1 Code Duel Management
// ════════════════════════════════════════════════════════════

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";
import type { CodeDuel, CreateDuelInput, DuelProgress } from "@/types/duels";

type CodeDuelRow = Database["public"]["Tables"]["code_duels"]["Row"];
type CodeDuelInsert = Database["public"]["Tables"]["code_duels"]["Insert"];
type CodeDuelUpdate = Database["public"]["Tables"]["code_duels"]["Update"];

function getDbClient(): SupabaseClient {
  return createServerSupabaseClient() as unknown as SupabaseClient;
}

async function getVerifiedUserFromToken(token?: string): Promise<{ github: string; name: string } | null> {
  if (!token) return null;
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    const githubIdentity = data.user.identities?.find((id: any) => id.provider === "github");
    const github = githubIdentity?.identity_data?.user_name as string | undefined;
    if (!github) return null;
    const name = (githubIdentity?.identity_data?.full_name || githubIdentity?.identity_data?.name || github) as string;
    return { github, name };
  } catch {
    return null;
  }
}

/**
 * Creates a new 1v1 Code Duel room in 'waiting' state.
 */
export async function createDuelAction(input: CreateDuelInput, token?: string): Promise<{
  success: boolean;
  duel?: CodeDuel;
  duelId?: string;
  error?: string;
}> {
  try {
    const { problem_id, problem_title, time_limit_mins = 30 } = input;
    let host_github = input.host_github;
    let host_name = input.host_name;

    if (token) {
      const verified = await getVerifiedUserFromToken(token);
      if (!verified) {
        return { success: false, error: "Authentication failed. Valid GitHub session required." };
      }
      host_github = verified.github;
      host_name = verified.name;
    }

    if (!problem_id) {
      return { success: false, error: "Problem ID is required to create a duel." };
    }
    if (!host_github) {
      return { success: false, error: "Host user authentication is required." };
    }

    const db = getDbClient();

    // Resolve host member_id if member row exists
    let hostId: string | null = null;
    const { data: memberData } = await db
      .from("members")
      .select("id")
      .eq("github", host_github)
      .maybeSingle();

    const member = memberData as { id: string } | null;
    if (member?.id) {
      hostId = member.id;
    }

    // Query problem's total test cases so progress is accurate from the start
    let totalTests = 0;
    const { data: probData } = await db
      .from("problems")
      .select("test_cases")
      .eq("id", String(problem_id))
      .maybeSingle();

    if (probData && Array.isArray((probData as any).test_cases)) {
      totalTests = (probData as any).test_cases.length;
    }

    // Default progress state
    const initialHostProgress: DuelProgress = {
      testsPassed: 0,
      totalTests,
      status: "coding",
      lastUpdated: new Date().toISOString(),
    };

    const initialGuestProgress: DuelProgress = {
      testsPassed: 0,
      totalTests,
      status: "waiting",
      lastUpdated: new Date().toISOString(),
    };

    const newDuelPayload: CodeDuelInsert = {
      problem_id: String(problem_id),
      problem_title: problem_title || "Algorithmic Challenge",
      time_limit_mins: Number(time_limit_mins) || 30,
      host_id: hostId,
      host_github,
      host_name: host_name || host_github,
      status: "waiting",
      host_progress: initialHostProgress,
      guest_progress: initialGuestProgress,
    };

    const { data: duelData, error } = await db
      .from("code_duels")
      .insert(newDuelPayload)
      .select("*")
      .single();

    const duel = duelData as CodeDuelRow | null;

    if (error || !duel) {
      console.error("[createDuelAction] Database insert error:", error);
      return { success: false, error: error?.message || "Failed to create duel room." };
    }

    return {
      success: true,
      duel,
      duelId: duel.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error creating duel.";
    console.error("[createDuelAction] Exception:", err);
    return { success: false, error: message };
  }
}

/**
 * Fetches an existing duel room by its UUID.
 */
export async function getDuelAction(roomId: string): Promise<{
  success: boolean;
  duel?: CodeDuel;
  error?: string;
}> {
  try {
    if (!roomId) {
      return { success: false, error: "Room ID is required." };
    }

    const db = getDbClient();

    const { data: duelData, error } = await db
      .from("code_duels")
      .select("*")
      .eq("id", roomId)
      .maybeSingle();

    const duel = duelData as CodeDuelRow | null;

    if (error || !duel) {
      return { success: false, error: "Duel room not found or expired." };
    }

    return { success: true, duel };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load duel.";
    console.error("[getDuelAction] Exception:", err);
    return { success: false, error: message };
  }
}

/**
 * Allows a second participant (guest) to join an active or waiting room.
 */
export async function joinDuelAction(
  roomId: string,
  guestGithub: string,
  guestName: string,
  token?: string
): Promise<{
  success: boolean;
  duel?: CodeDuel;
  error?: string;
}> {
  try {
    let finalGuestGithub = guestGithub;
    let finalGuestName = guestName;

    if (token) {
      const verified = await getVerifiedUserFromToken(token);
      if (!verified) {
        return { success: false, error: "Authentication failed. Valid GitHub session required." };
      }
      finalGuestGithub = verified.github;
      finalGuestName = verified.name;
    }

    if (!roomId || !finalGuestGithub) {
      return { success: false, error: "Room ID and user credentials are required." };
    }

    const db = getDbClient();

    // Fetch existing room
    const { data: duelData, error: fetchErr } = await db
      .from("code_duels")
      .select("*")
      .eq("id", roomId)
      .maybeSingle();

    const duel = duelData as CodeDuelRow | null;

    if (fetchErr || !duel) {
      return { success: false, error: "Duel room not found." };
    }

    // If already the host, allow them back in without changes
    if (duel.host_github === finalGuestGithub) {
      return { success: true, duel };
    }

    // If already the guest, allow them in
    if (duel.guest_github === finalGuestGithub) {
      return { success: true, duel };
    }

    // Room is already occupied by someone else
    if (duel.guest_github && duel.guest_github !== finalGuestGithub) {
      return { success: false, error: "This duel room is already full with 2 combatants." };
    }

    // Room MUST be in waiting state to accept new joins
    if (duel.status !== "waiting") {
      return { success: false, error: "This duel room is no longer in waiting state." };
    }

    // Resolve guest member_id
    let guestId: string | null = null;
    const { data: memberData } = await db
      .from("members")
      .select("id")
      .eq("github", finalGuestGithub)
      .maybeSingle();

    const member = memberData as { id: string } | null;
    if (member?.id) {
      guestId = member.id;
    }

    const now = new Date().toISOString();
    const guestProgress: DuelProgress = {
      testsPassed: 0,
      totalTests: duel.host_progress?.totalTests || 0,
      status: "coding",
      lastUpdated: now,
    };

    const updatePayload: CodeDuelUpdate = {
      guest_id: guestId,
      guest_github: finalGuestGithub,
      guest_name: finalGuestName || finalGuestGithub,
      status: "active",
      guest_progress: guestProgress,
      started_at: duel.started_at || now,
    };

    const { data: updatedData, error: updateErr } = await db
      .from("code_duels")
      .update(updatePayload)
      .eq("id", roomId)
      .eq("status", "waiting")
      .select("*")
      .maybeSingle();

    const updated = updatedData as CodeDuelRow | null;

    if (updateErr || !updated) {
      return { success: false, error: updateErr?.message || "Failed to join duel room. It may already have started." };
    }

    return { success: true, duel: updated };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error joining duel.";
    console.error("[joinDuelAction] Exception:", err);
    return { success: false, error: message };
  }
}

/**
 * Updates a participant's telemetry without streaming raw code lines.
 * Final victory is verified and recorded server-side via /api/execute.
 */
export async function updateDuelProgressAction(
  roomId: string,
  userGithub: string,
  progress: Partial<DuelProgress>,
  token?: string
): Promise<{
  success: boolean;
  duel?: CodeDuel;
  isVictory?: boolean;
  error?: string;
}> {
  try {
    let finalUserGithub = userGithub;

    if (token) {
      const verified = await getVerifiedUserFromToken(token);
      if (!verified) {
        return { success: false, error: "Authentication failed. Valid GitHub session required." };
      }
      finalUserGithub = verified.github;
    }

    if (!roomId || !finalUserGithub) {
      return { success: false, error: "Invalid parameters." };
    }

    const db = getDbClient();

    const { data: duelData, error: fetchErr } = await db
      .from("code_duels")
      .select("*")
      .eq("id", roomId)
      .maybeSingle();

    const duel = duelData as CodeDuelRow | null;

    if (fetchErr || !duel) {
      return { success: false, error: "Duel room not found." };
    }

    const isHost = duel.host_github === finalUserGithub;
    const isGuest = duel.guest_github === finalUserGithub;

    if (!isHost && !isGuest) {
      return { success: false, error: "User is not a participant in this duel." };
    }

    if (duel.status !== "active") {
      return { success: false, error: "Duel match is not active." };
    }

    const now = new Date().toISOString();
    const existingProgress: DuelProgress = isHost ? duel.host_progress : duel.guest_progress;

    const mergedProgress: DuelProgress = {
      ...existingProgress,
      ...progress,
      lastUpdated: now,
    };

    const updatePayload: CodeDuelUpdate = {
      ...(isHost ? { host_progress: mergedProgress } : { guest_progress: mergedProgress }),
    };

    const { data: updatedData, error: updateErr } = await db
      .from("code_duels")
      .update(updatePayload)
      .eq("id", roomId)
      .eq("status", "active")
      .select("*")
      .maybeSingle();

    const updated = updatedData as CodeDuelRow | null;

    if (updateErr || !updated) {
      return { success: false, error: updateErr?.message || "Failed to update duel telemetry." };
    }

    return {
      success: true,
      duel: updated,
      isVictory: false,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error updating duel telemetry.";
    console.error("[updateDuelProgressAction] Exception:", err);
    return { success: false, error: message };
  }
}

/**
 * Forfeits or terminates a duel match (conceding victory to the opponent).
 */
export async function forfeitDuelAction(
  roomId: string,
  concedingGithub: string,
  token?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let finalConcedingGithub = concedingGithub;

    if (token) {
      const verified = await getVerifiedUserFromToken(token);
      if (!verified) {
        return { success: false, error: "Authentication failed. Valid GitHub session required." };
      }
      finalConcedingGithub = verified.github;
    }

    const db = getDbClient();

    const { data: duelData, error: fetchErr } = await db
      .from("code_duels")
      .select("*")
      .eq("id", roomId)
      .maybeSingle();

    const duel = duelData as CodeDuelRow | null;

    if (fetchErr || !duel) {
      return { success: false, error: "Duel room not found." };
    }

    const isHost = duel.host_github === finalConcedingGithub;
    const isGuest = duel.guest_github === finalConcedingGithub;

    if (!isHost && !isGuest) {
      return { success: false, error: "User is not a participant in this duel." };
    }

    if (duel.status !== "active") {
      return { success: false, error: "Cannot forfeit: duel match is not active." };
    }

    const opponentGithub = isHost ? duel.guest_github : duel.host_github;
    const opponentId = isHost ? duel.guest_id : duel.host_id;

    const updatePayload: CodeDuelUpdate = {
      status: "completed",
      winner_github: opponentGithub || null,
      winner_id: opponentId || null,
      ended_at: new Date().toISOString(),
    };

    const { error: updateErr } = await db
      .from("code_duels")
      .update(updatePayload)
      .eq("id", roomId)
      .eq("status", "active");

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error forfeiting duel.";
    return { success: false, error: message };
  }
}

/**
 * Leaves or discards a duel room.
 * - If match is 'waiting' and requester is host: marks room 'abandoned'.
 * - If match is 'waiting' and requester is guest: disassociates guest from room so others can join.
 * - If match is 'active': forfeits match to opponent.
 */
export async function leaveOrDiscardDuelAction(
  roomId: string,
  userGithub: string,
  token?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let finalGithub = userGithub;
    if (token) {
      const verified = await getVerifiedUserFromToken(token);
      if (verified) finalGithub = verified.github;
    }

    const db = getDbClient();
    const { data: duelData, error: fetchErr } = await db
      .from("code_duels")
      .select("*")
      .eq("id", roomId)
      .maybeSingle();

    const duel = duelData as CodeDuelRow | null;
    if (fetchErr || !duel) {
      return { success: false, error: "Duel room not found." };
    }

    const isHost = duel.host_github === finalGithub;
    const isGuest = duel.guest_github === finalGithub;

    if (!isHost && !isGuest) {
      return { success: false, error: "User is not a participant in this duel." };
    }

    if (duel.status === "completed" || duel.status === "abandoned") {
      return { success: true };
    }

    if (duel.status === "waiting") {
      if (isHost) {
        const updatePayload: CodeDuelUpdate = {
          status: "abandoned",
          ended_at: new Date().toISOString(),
        };
        const { error: updateErr } = await db
          .from("code_duels")
          .update(updatePayload)
          .eq("id", roomId);

        if (updateErr) return { success: false, error: updateErr.message };
        return { success: true };
      } else {
        const updatePayload: CodeDuelUpdate = {
          guest_github: null,
          guest_name: null,
          guest_id: null,
          guest_progress: { testsPassed: 0, totalTests: 0, status: "waiting" },
        };
        const { error: updateErr } = await db
          .from("code_duels")
          .update(updatePayload)
          .eq("id", roomId);

        if (updateErr) return { success: false, error: updateErr.message };
        return { success: true };
      }
    }

    if (duel.status === "active") {
      return forfeitDuelAction(roomId, finalGithub, token);
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error leaving duel room.";
    return { success: false, error: message };
  }
}
