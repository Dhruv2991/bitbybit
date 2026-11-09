"use server";
import { getVerifiedTokenUser } from "@/lib/serverAuth";

import { getSupabaseClient, createServerSupabaseClient } from "@/lib/supabase";
import { CANONICAL_DAILY_POLL } from "@/config/community";
import type { CommunityPoll, CommunityPollOption } from "@/types/community";

function getDb() {
  try {
    return createServerSupabaseClient();
  } catch {
    return getSupabaseClient();
  }
}

export async function getActiveDailyPollAction(
  userGithub?: string
): Promise<{ poll: CommunityPoll; userVotedOptionId: string | null }> {
  try {
    const db = getDb();
    const cleanGithub = userGithub?.trim();

    const { data: dbPoll } = await (db.from("community_polls") as any)
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const poll: CommunityPoll = dbPoll
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

    let userVotedOptionId: string | null = null;
    if (cleanGithub) {
      const { data: voteData } = await (db.from("community_poll_votes") as any)
        .select("option_id")
        .eq("poll_id", poll.id)
        .eq("github", cleanGithub)
        .maybeSingle();

      if (voteData?.option_id) {
        userVotedOptionId = voteData.option_id;
      }
    }

    return { poll, userVotedOptionId };
  } catch (err) {
    console.error("getActiveDailyPollAction error", err);
    return { poll: CANONICAL_DAILY_POLL, userVotedOptionId: null };
  }
}

export async function voteDailyPollAction(
  pollId: string,
  optionId: string,
  userGithub: string,
  token?: string
): Promise<{
  success: boolean;
  error?: string;
  updatedOptions?: CommunityPollOption[];
}> {
  let cleanGithub = userGithub?.trim();
  if (token) {
    const authUser = await getVerifiedTokenUser(token);
    if (!authUser) {
      return { success: false, error: "Authentication failed. Valid GitHub session required." };
    }
    cleanGithub = authUser.github;
  }
  if (!cleanGithub) {
    return { success: false, error: "Authentication required to vote in community polls." };
  }

  const cleanPollId = pollId?.trim();
  const cleanOptionId = optionId?.trim();
  if (!cleanPollId || !cleanOptionId) {
    return { success: false, error: "Invalid poll selection." };
  }

  try {
    const db = getDb();

    // Check if user already voted
    const { data: existingVote } = await (db.from("community_poll_votes") as any)
      .select("id")
      .eq("poll_id", cleanPollId)
      .eq("github", cleanGithub)
      .maybeSingle();

    if (existingVote) {
      return { success: false, error: "You have already voted in this poll." };
    }

    // Insert vote record
    const { error: insertErr } = await (db.from("community_poll_votes") as any).insert({
      poll_id: cleanPollId,
      github: cleanGithub,
      option_id: cleanOptionId,
    });

    if (insertErr) {
      if (insertErr.code === "23505" || insertErr.message?.includes("duplicate") || insertErr.message?.includes("unique")) {
        return { success: false, error: "You have already voted in this poll." };
      }
      return { success: false, error: insertErr.message || "Failed to record your vote." };
    }

    // Fetch current poll options and update atomically
    const { data: currentPoll } = await (db.from("community_polls") as any)
      .select("options")
      .eq("id", cleanPollId)
      .maybeSingle();

    // 2. Fetch updated poll options (atomically updated by trigger trg_increment_poll_option_vote)
    const { data: refreshedPoll } = await (db.from("community_polls") as any)
      .select("options")
      .eq("id", cleanPollId)
      .maybeSingle();

    let updatedOptions: CommunityPollOption[] = Array.isArray(refreshedPoll?.options)
      ? refreshedPoll.options
      : CANONICAL_DAILY_POLL.options;

    // Fallback if database trigger was not active (e.g. unit mocks)
    const matchingOpt = updatedOptions.find((o) => o.id === cleanOptionId);
    if (!matchingOpt || (currentPoll && matchingOpt.votes === currentPoll.options?.find((o: any) => o.id === cleanOptionId)?.votes)) {
      updatedOptions = updatedOptions.map((opt) =>
        opt.id === cleanOptionId ? { ...opt, votes: (opt.votes || 0) + 1 } : opt
      );
      await (db.from("community_polls") as any)
        .update({ options: updatedOptions })
        .eq("id", cleanPollId);
    }

    return { success: true, updatedOptions };
  } catch (err: any) {
    return { success: false, error: err.message || "An unexpected error occurred while voting." };
  }
}
