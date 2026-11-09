import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdminUser } from "@/lib/serverAuth";
import { createServerSupabaseClient } from "@/lib/supabase";
import { internalAwardPoints } from "@/lib/adminPoints";

/**
 * GET /api/admin/members
 * Admin-gated endpoint returning full member records (ordered by points).
 */
export async function GET(req: NextRequest) {
  const admin = await getVerifiedAdminUser(req);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized: Admin access required" }, { status: 403 });
  }

  try {
    const db = createServerSupabaseClient();
    const { data: members, error } = await (db.from("members") as any)
      .select("*")
      .order("total_points", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ members: members || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/members
 * Admin-gated endpoint for point awards or manual member updates.
 */
export async function POST(req: NextRequest) {
  const admin = await getVerifiedAdminUser(req);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized: Admin access required" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const db = createServerSupabaseClient();

    if (action === "award_points") {
      const { github, points, isContest, contestId, countAsSolved } = body;
      if (!github || typeof points !== "number") {
        return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
      }

      await internalAwardPoints(
        db,
        github,
        points,
        Boolean(isContest),
        contestId,
        countAsSolved !== undefined ? Boolean(countAsSolved) : true
      );

      const { data: updatedMember } = await (db.from("members") as any)
        .select("*")
        .eq("github", github)
        .maybeSingle();

      return NextResponse.json({ success: true, member: updatedMember });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

