// ════════════════════════════════════════════════════════════
// src/app/api/razorpay/verify/route.ts
// POST /api/razorpay/verify
//
// SECURITY layers (all required, not just signature checking):
//   1. Signature check — proves payment wasn't tampered with client-side.
//   2. Identity from verified self-hosted session — never from request body.
//   3. Re-fetch payment from Razorpay's API and confirm amount/status 'captured'.
//   4. DB-level unique constraint on razorpay_payment_id prevents double application.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { computeNewPeriodEnd } from '@/lib/subscription';
import { sendEmail, subscriptionConfirmedEmail } from '@/lib/email';

interface Body {
  razorpay_order_id:   string;
  razorpay_payment_id: string;
  razorpay_signature:  string;
  purpose:             'subscription';
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json({ error: 'Razorpay not configured on server' }, { status: 500 });
    }

    const authUser = await getCurrentUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }
    const { id: userId, githubUsername, name, email } = authUser;

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
      console.error('[razorpay/verify] signature mismatch', { githubUsername, purpose });
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

    if (
      payment.notes?.userId && payment.notes.userId !== userId &&
      payment.notes?.github && payment.notes.github !== githubUsername
    ) {
      console.error('[razorpay/verify] identity mismatch between order notes and authenticated user', {
        orderNotes: payment.notes,
        authUserId: userId,
        authGithub: githubUsername,
      });
      return NextResponse.json({ error: 'Payment does not belong to this account' }, { status: 403 });
    }

    if (purpose !== 'subscription') {
      return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 });
    }

    // Fetch existing subscriber record from PostgreSQL
    const existingSub = await prisma.subscriber.findUnique({
      where: { userId },
    });

    // ── Idempotency Check ──────────────────────────────────────
    if (existingSub?.razorpayPaymentId === razorpay_payment_id) {
      return NextResponse.json({
        success: true,
        paymentId: razorpay_payment_id,
        currentPeriodEnd: existingSub.currentPeriodEnd.toISOString(),
      });
    }

    // ── Prior Payment Check ────────────────────────────────────
    const previousPaymentId = existingSub?.razorpayPaymentId;
    const hasPriorPayment =
      typeof previousPaymentId === 'string' &&
      previousPaymentId.startsWith('pay_') &&
      previousPaymentId !== razorpay_payment_id;

    const newPeriodEndStr = computeNewPeriodEnd(
      existingSub?.status === 'ACTIVE' ? 'confirmed' : 'pending',
      existingSub?.currentPeriodEnd ? existingSub.currentPeriodEnd.toISOString() : null,
      hasPriorPayment,
    );
    const newPeriodEndDate = new Date(newPeriodEndStr);

    // Upsert subscriber record in PostgreSQL
    await prisma.subscriber.upsert({
      where: { userId },
      create: {
        userId,
        txnId:              razorpay_payment_id,
        razorpayOrderId:    razorpay_order_id,
        razorpayPaymentId:  razorpay_payment_id,
        status:             'ACTIVE',
        currentPeriodEnd:   newPeriodEndDate,
      },
      update: {
        txnId:              razorpay_payment_id,
        razorpayOrderId:    razorpay_order_id,
        razorpayPaymentId:  razorpay_payment_id,
        status:             'ACTIVE',
        currentPeriodEnd:   newPeriodEndDate,
      },
    });

    // Send confirmation email and log to PostgreSQL
    if (email) {
      const existingLog = await prisma.emailLog.findFirst({
        where: {
          email,
          kind: 'subscription_confirmed',
          refId: razorpay_payment_id,
        },
      });

      if (!existingLog) {
        await prisma.emailLog.create({
          data: {
            email,
            kind: 'subscription_confirmed',
            refId: razorpay_payment_id,
          },
        });

        const { subject, html } = subscriptionConfirmedEmail(name || githubUsername, newPeriodEndStr);
        sendEmail(email, subject, html).catch((err) => {
          console.error('[razorpay/verify] Email send error:', err);
        });
      }
    }

    return NextResponse.json({
      success: true,
      paymentId: razorpay_payment_id,
      currentPeriodEnd: newPeriodEndStr,
    });
  } catch (err: any) {
    console.error('[/api/razorpay/verify]', err);
    return NextResponse.json({ error: err.message || 'Verification failed' }, { status: 500 });
  }
}
