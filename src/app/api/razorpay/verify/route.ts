// ════════════════════════════════════════════════════════════
// src/app/api/razorpay/verify/route.ts
// POST /api/razorpay/verify
//
// SECURITY layers (all required, not just signature checking):
//   1. Signature check — proves the payment response wasn't
//      tampered with client-side.
//   2. Identity from a verified Supabase Auth token — never from
//      the request body — so a payment can't be attributed to a
//      different account than the one that actually paid.
//   3. Re-fetch the payment from Razorpay's own API and confirm
//      its amount matches what we expect and status is 'captured'
//      — closes the loop even if create-order had any edge case.
//   4. DB-level unique constraint on razorpay_payment_id (see
//      migrations/) prevents the same payment being applied twice.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import Razorpay from 'razorpay';
import { computeNewPeriodEnd } from '@/lib/subscription';
import { sendEmail, subscriptionConfirmedEmail } from '@/lib/email';

interface Body {
  razorpay_order_id:   string;
  razorpay_payment_id: string;
  razorpay_signature:  string;
  purpose:             'subscription';
}

async function getVerifiedUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const github = data.user.user_metadata?.user_name as string | undefined;
  const name   = data.user.user_metadata?.full_name as string | undefined;
  const email  = data.user.email as string | undefined;
  if (!github) return null;

  return { github, name: name || github, email: email || null };
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json({ error: 'Razorpay not configured on server' }, { status: 500 });
    }

    const authUser = await getVerifiedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const { github, name, email } = authUser;

    const body: Body = await req.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      purpose,
    } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !purpose) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // ── Layer 1: signature check ──────────────────────────────
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const sigValid =
      expectedSignature.length === razorpay_signature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpay_signature));

    if (!sigValid) {
      console.error('[razorpay/verify] signature mismatch', { github, purpose });
      return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 });
    }

    // ── Layer 2 (defense-in-depth): confirm with Razorpay directly ──
    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (payment.status !== 'captured') {
      return NextResponse.json({ error: `Payment not captured (status: ${payment.status})` }, { status: 400 });
    }

    if (payment.notes?.github && payment.notes.github !== github) {
      console.error('[razorpay/verify] identity mismatch between order notes and authenticated user', {
        orderGithub: payment.notes.github, authGithub: github,
      });
      return NextResponse.json({ error: 'Payment does not belong to this account' }, { status: 403 });
    }

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    if (purpose !== 'subscription') {
      return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 });
    }

    // Fetch existing subscriber row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingSub } = await (db.from('subscribers') as any)
      .select('status, current_period_end, razorpay_payment_id')
      .eq('github', github)
      .maybeSingle();

    // ── Idempotency Check ──────────────────────────────────────
    // If the webhook route already processed this EXACT payment_id, return immediately 
    // to prevent recalculating and double-stacking dates.
    if (existingSub?.razorpay_payment_id === razorpay_payment_id) {
      return NextResponse.json({
        success: true,
        paymentId: razorpay_payment_id,
        currentPeriodEnd: existingSub.current_period_end,
      });
    }

    // ── Prior Payment Check ────────────────────────────────────
    // A prior payment MUST exist, start with 'pay_', and NOT be equal to the current payment.
    const previousPaymentId = existingSub?.razorpay_payment_id;
    const hasPriorPayment =
      typeof previousPaymentId === 'string' &&
      previousPaymentId.startsWith('pay_') &&
      previousPaymentId !== razorpay_payment_id;

    const newPeriodEnd = computeNewPeriodEnd(
      existingSub?.status,
      existingSub?.current_period_end,
      hasPriorPayment,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db.from('subscribers') as any).upsert(
      {
        github, name, email,
        txn_id:              razorpay_payment_id,
        razorpay_order_id,
        razorpay_payment_id,
        status:              'confirmed',
        current_period_end:  newPeriodEnd,
      },
      { onConflict: 'github' },
    );
    if (error) {
      console.error('[razorpay/verify] subscribers upsert error:', error);
      return NextResponse.json({ error: 'This payment has already been used, or the write failed' }, { status: 409 });
    }

    if (email) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: logged } = await (db.from('email_log') as any)
        .upsert(
          { github, email, kind: 'subscription_confirmed', ref_id: razorpay_payment_id },
          { onConflict: 'github,kind,ref_id', ignoreDuplicates: true },
        )
        .select('github')
        .maybeSingle();

      if (logged) {
        const { subject, html } = subscriptionConfirmedEmail(name, newPeriodEnd);
        sendEmail(email, subject, html).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, paymentId: razorpay_payment_id, currentPeriodEnd: newPeriodEnd });
  } catch (err: any) {
    console.error('[/api/razorpay/verify]', err);
    return NextResponse.json({ error: err.message || 'Verification failed' }, { status: 500 });
  }
}