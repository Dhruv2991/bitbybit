"use server";
import { getVerifiedTokenUser } from "@/lib/serverAuth";

import { getSupabaseClient, createServerSupabaseClient } from "@/lib/supabase";
import { INPUT_LIMITS, COMMUNITY_POINTS } from "@/config/community";
import type { ProblemDiscussion, ApproachType } from "@/types/community";

function getDb() {
  try {
    return createServerSupabaseClient();
  } catch {
    return getSupabaseClient();
  }
}

const ALLOWED_APPROACHES: ReadonlySet<ApproachType> = new Set([
  "intuitive",
  "brute_force",
  "optimized",
  "one_liner",
]);

export async function getDiscussionsAction(
  problemId: string,
  userGithub?: string
): Promise<ProblemDiscussion[]> {
  const cleanProblemId = problemId?.trim();
  if (!cleanProblemId) return [];

  try {
    const db = getDb();
    const { data, error } = await (db.from("problem_discussions") as any)
      .select("*")
      .eq("problem_id", cleanProblemId)
      .order("upvotes", { ascending: false })
      .order("created_at", { ascending: false });

    if (error || !data) return [];

    let upvotedIds = new Set<string>();
    const cleanGithub = userGithub?.trim();
    if (cleanGithub && data.length > 0) {
      const discIds = data.map((d: any) => d.id);
      const { data: votes } = await (db.from("problem_discussion_votes") as any)
        .select("discussion_id")
        .eq("github", cleanGithub)
        .in("discussion_id", discIds);

      if (votes) {
        upvotedIds = new Set(votes.map((v: any) => v.discussion_id));
      }
    }

    return data.map((d: any) => ({
      ...d,
      has_upvoted: upvotedIds.has(d.id),
    }));
  } catch (err) {
    console.error("getDiscussionsAction error", err);
    return [];
  }
}

export async function createDiscussionAction(input: {
  problemId: string;
  userGithub: string;
  userName: string;
  title: string;
  content: string;
  approachType: ApproachType;
  token?: string;
}): Promise<{ success: boolean; discussion?: ProblemDiscussion; error?: string }> {
  let cleanGithub = input.userGithub?.trim();
  let cleanName = input.userName?.trim();
  if (input.token) {
    const authUser = await getVerifiedTokenUser(input.token);
    if (!authUser) {
      return { success: false, error: "Authentication failed. Valid GitHub session required." };
    }
    cleanGithub = authUser.github;
    cleanName = authUser.name;
  }
  if (!cleanGithub) {
    return { success: false, error: "Authentication required to share an explanation." };
  }

  const cleanProblemId = input.problemId?.trim();
  if (!cleanProblemId) {
    return { success: false, error: "Problem identifier is missing." };
  }

  // Sanitize title
  const cleanTitle = (input.title || "")
    .replace(/<[^>]*>?/gm, "")
    .replace(/[<>]/g, "")
    .trim();

  if (
    cleanTitle.length < INPUT_LIMITS.DISCUSSION_TITLE_MIN ||
    cleanTitle.length > INPUT_LIMITS.DISCUSSION_TITLE_MAX
  ) {
    return {
      success: false,
      error: `Title must be between ${INPUT_LIMITS.DISCUSSION_TITLE_MIN} and ${INPUT_LIMITS.DISCUSSION_TITLE_MAX} characters.`,
    };
  }

  // Sanitize content
  const cleanContent = (input.content || "").replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "").trim();
  if (
    cleanContent.length < INPUT_LIMITS.DISCUSSION_CONTENT_MIN ||
    cleanContent.length > INPUT_LIMITS.DISCUSSION_CONTENT_MAX
  ) {
    return {
      success: false,
      error: `Explanation content must be between ${INPUT_LIMITS.DISCUSSION_CONTENT_MIN} and ${INPUT_LIMITS.DISCUSSION_CONTENT_MAX} characters.`,
    };
  }

  const approach: ApproachType = ALLOWED_APPROACHES.has(input.approachType)
    ? input.approachType
    : "intuitive";

  try {
    const db = getDb();
    const { data, error } = await (db.from("problem_discussions") as any)
      .insert({
        problem_id: cleanProblemId,
        github: cleanGithub,
        author_name: input.userName?.trim() || cleanGithub,
        title: cleanTitle,
        content: cleanContent,
        approach_type: approach,
        upvotes: 0, // Starts at 0: author does not get free self-upvote
      })
      .select()
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || "Failed to publish explanation." };
    }

    return {
      success: true,
      discussion: {
        ...data,
        has_upvoted: false,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || "An unexpected error occurred." };
  }
}

export async function upvoteDiscussionAction(
  discussionId: string,
  userGithub: string,
  token?: string
): Promise<{ success: boolean; newUpvotes?: number; error?: string }> {
  let cleanGithub = userGithub?.trim();
  if (token) {
    const authUser = await getVerifiedTokenUser(token);
    if (!authUser) {
      return { success: false, error: "Authentication failed. Valid GitHub session required." };
    }
    cleanGithub = authUser.github;
  }
  if (!cleanGithub) {
    return { success: false, error: "Authentication required to upvote explanations." };
  }

  const cleanDiscId = discussionId?.trim();
  if (!cleanDiscId) {
    return { success: false, error: "Discussion identifier is missing." };
  }

  try {
    const db = getDb();

    // 1. Fetch discussion to check author
    const { data: disc, error: discErr } = await (db.from("problem_discussions") as any)
      .select("id, github, upvotes")
      .eq("id", cleanDiscId)
      .maybeSingle();

    if (discErr || !disc) {
      return { success: false, error: "Discussion post not found." };
    }

    // 2. STRICT: Author cannot upvote their own post
    if (disc.github === cleanGithub) {
      return { success: false, error: "You cannot upvote your own explanation." };
    }

    // 3. Check if user already upvoted
    const { data: existingVote } = await (db.from("problem_discussion_votes") as any)
      .select("id")
      .eq("discussion_id", cleanDiscId)
      .eq("github", cleanGithub)
      .maybeSingle();

    if (existingVote) {
      return { success: false, error: "You have already upvoted this explanation." };
    }

    // 4. Record vote in DB
    const { error: voteErr } = await (db.from("problem_discussion_votes") as any).insert({
      discussion_id: cleanDiscId,
      github: cleanGithub,
    });

    if (voteErr) {
      if (voteErr.code === "23505" || voteErr.message?.includes("duplicate") || voteErr.message?.includes("unique")) {
        return { success: false, error: "You have already upvoted this explanation." };
      }
      return { success: false, error: voteErr.message || "Failed to record upvote." };
    }

    // 5. Discussion upvotes are atomically incremented by database trigger trg_increment_discussion_upvotes
    const { data: updatedDisc } = await (db.from("problem_discussions") as any)
      .select("upvotes")
      .eq("id", cleanDiscId)
      .maybeSingle();

    let newUpvotes = updatedDisc?.upvotes;
    if (newUpvotes === undefined || newUpvotes === disc.upvotes) {
      // Fallback for mock environments where database triggers are not attached
      newUpvotes = (disc.upvotes || 0) + 1;
      await (db.from("problem_discussions") as any)
        .update({ upvotes: newUpvotes })
        .eq("id", cleanDiscId);
    }

    return { success: true, newUpvotes };
  } catch (err: any) {
    return { success: false, error: err.message || "An unexpected error occurred while upvoting." };
  }
}

export async function unvoteDiscussionAction(
  discussionId: string,
  userGithub: string,
  token?: string
): Promise<{ success: boolean; newUpvotes?: number; error?: string }> {
  let cleanGithub = userGithub?.trim();
  if (token) {
    const authUser = await getVerifiedTokenUser(token);
    if (!authUser) {
      return { success: false, error: "Authentication failed. Valid GitHub session required." };
    }
    cleanGithub = authUser.github;
  }
  if (!cleanGithub) {
    return { success: false, error: "Authentication required to unvote." };
  }

  const cleanDiscId = discussionId?.trim();
  if (!cleanDiscId) {
    return { success: false, error: "Discussion identifier is missing." };
  }

  try {
    const db = getDb();

    // 1. Fetch discussion
    const { data: disc, error: discErr } = await (db.from("problem_discussions") as any)
      .select("id, github, upvotes")
      .eq("id", cleanDiscId)
      .maybeSingle();

    if (discErr || !disc) {
      return { success: false, error: "Discussion post not found." };
    }

    // 2. Check if vote exists
    const { data: existingVote } = await (db.from("problem_discussion_votes") as any)
      .select("id")
      .eq("discussion_id", cleanDiscId)
      .eq("github", cleanGithub)
      .maybeSingle();

    if (!existingVote) {
      return { success: false, error: "You have not upvoted this explanation." };
    }

    // 3. Delete vote from DB (triggers trg_decrement_discussion_upvotes)
    const { error: delErr } = await (db.from("problem_discussion_votes") as any)
      .delete()
      .eq("id", existingVote.id);

    if (delErr) {
      return { success: false, error: delErr.message || "Failed to remove upvote." };
    }

    // 4. Read updated upvotes
    const { data: updatedDisc } = await (db.from("problem_discussions") as any)
      .select("upvotes")
      .eq("id", cleanDiscId)
      .maybeSingle();

    let newUpvotes = updatedDisc?.upvotes;
    if (newUpvotes === undefined || newUpvotes === disc.upvotes) {
      newUpvotes = Math.max(0, (disc.upvotes || 0) - 1);
      await (db.from("problem_discussions") as any)
        .update({ upvotes: newUpvotes })
        .eq("id", cleanDiscId);
    }

    return { success: true, newUpvotes };
  } catch (err: any) {
    return { success: false, error: err.message || "An unexpected error occurred while unvoting." };
  }
}

