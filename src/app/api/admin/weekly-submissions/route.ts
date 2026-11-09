import { NextRequest, NextResponse } from "next/server";
import { getVerifiedAdminUser } from "@/lib/serverAuth";
import { createServerSupabaseClient } from "@/lib/supabase";

/**
 * POST /api/admin/weekly-submissions
 * Admin-gated endpoint for approving, rejecting, or editing points of weekly challenge submissions.
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
      const finalPts = Math.max(0, parseInt(body.points, 10) || 0);

      const { data: freshSub } = await (db.from("weekly_submissions") as any)
        .select("status")
        .eq("id", id)
        .maybeSingle();

      if (freshSub?.status === "approved") {
        return NextResponse.json({ error: "Already approved" }, { status: 400 });
      }

      const { error: subErr } = await (db.from("weekly_submissions") as any)
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          points_awarded: finalPts,
        })
        .eq("id", id);

      if (subErr) {
        return NextResponse.json({ error: subErr.message }, { status: 500 });
      }

      // Update members table atomically
      const { data: member } = await (db.from("members") as any)
        .select("*")
        .eq("github", github)
        .maybeSingle();

      if (member) {
        await (db.from("members") as any)
          .update({
            total_points: (member.total_points || 0) + finalPts,
            problems_solved: (member.problems_solved || 0) + (finalPts > 0 ? 1 : 0),
            last_solved_at: finalPts > 0 ? new Date().toISOString() : member.last_solved_at,
            updated_at: new Date().toISOString(),
          })
          .eq("github", github);
      } else {
        await (db.from("members") as any).insert({
          github,
          name: body.name || github,
          total_points: finalPts,
          problems_solved: finalPts > 0 ? 1 : 0,
          streak: finalPts > 0 ? 1 : 0,
          last_solved_at: finalPts > 0 ? new Date().toISOString() : null,
        });
      }

      return NextResponse.json({ success: true, points: finalPts });
    }

    if (action === "reject") {
      const reason = (body.reason as string)?.trim() || "Rejected";

      const { error: subErr } = await (db.from("weekly_submissions") as any)
        .update({
          status: "rejected",
          review_notes: reason,
        })
        .eq("id", id);

      if (subErr) {
        return NextResponse.json({ error: subErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, reason });
    }

    if (action === "edit_points") {
      const newPts = Math.max(0, parseInt(body.newPoints, 10) || 0);
      const delta = parseInt(body.delta, 10) || 0;
      const isApproved = Boolean(body.isApproved);

      const { error: subErr } = await (db.from("weekly_submissions") as any)
        .update({ points_awarded: newPts })
        .eq("id", id);

      if (subErr) {
        return NextResponse.json({ error: subErr.message }, { status: 500 });
      }

      if (isApproved && delta !== 0) {
        const { data: mem } = await (db.from("members") as any)
          .select("total_points")
          .eq("github", github)
          .maybeSingle();

        if (mem) {
          await (db.from("members") as any)
            .update({
              total_points: Math.max(0, (mem.total_points || 0) + delta),
              updated_at: new Date().toISOString(),
            })
            .eq("github", github);
        }
      }

      return NextResponse.json({ success: true, points: newPts });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

