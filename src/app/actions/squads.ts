"use server";
import { getVerifiedTokenUser } from "@/lib/serverAuth";

import { randomBytes } from "crypto";
import { getSupabaseClient, createServerSupabaseClient } from "@/lib/supabase";
import { SQUAD_CONFIG } from "@/config/community";
import type { Squad, SquadMember } from "@/types/community";

function getDb() {
  try {
    return createServerSupabaseClient();
  } catch {
    return getSupabaseClient();
  }
}

/**
 * Generate a cryptographically secure, unguessable invite code.
 * Example format: "ALPH-7E3D8F2A1C" (Tag prefix + 10 hex characters from randomBytes(5), ~1.1 trillion combinations, 40 bits entropy)
 */
function generateSquadCode(tag: string): string {
  const cleanTag = tag.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "CLAN";
  const suffix = randomBytes(5).toString("hex").toUpperCase();
  return `${cleanTag}-${suffix}`;
}

export async function generateSquadCodeAction(tag: string): Promise<string> {
  return generateSquadCode(tag);
}

export async function getUserSquadAction(github: string): Promise<Squad | null> {
  const cleanGithub = github?.trim();
  if (!cleanGithub) return null;

  try {
    const db = getDb();
    const { data: memberData } = await (db.from("squad_members") as any)
      .select("squad_id")
      .eq("github", cleanGithub)
      .maybeSingle();

    if (!memberData?.squad_id) return null;

    const [squadRes, membersRes] = await Promise.all([
      (db.from("squads") as any).select("*").eq("id", memberData.squad_id).maybeSingle(),
      (db.from("squad_members") as any)
        .select("*")
        .eq("squad_id", memberData.squad_id)
        .order("points_contributed", { ascending: false }),
    ]);

    if (!squadRes.data) return null;

    const members = (membersRes.data || []) as SquadMember[];
    return {
      ...squadRes.data,
      members,
      member_count: members.length,
    };
  } catch (err) {
    console.error("getUserSquadAction error", err);
    return null;
  }
}

export async function getSquadsLeaderboardAction(): Promise<Squad[]> {
  try {
    const db = getDb();
    const { data, error } = await (db.from("squads") as any)
      .select("*, squad_members(count)")
      .order("total_points", { ascending: false })
      .limit(50);

    if (error || !data) return [];
    return data.map((s: any) => ({
      ...s,
      member_count: s.squad_members?.[0]?.count ?? 1,
    }));
  } catch (err) {
    console.error("getSquadsLeaderboardAction error", err);
    return [];
  }
}

export async function createSquadAction(
  name: string,
  tag: string,
  userGithub: string,
  userName: string,
  token?: string
): Promise<{ success: boolean; squad?: Squad; error?: string }> {
  let cleanGithub = userGithub?.trim();
  let cleanUserName = userName?.trim();
  if (token) {
    const authUser = await getVerifiedTokenUser(token);
    if (!authUser) {
      return { success: false, error: "Authentication failed. Valid GitHub session required." };
    }
    cleanGithub = authUser.github;
    cleanUserName = authUser.name;
  }
  if (!cleanGithub) {
    return { success: false, error: "Authentication required to create a squad." };
  }

  const cleanName = (name || "").replace(/[<>]/g, "").trim();
  if (
    cleanName.length < SQUAD_CONFIG.NAME_MIN_LEN ||
    cleanName.length > SQUAD_CONFIG.NAME_MAX_LEN
  ) {
    return {
      success: false,
      error: `Squad name must be between ${SQUAD_CONFIG.NAME_MIN_LEN} and ${SQUAD_CONFIG.NAME_MAX_LEN} characters.`,
    };
  }

  const cleanTag = (tag || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
  if (
    cleanTag.length < SQUAD_CONFIG.TAG_MIN_LEN ||
    cleanTag.length > SQUAD_CONFIG.TAG_MAX_LEN
  ) {
    return {
      success: false,
      error: `Squad tag must be ${SQUAD_CONFIG.TAG_MIN_LEN}-${SQUAD_CONFIG.TAG_MAX_LEN} alphanumeric characters.`,
    };
  }

  try {
    const db = getDb();

    // Check if user is already in a squad
    const { data: existing } = await (db.from("squad_members") as any)
      .select("id")
      .eq("github", cleanGithub)
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        error: "You are already a member of a squad. Leave your current squad first to create a new one.",
      };
    }

    // Generate unguessable high-entropy code
    const code = generateSquadCode(cleanTag);

    const { data: squad, error: squadErr } = await (db.from("squads") as any)
      .insert({
        name: cleanName,
        tag: cleanTag,
        code,
        leader_github: cleanGithub,
        total_points: 0,
      })
      .select()
      .single();

    if (squadErr || !squad) {
      if (squadErr?.code === "23505" || squadErr?.message?.includes("duplicate")) {
        return { success: false, error: "A squad with this name already exists. Please choose a different name." };
      }
      return { success: false, error: squadErr?.message || "Failed to create squad. Please try again." };
    }

    // Add leader as first member
    await (db.from("squad_members") as any).insert({
      squad_id: squad.id,
      github: cleanGithub,
      name: userName?.trim() || cleanGithub,
      points_contributed: 0,
    });

    return { success: true, squad };
  } catch (err: any) {
    return { success: false, error: err.message || "An unexpected error occurred while creating squad." };
  }
}

// Persistent database-backed rate limiting on squad join attempts (5 attempts per minute per user/IP)
const fallbackJoinLimits = new Map<string, { count: number; resetAt: number }>();

async function verifyPersistentJoinRateLimit(db: any, cleanGithub: string): Promise<boolean> {
  try {
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { count, error } = await (db.from("squad_join_attempts") as any)
      .select("id", { count: "exact", head: true })
      .ilike("github", cleanGithub)
      .gte("attempted_at", oneMinuteAgo);

    if (!error && typeof count === "number") {
      if (count >= 5) return false;
      await (db.from("squad_join_attempts") as any).insert({ github: cleanGithub.toLowerCase() });
      return true;
    }
  } catch {}

  // In-memory fallback if database table is not present in mock environments
  const now = Date.now();
  const rec = fallbackJoinLimits.get(cleanGithub.toLowerCase());
  if (!rec || now >= rec.resetAt) {
    fallbackJoinLimits.set(cleanGithub.toLowerCase(), { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (rec.count >= 5) return false;
  rec.count += 1;
  return true;
}

export async function joinSquadAction(
  code: string,
  userGithub: string,
  userName: string,
  token?: string
): Promise<{ success: boolean; squad?: Squad; error?: string }> {
  let cleanGithub = userGithub?.trim();
  let cleanUserName = userName?.trim();
  if (token) {
    const authUser = await getVerifiedTokenUser(token);
    if (!authUser) {
      return { success: false, error: "Authentication failed. Valid GitHub session required." };
    }
    cleanGithub = authUser.github;
    cleanUserName = authUser.name;
  }
  if (!cleanGithub) {
    return { success: false, error: "Authentication required to join a squad." };
  }

  const cleanCode = code?.trim().toUpperCase();
  if (!cleanCode) {
    return { success: false, error: "Please enter a valid squad invite code." };
  }

  try {
    const db = getDb();

    // Check persistent database rate limiting
    const allowed = await verifyPersistentJoinRateLimit(db, cleanGithub);
    if (!allowed) {
      return {
        success: false,
        error: "Too many squad join attempts. Please wait 1 minute before trying again.",
      };
    }

    // Check if user is already in a squad
    const { data: existing } = await (db.from("squad_members") as any)
      .select("id")
      .eq("github", cleanGithub)
      .maybeSingle();

    if (existing) {
      return { success: false, error: "You are already in a squad. Leave your current squad to join another." };
    }

    // Find squad by code
    const { data: squad } = await (db.from("squads") as any)
      .select("id, name")
      .eq("code", cleanCode)
      .maybeSingle();

    if (!squad) {
      return { success: false, error: "Invalid squad invite code. Double check the code and try again." };
    }

    // Check member count (Max 5)
    const { count } = await (db.from("squad_members") as any)
      .select("id", { count: "exact", head: true })
      .eq("squad_id", squad.id);

    if ((count ?? 0) >= SQUAD_CONFIG.MAX_MEMBERS) {
      return { success: false, error: `This squad is full (maximum ${SQUAD_CONFIG.MAX_MEMBERS} members reached).` };
    }

    // Join squad
    const { error: insertErr } = await (db.from("squad_members") as any).insert({
      squad_id: squad.id,
      github: cleanGithub,
      name: userName?.trim() || cleanGithub,
      points_contributed: 0,
    });

    if (insertErr) {
      if (insertErr.message?.includes("full") || insertErr.message?.includes("maximum")) {
        return { success: false, error: `This squad is full (maximum ${SQUAD_CONFIG.MAX_MEMBERS} members reached).` };
      }
      return { success: false, error: insertErr.message || "Failed to join squad." };
    }

    return { success: true, squad };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to join squad." };
  }
}

export async function leaveSquadAction(
  squadId: string,
  userGithub: string,
  token?: string
): Promise<{ success: boolean; error?: string }> {
  let cleanGithub = userGithub?.trim();
  if (token) {
    const authUser = await getVerifiedTokenUser(token);
    if (!authUser) {
      return { success: false, error: "Authentication failed. Valid GitHub session required." };
    }
    cleanGithub = authUser.github;
  }
  const cleanSquadId = squadId?.trim();

  if (!cleanSquadId || !cleanGithub) {
    return { success: false, error: "Missing required squad ID or user identifier." };
  }

  try {
    const db = getDb();

    // Check if the user is the leader of the squad
    const { data: squad } = await (db.from("squads") as any)
      .select("id, leader_github")
      .eq("id", cleanSquadId)
      .maybeSingle();

    if (squad && squad.leader_github === cleanGithub) {
      // Find remaining members
      const { data: remainingMembers } = await (db.from("squad_members") as any)
        .select("github, points_contributed")
        .eq("squad_id", cleanSquadId)
        .neq("github", cleanGithub)
        .order("points_contributed", { ascending: false })
        .limit(1);

      if (remainingMembers && remainingMembers.length > 0) {
        // Transfer leadership to the member with highest points
        await (db.from("squads") as any)
          .update({ leader_github: remainingMembers[0].github })
          .eq("id", cleanSquadId);
      } else {
        // No remaining members: dissolve the empty squad
        await (db.from("squads") as any).delete().eq("id", cleanSquadId);
      }
    }

    // Remove the user from squad_members
    await (db.from("squad_members") as any)
      .delete()
      .eq("squad_id", cleanSquadId)
      .eq("github", cleanGithub);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to leave squad." };
  }
}
