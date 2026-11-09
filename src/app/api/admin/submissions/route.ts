import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdminUser } from "@/lib/serverAuth";
import { createServerSupabaseClient } from "@/lib/supabase";
import { internalAwardPoints } from "@/lib/adminPoints";

/**
 * POST /api/admin/submissions
 * Admin-gated endpoint for approving, rejecting, or editing points of standard submissions.
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

      // Verify fresh submission status
      const { data: freshSub } = await (db.from("submissions") as any)
        .select("status")
        .eq("id", id)
        .maybeSingle();

      if (freshSub?.status === "approved") {
        return NextResponse.json({ error: "Already approved" }, { status: 400 });
      }

      const { error: subErr } = await (db.from("submissions") as any)
        .update({ status: "approved", points_awarded: points })
        .eq("id", id);

      if (subErr) {
        return NextResponse.json({ error: subErr.message }, { status: 500 });
      }

      await internalAwardPoints(db, github, points, false, undefined, points > 0);

      return NextResponse.json({ success: true, points });
    }

    if (action === "reject") {
      const finalReason = (body.reason as string)?.trim() || "Does not meet requirements";

      const { error: subErr } = await (db.from("submissions") as any)
        .update({ status: "rejected", reject_reason: finalReason })
        .eq("id", id);

      if (subErr) {
        return NextResponse.json({ error: subErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, reason: finalReason });
    }

    if (action === "edit_points") {
      const newPoints = Math.max(0, parseInt(body.newPoints, 10) || 0);
      const delta = parseInt(body.delta, 10) || 0;

      const { error: subErr } = await (db.from("submissions") as any)
        .update({ points_awarded: newPoints })
        .eq("id", id);

      if (subErr) {
        return NextResponse.json({ error: subErr.message }, { status: 500 });
      }

      if (delta !== 0) {
        const { data: mem } = await (db.from("members") as any)
          .select("total_points")
          .eq("github", github)
          .maybeSingle();

        if (mem) {
          await (db.from("members") as any)
            .update({ total_points: Math.max(0, (mem.total_points || 0) + delta) })
            .eq("github", github);
        }
      }

      return NextResponse.json({ success: true, newPoints });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

