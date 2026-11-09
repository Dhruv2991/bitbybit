// ════════════════════════════════════════════════════════════
// src/app/api/contest/register/route.ts
// POST /api/contest/register
//
// Arena contest entry is FREE for confirmed subscribers — no
// payment is collected for contest entry at all (per Razorpay's
// unregistered-business restriction: only the monthly subscription
// fee may be collected; contest entry fees are not supported without
// a registered business entity). This route just verifies the
// caller is a genuine, confirmed subscriber and registers them.
//
// Identity comes from a verified Supabase Auth token — never from
// the request body — same pattern as the subscription payment routes.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isActiveSubscription } from '@/lib/subscription';
import { PRICING_CONFIG, formatPriceWithPeriod } from '@/lib/pricing';

interface Body {
  contestId: string;
}

import { getVerifiedApiUser } from '@/lib/serverAuth';

async function getVerifiedUser(req: NextRequest) {
  const user = await getVerifiedApiUser(req);
  if (!user) return null;
  return { github: user.github, name: user.name };
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getVerifiedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const { github, name } = authUser;

    const body: Body = await req.json();
    const { contestId } = body;
    if (!contestId) {
      return NextResponse.json({ error: 'Missing contestId' }, { status: 400 });
    }

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Must be an active (non-expired) subscriber — this is the ONLY
    // gate for contest entry, since no payment is collected for it.
    // eslint-disable-next-line
    const { data: sub } = await (db.from('subscribers') as any)
      .select('status, current_period_end')
      .eq('github', github)
      .maybeSingle();

    if (!isActiveSubscription(sub?.status, sub?.current_period_end)) {
      return NextResponse.json(
        { error: `An active ${formatPriceWithPeriod(PRICING_CONFIG.defaultMonthlyFee)} subscription is required to enter contests. Subscribe to unlock free entry to all contests.` },
        { status: 403 },
      );
    }

    // eslint-disable-next-line
    const { data: contest } = await (db.from('contests') as any)
      .select('id, name, status')
      .eq('id', contestId)
      .maybeSingle();

    if (!contest) {
      return NextResponse.json({ error: 'Contest not found' }, { status: 404 });
    }
    if (contest.status !== 'upcoming') {
      return NextResponse.json({ error: 'Registration is closed for this contest' }, { status: 400 });
    }

    // eslint-disable-next-line
    const { data: existing } = await (db.from('contest_registrations') as any)
      .select('id, status')
      .eq('contest_id', contestId)
      .eq('github', github)
      .maybeSingle();

    if (existing?.status === 'confirmed') {
      return NextResponse.json({ error: 'You are already registered for this contest' }, { status: 400 });
    }

    // Cap contest capacity at 70 confirmed registrations.
    const CONTEST_CAPACITY = 70;
    // eslint-disable-next-line
    const { count: confirmedCount } = await (db.from('contest_registrations') as any)
      .select('id', { count: 'exact', head: true })
      .eq('contest_id', contestId)
      .eq('status', 'confirmed');

    if ((confirmedCount ?? 0) >= CONTEST_CAPACITY) {
      return NextResponse.json(
        { error: `This contest is full (${CONTEST_CAPACITY}/${CONTEST_CAPACITY} seats taken).` },
        { status: 400 },
      );
    }

    // eslint-disable-next-line
    const { error } = await (db.from('contest_registrations') as any).upsert(
      {
        contest_id:   contestId,
        contest_name: contest.name,
        github, name,
        txn_id:              null, // no payment — free subscriber perk
        razorpay_order_id:   null,
        razorpay_payment_id: null,
        status:              'confirmed',
      },
      { onConflict: 'contest_id,github' },
    );

    if (error) {
      console.error('[/api/contest/register] upsert error:', error);
      return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[/api/contest/register]', err);
    return NextResponse.json({ error: err.message || 'Registration failed' }, { status: 500 });
  }
}
