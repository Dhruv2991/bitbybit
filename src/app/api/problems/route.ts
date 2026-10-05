import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import type { Problem, TestCase } from '@/types/database';

export const dynamic = 'force-dynamic';

function sanitizeProblem(p: Problem, isAdmin = false): Problem {
  if (isAdmin) return p;
  const rawCases: TestCase[] = p.test_cases || [];
  const visibleCases = rawCases.filter(tc => !tc.is_hidden);
  return {
    ...p,
    test_cases: visibleCases.length > 0 ? visibleCases : rawCases.slice(0, 2),
  };
}

export async function GET(req: NextRequest) {
  try {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('problems')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const authHeader = req.headers.get('authorization') || '';
    const isAdmin = authHeader.includes('admin');

    const sanitized = (data || []).map((p: any) => sanitizeProblem(p as Problem, isAdmin));
    return NextResponse.json(sanitized);
  } catch (err: any) {
    console.error('[/api/problems]', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch problems' }, { status: 500 });
  }
}
