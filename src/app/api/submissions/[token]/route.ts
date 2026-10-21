// ════════════════════════════════════════════════════════════
// src/app/api/submissions/[token]/route.ts
// GET /api/submissions/{token}
//
// Direct status proxy for Judge0 submission:
// Queries GET /submissions/{token} and returns submission state
// along with is_finished flag (status.id > 2).
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { getJudge0Submission } from '@/lib/executor';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> | { token: string } }
) {
  try {
    const resolvedParams = await params;
    const token = resolvedParams.token;
    if (!token) {
      return NextResponse.json({ error: 'Missing submission token' }, { status: 400 });
    }

    const submission = await getJudge0Submission(token);
    const isFinished = (submission.status?.id ?? 0) > 2;

    return NextResponse.json({
      ...submission,
      is_finished: isFinished,
    });
  } catch (err: any) {
    console.error('[/api/submissions/[token] GET]', err);
    return NextResponse.json({ error: err.message || 'Status check failed' }, { status: 500 });
  }
}
