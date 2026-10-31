// ════════════════════════════════════════════════════════════
// src/app/api/razorpay/create-order/route.ts
// POST /api/razorpay/create-order
//
// SECURITY: amount is ALWAYS resolved server-side from the DB
// (app_config / contests) — the client's amount is never trusted,
// preventing anyone from paying ₹1 for a ₹500 subscription by
// editing the request in dev tools.
//
// SECURITY: the paying user's identity is derived from a verified
// Supabase Auth access token (Authorization: Bearer <token>) sent
// by the client — never from a client-supplied "github" field,
// which could otherwise be forged.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Razorpay from 'razorpay';
import { PRICING_CONFIG } from '@/lib/pricing';

interface Body {
  purpose: 'subscription';
  couponCode?: string;
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

  return { github, name: name || github, email: email || '' };
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
    const { purpose, couponCode } = body;

    if (purpose !== 'subscription') {
      return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 });
    }

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    let baseAmount: number = PRICING_CONFIG.defaultMonthlyFee;
    const notes: Record<string, string> = { type: purpose, github, name, email };

    // eslint-disable-next-line
    const { data: config } = await (db.from('app_config') as any)
      .select('*')
      .eq('key', 'subscription_fee')
      .maybeSingle();

    if (config?.value && !isNaN(Number(config.value))) {
      baseAmount = Number(config.value);
    }

    let finalAmount = baseAmount;

    // Handle coupon verification securely server-side if couponCode provided
    if (couponCode) {
      const cleanCode = couponCode.trim().toUpperCase();
      // eslint-disable-next-line
      const { data: coupon, error: couponErr } = await (db.from('coupons') as any)
        .select('*')
        .eq('code', cleanCode)
        .maybeSingle();

      if (couponErr || !coupon) {
        return NextResponse.json({ error: `Coupon code "${cleanCode}" is invalid` }, { status: 400 });
      }

      if (!coupon.is_active) {
        return NextResponse.json({ error: `Coupon code "${cleanCode}" is inactive or expired` }, { status: 400 });
      }

      const discountVal = Number(coupon.discount_value) || 0;
      let discountAmt = 0;
      if (coupon.discount_type === 'percentage') {
        discountAmt = Math.round(((baseAmount * discountVal) / 100) * 100) / 100;
      } else {
        discountAmt = Math.min(baseAmount, discountVal);
      }

      finalAmount = Math.max(1, Math.round((baseAmount - discountAmt) * 100) / 100);
      notes.coupon_code = coupon.code;
      notes.discount_applied = String(discountAmt);
    }

    if (!finalAmount || finalAmount <= 0) {
      return NextResponse.json({ error: 'Invalid amount configured' }, { status: 500 });
    }

    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount:   Math.round(finalAmount * 100), // paise / cents
      currency: PRICING_CONFIG.currencyCode,
      notes,
      receipt: `${purpose}_${github}_${Date.now()}`.slice(0, 40),
    });

    return NextResponse.json({
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    process.env.RAZORPAY_KEY_ID,
      finalAmount,
    });
  } catch (err: any) {
    console.error('[/api/razorpay/create-order]', err);
    return NextResponse.json({ error: err.message || 'Order creation failed' }, { status: 500 });
  }
}
