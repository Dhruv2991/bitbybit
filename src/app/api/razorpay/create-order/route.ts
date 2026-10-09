// ════════════════════════════════════════════════════════════
// src/app/api/razorpay/create-order/route.ts
// POST /api/razorpay/create-order
//
// SECURITY: amount is ALWAYS resolved server-side from PostgreSQL
// (app_config / coupons) — the client's amount is never trusted.
//
// SECURITY: the paying user's identity is derived from our verified
// session (cookie or Bearer token) via getCurrentUser().
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';

interface Body {
  purpose: 'subscription';
  couponCode?: string;
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
    const { purpose, couponCode } = body;

    if (purpose !== 'subscription') {
      return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 });
    }

    let baseAmount: number = 199;
    const notes: Record<string, string> = {
      type: purpose,
      userId,
      github: githubUsername,
      name: name || githubUsername,
      email: email || '',
    };

    // Fetch subscription fee from app_config in PostgreSQL
    const config = await prisma.appConfig.findUnique({
      where: { key: 'subscription_fee' },
    });

    if (config?.value && !isNaN(Number(config.value))) {
      baseAmount = Number(config.value);
    }

    let finalAmount = baseAmount;

    // Handle coupon verification securely server-side if couponCode provided
    if (couponCode) {
      const cleanCode = couponCode.trim().toUpperCase();
      const coupon = await prisma.coupon.findUnique({
        where: { code: cleanCode },
      });

      if (!coupon) {
        return NextResponse.json({ error: `Coupon code "${cleanCode}" is invalid` }, { status: 400 });
      }

      if (!coupon.isActive) {
        return NextResponse.json({ error: `Coupon code "${cleanCode}" is inactive or expired` }, { status: 400 });
      }

      const discountVal = Number(coupon.discountValue) || 0;
      let discountAmt = 0;
      if (coupon.discountType === 'PERCENTAGE') {
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
      currency: 'INR',
      notes,
      receipt: `${purpose}_${githubUsername}_${Date.now()}`.slice(0, 40),
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
