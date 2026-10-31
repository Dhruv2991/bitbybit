import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Card-only columns — safe for any caller. Full content (description,
// hints, starter_code, example, param_types, return_type) is gated
// behind problem_details (Issue #1 Phase B) and the Workspace route.
const CARD_COLUMNS = [
  'id', 'title', 'difficulty', 'points', 'tags',
  'visibility', 'is_contest_problem', 'submission_count',
  'created_at', 'updated_at',
].join(', ');

export async function GET(_req: NextRequest) {
  try {
    // Service role so we can read all rows; column restriction is the gate
    const db = createServerSupabaseClient();
    const { data, error } = await db
      .from('problems')
      .select(CARD_COLUMNS)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err: any) {
    console.error('[/api/problems]', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch problems' }, { status: 500 });
  }
}
