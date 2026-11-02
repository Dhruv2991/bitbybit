"use server";

import { createServerSupabaseClient } from "@/lib/supabase";
import type { Squad, SquadMember } from "@/types/community";

export async function getUserSquadAction(github: string): Promise<Squad | null> {
  if (!github) return null;
  try {
    const db = createServerSupabaseClient();
    const { data: memberData } = await (db.from("squad_members") as any)
      .select("squad_id")
      .eq("github", github)
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

    return {
      ...squadRes.data,
      members: (membersRes.data || []) as SquadMember[],
      member_count: (membersRes.data || []).length,
    };
  } catch (err) {
    console.error("getUserSquadAction error", err);
    return null;
  }
}

export async function getSquadsLeaderboardAction(): Promise<Squad[]> {
  try {
    const db = createServerSupabaseClient();
    const { data, error } = await (db.from("squads") as any)
      .select("*, squad_members(count)")
      .order("total_points", { ascending: false })
      .limit(50);

    if (error || !data) return [];
    return data.map((s: any) => ({
      ...s,
      member_count: s.squad_members?.[0]?.count || 1,
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
  userName: string
): Promise<{ success: boolean; squad?: Squad; error?: string }> {
  try {
    const db = createServerSupabaseClient();

    // Check if user is already in a squad
    const { data: existing } = await (db.from("squad_members") as any)
      .select("id")
      .eq("github", userGithub)
      .maybeSingle();

    if (existing) {
      return { success: false, error: "You are already a member of a squad. Leave it first to create a new one." };
    }

    // Generate unique code
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const cleanTag = tag.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "CLAN";
    const code = `${cleanTag}-${randomSuffix}`;

    const { data: squad, error: squadErr } = await (db.from("squads") as any)
      .insert({
        name: name.trim(),
        tag: cleanTag,
        code,
        leader_github: userGithub,
        total_points: 0,
      })
      .select()
      .single();

    if (squadErr || !squad) {
      return { success: false, error: squadErr?.message || "Failed to create squad" };
    }

    // Add leader as first member
    await (db.from("squad_members") as any).insert({
      squad_id: squad.id,
      github: userGithub,
      name: userName || userGithub,
      points_contributed: 0,
    });

    return { success: true, squad };
  } catch (err: any) {
    return { success: false, error: err.message || "An unexpected error occurred" };
  }
}

export async function joinSquadAction(
  code: string,
  userGithub: string,
  userName: string
): Promise<{ success: boolean; squad?: Squad; error?: string }> {
  try {
    const db = createServerSupabaseClient();

    // Check if user is already in a squad
    const { data: existing } = await (db.from("squad_members") as any)
      .select("id")
      .eq("github", userGithub)
      .maybeSingle();

    if (existing) {
      return { success: false, error: "You are already in a squad. Leave your current squad to join another." };
    }

    // Find squad by code
    const { data: squad } = await (db.from("squads") as any)
      .select("id, name")
      .eq("code", code.trim().toUpperCase())
      .maybeSingle();

    if (!squad) {
      return { success: false, error: "Invalid squad invite code. Double check the code and try again." };
    }

    // Check member count (Max 5)
    const { count } = await (db.from("squad_members") as any)
      .select("id", { count: "exact", head: true })
      .eq("squad_id", squad.id);

    if ((count || 0) >= 5) {
      return { success: false, error: "This squad is full (maximum 5 members reached)." };
    }

    // Join
    await (db.from("squad_members") as any).insert({
      squad_id: squad.id,
      github: userGithub,
      name: userName || userGithub,
      points_contributed: 0,
    });

    return { success: true, squad };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to join squad" };
  }
}

export async function leaveSquadAction(
  squadId: string,
  userGithub: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createServerSupabaseClient();
    await (db.from("squad_members") as any)
      .delete()
      .eq("squad_id", squadId)
      .eq("github", userGithub);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to leave squad" };
  }
}
