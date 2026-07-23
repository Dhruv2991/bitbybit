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
//   URL:    https://yourdomain.com/api/razorpay/webhook
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
import { sendEmail, subscriptionConfirmedEmail, subscriptionRevokedEmail } from '@/lib/email';

// Webhook needs the RAW body to verify the signature — do not
// parse it as JSON before verifying.
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

    // Refund events: Razorpay fires refund.processed once the money is
    // actually back with the customer. We find the subscriber this
    // payment belongs to and revoke their access the same way the
    // admin's manual "Revoke access" button does, so an admin doesn't
    // have to remember to do it by hand every time they refund someone
    // from the Razorpay dashboard.
    if (event.event === 'refund.processed') {
      const paymentId: string | undefined = event.payload?.refund?.entity?.payment_id;

      if (!paymentId) {
        console.warn('[razorpay/webhook] refund event with no payment_id', event.event);
        return NextResponse.json({ success: true, ignored: 'no payment_id' });
      }

      const db = createServerSupabaseClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sub } = await (db.from('subscribers') as any)
        .select('id, github, name, email, status')
        .eq('razorpay_payment_id', paymentId)
        .maybeSingle();

      if (!sub) {
        console.warn('[razorpay/webhook] refund for unknown payment_id', paymentId);
        return NextResponse.json({ success: true, ignored: 'no matching subscriber' });
      }

      // Already revoked (e.g. the admin already clicked "Revoke access",
      // or we already processed this refund via the other event type) —
      // nothing left to do.
      if (sub.status !== 'rejected') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (db.from('subscribers') as any)
          .update({ status: 'rejected' })
          .eq('id', sub.id);
        if (error) console.error('[razorpay/webhook] revoke on refund failed:', error);
      }

      // Dedupe on payment_id so refund.processed and payment.refunded
      // firing for the same refund only sends one email, same pattern
      // as the payment.captured confirmation email below.
      if (sub.email) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: logged } = await (db.from('email_log') as any)
          .upsert(
            { github: sub.github, email: sub.email, kind: 'subscription_refunded', ref_id: paymentId },
            { onConflict: 'github,kind,ref_id', ignoreDuplicates: true },
          )
          .select('github')
          .maybeSingle();
        if (logged) {
          const { subject, html } = subscriptionRevokedEmail(sub.name || sub.github);
          sendEmail(sub.email, subject, html).catch(() => {});
        }
      }

      return NextResponse.json({ success: true, revoked: sub.github });
    }

    // We only care about successful captures beyond this point.
    // Everything else we just acknowledge so Razorpay stops retrying.
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

    // notes were set when the order was created (create-order route) —
    // we use them to figure out what this payment was for and who it's for.
    if (notes.type === 'subscription' && notes.github) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingSub } = await (db.from('subscribers') as any)
        .select('status, current_period_end')
        .eq('github', notes.github)
        .maybeSingle();

      const newPeriodEnd = computeNewPeriodEnd(existingSub?.status, existingSub?.current_period_end);
      const email = notes.email || null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // Same dedupe pattern as /api/razorpay/verify — keyed on
      // payment_id, so if the client-side verify call already sent
      // this confirmation, this is a silent no-op instead of a
      // duplicate email.
      if (email && !error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: logged } = await (db.from('email_log') as any)
          .upsert(
            { github: notes.github, email, kind: 'subscription_confirmed', ref_id: paymentId },
            { onConflict: 'github,kind,ref_id', ignoreDuplicates: true },
          )
          .select('github')
          .maybeSingle();
        if (logged) {
          const { subject, html } = subscriptionConfirmedEmail(notes.name || notes.github, newPeriodEnd);
          sendEmail(email, subject, html).catch(() => {});
        }
      }
    } else {
      // No usable notes — this payment might have already been
      // confirmed by the client-side /verify call, or notes weren't
      // passed. Either way, acknowledge so Razorpay doesn't retry.
      console.warn('[razorpay/webhook] payment.captured with no matching notes', { paymentId, notes });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[/api/razorpay/webhook]', err);
    return NextResponse.json({ error: err.message || 'Webhook processing failed' }, { status: 500 });
  }
}
