// ════════════════════════════════════════════════════════════
// src/app/api/submit-weekly-payment/route.ts
// POST /api/submit-weekly-payment
// User submits UPI txn for weekly-challenge access.
// Status = 'pending' until admin confirms.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

interface Body {
  weeklyChallengeId:    string;
  weeklyChallengeTitle: string;
  github:               string;
  name:                 string;
  txnId:                string;
}

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const { weeklyChallengeId, weeklyChallengeTitle, github, name, txnId } = body;

    if (!weeklyChallengeId || !github || !name || !txnId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (txnId.trim().length < 6) {
      return NextResponse.json({ error: 'Transaction ID seems too short' }, { status: 400 });
    }

    const db = createServerSupabaseClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db.from('weekly_access') as any).upsert({
      weekly_challenge_id:    weeklyChallengeId,
      weekly_challenge_title: weeklyChallengeTitle,
      github,
      name,
      txn_id: txnId.trim(),
      status: 'pending',
    }, { onConflict: 'weekly_challenge_id,github' });

    if (error) {
      console.error('[submit-weekly-payment] Supabase error:', error);
      return NextResponse.json({ error: 'DB write failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[/api/submit-weekly-payment]', err);
    return NextResponse.json({ error: err.message || 'Submission failed' }, { status: 500 });
  }
}