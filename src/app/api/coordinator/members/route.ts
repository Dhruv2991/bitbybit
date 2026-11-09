import { NextRequest, NextResponse } from "next/server";
import { getVerifiedCoordinatorUser } from "@/lib/serverAuth";
import { createServerSupabaseClient } from "@/lib/supabase";

/**
 * GET /api/coordinator/members
 * Coordinator/Admin-gated endpoint returning member records.
 * STRICT PRIVACY REQUIREMENT: This view MUST NOT receive email addresses.
 */
export async function GET(req: NextRequest) {
  const coordinator = await getVerifiedCoordinatorUser(req);
  if (!coordinator) {
    return NextResponse.json({ error: "Unauthorized: Coordinator access required" }, { status: 403 });
  }

  try {
    const db = createServerSupabaseClient();
    // Exclude email and email_subscribed explicitly
    const { data: members, error } = await (db.from("members") as any)
      .select("id, github, name, avatar_url, karma_points, duels_won, duels_lost, total_points, problems_solved, streak, last_solved_at, squad_id, badges, created_at, updated_at")
      .order("total_points", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Safety scrub: ensure no email property exists in the response payload
    const sanitizedMembers = (members || []).map((m: any) => {
      const { email, email_subscribed, ...safeMember } = m;
      return safeMember;
    });

    return NextResponse.json({ members: sanitizedMembers });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

