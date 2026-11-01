import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Card-only columns — safe for any caller
const CARD_COLUMNS = [
  'id', 'title', 'difficulty', 'points', 'tags',
  'visibility', 'is_contest_problem', 'submission_count',
  'created_at', 'updated_at',
].join(', ');

/**
 * Returns problem details (description, example, hints, starter_code,
 * param_types, return_type) using the caller's own authenticated session
 * so PostgreSQL RLS policies apply.
 *
 * It will NOT return weekly (Pro) details to a free logged-in user.
 */
async function getDetailColumnsIfAllowed(
  req: NextRequest,
  problemId: string,
): Promise<Record<string, unknown> | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  // Use the caller's session token so database RLS policies on problem_details apply directly
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  );

  // 1. Query problem_details using caller's authenticated client
  // RLS enforces: is_admin, free problem (public/arena), or has_active_pro()
  const { data: details, error } = await (userClient.from('problem_details') as any)
    .select('description, example, hints, starter_code, param_types, return_type')
    .eq('problem_id', problemId)
    .maybeSingle();

  if (details && !error) {
    return details;
  }

  // If problem_details table exists and RLS blocked access (or problem not found), do not leak details
  const isTableMissing = error?.code === '42P01' || error?.message?.includes('does not exist');
  if (!isTableMissing) {
    return null;
  }

  // 2. Pre-migration fallback only (before problem_details table exists):
  // Check problem visibility using service role
  const adminDb = createServerSupabaseClient();
  const { data: prob } = await (adminDb.from('problems') as any)
    .select('visibility, is_contest_problem, description, example, hints, starter_code, param_types, return_type')
    .eq('id', problemId)
    .maybeSingle();

  const probData = prob as Record<string, unknown> | null;
  if (!probData) return null;

  // Free problems are safe to return to any authenticated caller
  const isFree = (probData.visibility === 'public' || probData.visibility === 'arena') && !probData.is_contest_problem;
  if (isFree) {
    const { visibility: _v, is_contest_problem: _c, ...safeDetails } = probData;
    return safeDetails;
  }

  // Weekly/Pro problem: verify caller is admin or active Pro via auth.identities
  const { data: userData } = await userClient.auth.getUser(token);
  const github = userData?.user?.identities?.find((id) => id.provider === 'github')?.identity_data?.user_name;
  if (!github) return null;

  const [{ data: adminRow }, { data: subRow }] = await Promise.all([
    (adminDb.from('admins') as any).select('github').eq('github', github).maybeSingle(),
    (adminDb.from('subscribers') as any)
      .select('status, current_period_end')
      .eq('github', github)
      .eq('status', 'confirmed')
      .gt('current_period_end', new Date().toISOString())
      .maybeSingle(),
  ]);

  if (adminRow || subRow) {
    const { visibility: _v, is_contest_problem: _c, ...safeDetails } = probData;
    return safeDetails;
  }

  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'Problem ID is required' }, { status: 400 });
    }

    // Always return card columns + sample test cases (public)
    const db = createServerSupabaseClient();
    let card: any = null;
    try {
      const res1 = await (db.from('problems') as any)
        .select(`${CARD_COLUMNS}, sample_test_cases, test_cases`)
        .eq('id', id)
        .maybeSingle();
      if (res1.data) card = res1.data;
    } catch {}

    if (!card) {
      try {
        const res2 = await (db.from('problems') as any)
          .select(`${CARD_COLUMNS}, test_cases`)
          .eq('id', id)
          .maybeSingle();
        if (res2.data) card = res2.data;
      } catch {}
    }

    if (!card) {
      const res3 = await db.from('problems').select(CARD_COLUMNS).eq('id', id).maybeSingle();
      card = res3.data;
    }

    if (!card) {
      return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
    }

    // Safely expose only sample test cases to browser execution
    const samples = (Array.isArray(card.sample_test_cases) && card.sample_test_cases.length > 0)
      ? card.sample_test_cases
      : (Array.isArray(card.test_cases) ? card.test_cases.slice(0, 2) : []);
    card.sample_test_cases = samples;
    card.test_cases = samples;

    // Merge in detail columns only if allowed by RLS / active entitlement
    const details = await getDetailColumnsIfAllowed(req, id);
    const result = details ? { ...(card as Record<string, unknown>), ...details } : card;

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[/api/problems/[id]]', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch problem' }, { status: 500 });
  }
}
