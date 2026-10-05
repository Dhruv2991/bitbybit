import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import type { Problem, TestCase } from '@/types/database';

export const dynamic = 'force-dynamic';

/**
 * Strips hidden test cases from a problem payload for client security
 */
function sanitizeProblemForClient(problem: Problem, isAdmin = false): Problem {
  if (isAdmin) return problem;

  const rawCases: TestCase[] = problem.test_cases || [];
  // Keep only test cases that are explicitly NOT hidden (or first 2-3 if none marked)
  const visibleCases = rawCases.filter(tc => !tc.is_hidden);

  return {
    ...problem,
    // Strip hidden test cases completely from client payload
    test_cases: visibleCases.length > 0 ? visibleCases : rawCases.slice(0, 2),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'Problem ID is required' }, { status: 400 });
    }

    const db = getSupabaseClient();
    const { data: problem, error } = await db
      .from('problems')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !problem) {
      return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
    }

    // Check if requester is admin via header if present
    const authHeader = req.headers.get('authorization') || '';
    const isAdmin = authHeader.includes('admin');

    const sanitized = sanitizeProblemForClient(problem as Problem, isAdmin);
    return NextResponse.json(sanitized);
  } catch (err: any) {
    console.error('[/api/problems/[id]]', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch problem' }, { status: 500 });
  }
}
