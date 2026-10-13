// ════════════════════════════════════════════════════════════
// src/app/api/unsubscribe/route.ts
// POST & GET /api/unsubscribe
//
// Compliant API endpoint for handling email opt-out requests,
// supporting RFC 8058 one-click unsubscribe, programmatic API calls,
// and frontend requests.
// ════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import {
  unsubscribeEmailAction,
  resubscribeEmailAction,
  checkEmailSubscriptionStatusAction,
} from '@/app/actions/unsubscribe';

export async function POST(req: NextRequest) {
  try {
    let email = '';
    let reason = 'User requested via unsubscribe API';
    let action = 'unsubscribe';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      email = body.email || '';
      if (body.reason) reason = body.reason;
      if (body.action) action = body.action;
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData().catch(() => null);
      if (formData) {
        email = (formData.get('email') as string) || '';
        reason = (formData.get('reason') as string) || reason;
        action = (formData.get('action') as string) || action;
      }
    } else {
      // Fallback query param
      const { searchParams } = new URL(req.url);
      email = searchParams.get('email') || '';
      if (searchParams.get('reason')) reason = searchParams.get('reason')!;
      if (searchParams.get('action')) action = searchParams.get('action')!;
    }

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email parameter is required.' },
        { status: 400 }
      );
    }

    if (action === 'resubscribe') {
      const result = await resubscribeEmailAction(email);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        email: result.email,
        email_subscribed: true,
        message: result.message,
      });
    }

    const result = await unsubscribeEmailAction(email, reason);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      email: result.email,
      email_subscribed: false,
      message: result.message,
    });
  } catch (err: any) {
    console.error('[/api/unsubscribe POST] Error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to process unsubscribe request.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email parameter is required.' },
        { status: 400 }
      );
    }

    const result = await checkEmailSubscriptionStatusAction(email);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      email: result.email,
      email_subscribed: result.isSubscribed,
    });
  } catch (err: any) {
    console.error('[/api/unsubscribe GET] Error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to check status.' },
      { status: 500 }
    );
  }
}
