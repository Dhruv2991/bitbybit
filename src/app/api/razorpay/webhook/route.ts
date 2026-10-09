// ════════════════════════════════════════════════════════════
// src/app/api/razorpay/webhook/route.ts
// POST /api/razorpay/webhook
//
// Safety net: if the browser tab closes right after payment but
// before our client-side /api/razorpay/verify call fires, this
// webhook still confirms the payment server-side using Razorpay's
// own signed event directly in our self-hosted PostgreSQL DB.
//
// Configure in Razorpay Dashboard → Settings → Webhooks:
//   URL:     https://yourdomain.com/api/razorpay/webhook
//   Secret:  RAZORPAY_WEBHOOK_SECRET
//   Events:  payment.captured, refund.processed
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { computeNewPeriodEnd } from '@/lib/subscription';
import { sendEmailDetailed, subscriptionConfirmedEmail, subscriptionRevokedEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      console.error('[razorpay/webhook] RAZORPAY_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    if (expected !== signature) {
      console.error('[razorpay/webhook] signature mismatch');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody);

    if (event.event === 'refund.processed') {
      const paymentId: string | undefined = event.payload?.refund?.entity?.payment_id;

      if (!paymentId) {
        console.warn('[razorpay/webhook] refund event with no payment_id', event.event);
        return NextResponse.json({ success: true, ignored: 'no payment_id' });
      }

      const sub = await prisma.subscriber.findFirst({
        where: { razorpayPaymentId: paymentId },
        include: { user: true },
      });

      if (!sub) {
        console.warn('[razorpay/webhook] refund for unknown payment_id', paymentId);
        return NextResponse.json({ success: true, ignored: 'no matching subscriber' });
      }

      if (sub.status !== 'CANCELLED') {
        await prisma.subscriber.update({
          where: { id: sub.id },
          data: { status: 'CANCELLED' },
        });
      }

      if (sub.user.email) {
        const existingLog = await prisma.emailLog.findFirst({
          where: {
            email: sub.user.email,
            kind: 'subscription_refunded',
            refId: paymentId,
          },
        });

        if (!existingLog) {
          await prisma.emailLog.create({
            data: {
              email: sub.user.email,
              kind: 'subscription_refunded',
              refId: paymentId,
            },
          });

          const { subject, html } = subscriptionRevokedEmail(sub.user.name || sub.user.githubUsername);
          const result = await sendEmailDetailed(sub.user.email, subject, html);
          if (!result.ok) {
            console.error(`[razorpay/webhook] refund email to ${sub.user.email} FAILED:`, result.error);
            await prisma.emailLog.deleteMany({
              where: {
                email: sub.user.email,
                kind: 'subscription_refunded',
                refId: paymentId,
              },
            });
          }
        }
      }

      return NextResponse.json({ success: true, revoked: sub.user.githubUsername });
    }

    if (event.event !== 'payment.captured') {
      return NextResponse.json({ success: true, ignored: event.event });
    }

    const payment = event.payload?.payment?.entity;
    if (!payment) {
      return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
    }

    const notes = payment.notes || {};
    const paymentId = payment.id as string;
    const orderId = payment.order_id as string | undefined;

    if (notes.type === 'subscription' && (notes.userId || notes.github)) {
      // Find user by userId or githubUsername
      const user = notes.userId
        ? await prisma.user.findUnique({ where: { id: notes.userId } })
        : await prisma.user.findUnique({ where: { githubUsername: notes.github } });

      if (!user) {
        console.warn('[razorpay/webhook] User not found for notes:', notes);
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const existingSub = await prisma.subscriber.findUnique({
        where: { userId: user.id },
      });

      // Idempotency check: already processed
      if (existingSub?.razorpayPaymentId === paymentId) {
        return NextResponse.json({ success: true, alreadyProcessed: true });
      }

      const previousPaymentId = existingSub?.razorpayPaymentId;
      const hasPriorPayment =
        typeof previousPaymentId === 'string' &&
        previousPaymentId.startsWith('pay_') &&
        previousPaymentId !== paymentId;

      const newPeriodEndStr = computeNewPeriodEnd(
        existingSub?.status === 'ACTIVE' ? 'confirmed' : 'pending',
        existingSub?.currentPeriodEnd ? existingSub.currentPeriodEnd.toISOString() : null,
        hasPriorPayment,
      );
      const newPeriodEndDate = new Date(newPeriodEndStr);

      await prisma.subscriber.upsert({
        where: { userId: user.id },
        create: {
          userId:             user.id,
          txnId:              paymentId,
          razorpayOrderId:    orderId || null,
          razorpayPaymentId:  paymentId,
          status:             'ACTIVE',
          currentPeriodEnd:   newPeriodEndDate,
        },
        update: {
          txnId:              paymentId,
          razorpayOrderId:    orderId || null,
          razorpayPaymentId:  paymentId,
          status:             'ACTIVE',
          currentPeriodEnd:   newPeriodEndDate,
        },
      });

      const recipientEmail = user.email || notes.email;
      if (recipientEmail) {
        const existingLog = await prisma.emailLog.findFirst({
          where: {
            email: recipientEmail,
            kind: 'subscription_confirmed',
            refId: paymentId,
          },
        });

        if (!existingLog) {
          await prisma.emailLog.create({
            data: {
              email: recipientEmail,
              kind: 'subscription_confirmed',
              refId: paymentId,
            },
          });

          const { subject, html } = subscriptionConfirmedEmail(user.name || user.githubUsername, newPeriodEndStr);
          const result = await sendEmailDetailed(recipientEmail, subject, html);
          if (!result.ok) {
            console.error(`[razorpay/webhook] confirmation email to ${recipientEmail} FAILED:`, result.error);
            await prisma.emailLog.deleteMany({
              where: {
                email: recipientEmail,
                kind: 'subscription_confirmed',
                refId: paymentId,
              },
            });
          }
        }
      }
    } else {
      console.warn('[razorpay/webhook] payment.captured with no matching notes', { paymentId, notes });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[/api/razorpay/webhook]', err);
    return NextResponse.json({ error: err.message || 'Webhook processing failed' }, { status: 500 });
  }
}
