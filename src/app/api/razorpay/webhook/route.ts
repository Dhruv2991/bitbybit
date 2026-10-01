// ════════════════════════════════════════════════════════════
// src/app/api/razorpay/webhook/route.ts
// POST /api/razorpay/webhook
//
// Safety net: if the browser tab closes right after payment but
// before our client-side /api/razorpay/verify call fires, this
// webhook still confirms the payment server-side using Razorpay's
// own signed event.
//
// Configure in Razorpay Dashboard → Settings → Webhooks:
//   URL:     https://yourdomain.com/api/razorpay/webhook
//   Secret: any string you choose — put it in RAZORPAY_WEBHOOK_SECRET
//   Events: payment.captured (required), payment.failed (optional),
//           refund.processed (required — without this checked,
//           refunding someone in the Razorpay dashboard will NOT
//           revoke their access automatically).
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase';
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

      const db = createServerSupabaseClient();

      // eslint-disable-next-line
      const { data: sub } = await (db.from('subscribers') as any)
        .select('id, github, name, email, status')
        .eq('razorpay_payment_id', paymentId)
        .maybeSingle();

      if (!sub) {
        console.warn('[razorpay/webhook] refund for unknown payment_id', paymentId);
        return NextResponse.json({ success: true, ignored: 'no matching subscriber' });
      }

      if (sub.status !== 'rejected') {
        // eslint-disable-next-line
        const { error } = await (db.from('subscribers') as any)
          .update({ status: 'rejected' })
          .eq('id', sub.id);
        if (error) console.error('[razorpay/webhook] revoke on refund failed:', error);
      }

      if (sub.email) {
        // eslint-disable-next-line
        const { data: logged } = await (db.from('email_log') as any)
          .upsert(
            { github: sub.github, email: sub.email, kind: 'subscription_refunded', ref_id: paymentId },
            { onConflict: 'github,kind,ref_id', ignoreDuplicates: true },
          )
          .select('github')
          .maybeSingle();
        if (logged) {
          const { subject, html } = subscriptionRevokedEmail(sub.name || sub.github);
          const result = await sendEmailDetailed(sub.email, subject, html);
          if (!result.ok) {
            console.error(`[razorpay/webhook] refund email to ${sub.email} FAILED:`, result.error);
            // eslint-disable-next-line
            await (db.from('email_log') as any)
              .delete()
              .eq('github', sub.github).eq('kind', 'subscription_refunded').eq('ref_id', paymentId);
          }
        }
      }

      return NextResponse.json({ success: true, revoked: sub.github });
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
    const db = createServerSupabaseClient();

    if (notes.type === 'subscription' && notes.github) {
      // eslint-disable-next-line
      const { data: existingSub } = await (db.from('subscribers') as any)
        .select('status, current_period_end, razorpay_payment_id')
        .eq('github', notes.github)
        .maybeSingle();

      // ── Idempotency Check ──────────────────────────────────────
      // If client-side /verify route already processed this payment,
      // acknowledge and exit without re-calculating or double-stacking dates.
      if (existingSub?.razorpay_payment_id === paymentId) {
        return NextResponse.json({ success: true, alreadyProcessed: true });
      }

      // ── Prior Payment Check ────────────────────────────────────
      // A prior payment MUST exist, start with 'pay_', and NOT be equal to the current payment.
      const previousPaymentId = existingSub?.razorpay_payment_id;
      const hasPriorPayment =
        typeof previousPaymentId === 'string' &&
        previousPaymentId.startsWith('pay_') &&
        previousPaymentId !== paymentId;

      const newPeriodEnd = computeNewPeriodEnd(
        existingSub?.status,
        existingSub?.current_period_end,
        hasPriorPayment,
      );

      const email = notes.email || null;

      // eslint-disable-next-line
      const { error } = await (db.from('subscribers') as any).upsert(
        {
          github: notes.github,
          name: notes.name || notes.github,
          email,
          txn_id: paymentId,
          razorpay_payment_id: paymentId,
          status: 'confirmed',
          current_period_end: newPeriodEnd,
        },
        { onConflict: 'github' },
      );
      if (error) console.error('[razorpay/webhook] subscribers upsert error:', error);

      if (email && !error) {
        // eslint-disable-next-line
        const { data: logged } = await (db.from('email_log') as any)
          .upsert(
            { github: notes.github, email, kind: 'subscription_confirmed', ref_id: paymentId },
            { onConflict: 'github,kind,ref_id', ignoreDuplicates: true },
          )
          .select('github')
          .maybeSingle();
        if (logged) {
          const { subject, html } = subscriptionConfirmedEmail(notes.name || notes.github, newPeriodEnd);
          const result = await sendEmailDetailed(email, subject, html);
          if (!result.ok) {
            console.error(`[razorpay/webhook] confirmation email to ${email} FAILED:`, result.error);
            // eslint-disable-next-line
            await (db.from('email_log') as any)
              .delete()
              .eq('github', notes.github).eq('kind', 'subscription_confirmed').eq('ref_id', paymentId);
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
