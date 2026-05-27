// ════════════════════════════════════════════════════════════
// src/app/api/submit-payment/route.ts
// POST /api/submit-payment
// User submits their UPI transaction ID for admin review.
// Status is set to 'pending' — admin manually confirms in AdminPage.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

interface SubmitPaymentBody {
  contestId:   string;
  contestName: string;
  github:      string;
  name:        string;
  txnId:       string;  // UPI transaction ID entered by user
}

export async function POST(req: NextRequest) {
  try {
    const body: SubmitPaymentBody = await req.json();
    const { contestId, contestName, github, name, txnId } = body;

    if (!contestId || !github || !name || !txnId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (txnId.trim().length < 6) {
      return NextResponse.json({ error: 'Transaction ID seems too short' }, { status: 400 });
    }

    const db = createServerSupabaseClient();

    // Upsert with status 'pending' — admin will manually verify and confirm
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db.from('contest_registrations') as any).upsert({
      contest_id:   contestId,
      contest_name: contestName,
      github,
      name,
      txn_id:       txnId.trim(),
      status:       'pending',
    }, { onConflict: 'contest_id,github' });

    if (error) {
      console.error('[submit-payment] Supabase upsert error:', error);
      return NextResponse.json({ error: 'DB write failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[/api/submit-payment]', err);
    return NextResponse.json({ error: err.message || 'Submission failed' }, { status: 500 });
  }
}
