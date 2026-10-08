// ════════════════════════════════════════════════════════════
// src/lib/razorpay.ts
// Client-side helper: loads Razorpay Checkout script, creates an
// order via our API, opens the payment popup, and verifies the
// result server-side.
//
// SECURITY: this file does NOT send a client-chosen amount to the
// server, and does NOT send the github username as the source of
// truth — the server always resolves both from a verified Supabase
// Auth session token attached to every request.
// ════════════════════════════════════════════════════════════

import { getSupabaseClient } from './supabase';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) return resolve(true);
    if (document.getElementById('razorpay-checkout-script')) {
      const check = setInterval(() => {
        if (window.Razorpay) {
          clearInterval(check);
          resolve(true);
        }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(!!window.Razorpay); }, 5000);
      return;
    }
    const script = document.createElement('script');
    script.id = 'razorpay-checkout-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

async function getAuthToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

interface PayOptions {
  purpose:      'subscription';
  name:         string;        // Razorpay checkout display name, e.g. "BitByBit"
  description:  string;        // Razorpay checkout description
  prefillName?: string;
  couponCode?:  string;        // Optional promo/coupon code to apply discount server-side
  onSuccess: (paymentId: string, currentPeriodEnd?: string) => void;
  onFailure: (msg: string) => void;
}

export async function payWithRazorpay(opts: PayOptions) {
  const token = await getAuthToken();
  if (!token) {
    opts.onFailure('Please sign in again to continue.');
    return;
  }

  const scriptOk = await loadRazorpayScript();
  if (!scriptOk) {
    opts.onFailure('Failed to load Razorpay checkout. Check your connection and try again.');
    return;
  }

  let order: any;
  try {
    const orderRes = await fetch('/api/razorpay/create-order', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        purpose: opts.purpose,
        couponCode: opts.couponCode ? opts.couponCode.trim().toUpperCase() : undefined,
      }),
    });
    order = await orderRes.json();
    if (!orderRes.ok) throw new Error(order.error || 'Order creation failed');
  } catch (e: any) {
    opts.onFailure(e.message || 'Could not start payment');
    return;
  }

  const rzp = new window.Razorpay({
    key:      order.keyId,
    amount:   order.amount,
    currency: order.currency,
    name:     opts.name,
    description: opts.description,
    order_id: order.orderId,
    prefill:  opts.prefillName ? { name: opts.prefillName } : undefined,
    theme:    { color: '#00e87a' },
    handler: async (response: any) => {
      try {
        const verifyRes = await fetch('/api/razorpay/verify', {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            razorpay_order_id:   response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature:  response.razorpay_signature,
            purpose:      opts.purpose,
          }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(verifyData.error || 'Payment verification failed');
        opts.onSuccess(response.razorpay_payment_id, verifyData.currentPeriodEnd);
      } catch (e: any) {
        opts.onFailure(
          e.message ||
          `Payment succeeded but verification failed. Contact support with payment ID: ${response.razorpay_payment_id}`
        );
      }
    },
    modal: {
      ondismiss: () => opts.onFailure('Payment cancelled'),
    },
  });

  rzp.on('payment.failed', (resp: any) => {
    opts.onFailure(resp?.error?.description || 'Payment failed');
  });

  rzp.open();
}
