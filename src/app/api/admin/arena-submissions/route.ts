import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdminUser } from "@/lib/serverAuth";
import { createServerSupabaseClient } from "@/lib/supabase";
import { internalAwardPoints } from "@/lib/adminPoints";

/**
 * POST /api/admin/arena-submissions
 * Admin-gated endpoint for approving or rejecting contest arena submissions.
 */
export async function POST(req: NextRequest) {
  const admin = await getVerifiedAdminUser(req);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized: Admin access required" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action, id, github } = body;

    if (!id || !github) {
      return NextResponse.json({ error: "Missing submission ID or github username" }, { status: 400 });
    }

    const db = createServerSupabaseClient();

    if (action === "approve") {
      const points = Math.max(0, parseInt(body.points, 10) || 0);
      const contestId = body.contestId;

      // Verify fresh submission status
      const { data: freshArena } = await (db.from("arena_submissions") as any)
        .select("status")
        .eq("id", id)
        .maybeSingle();

      if (freshArena?.status === "reviewed") {
        return NextResponse.json({ error: "Already reviewed" }, { status: 400 });
      }

      const { error: subErr } = await (db.from("arena_submissions") as any)
        .update({ status: "reviewed", points_awarded: points })
        .eq("id", id);

      if (subErr) {
        return NextResponse.json({ error: subErr.message }, { status: 500 });
      }

      // Arena awards points with countAsSolved = false (streak & problems_solved unaffected)
      await internalAwardPoints(db, github, points, true, contestId ?? undefined, false);

      return NextResponse.json({ success: true, points });
    }

    if (action === "reject") {
      const finalReason = (body.reason as string)?.trim() || "Did not meet requirements";

      const { error: subErr } = await (db.from("arena_submissions") as any)
        .update({ status: "disqualified", strike_penalty_factor: 0 })
        .eq("id", id);

      if (subErr) {
        return NextResponse.json({ error: subErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, reason: finalReason });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

