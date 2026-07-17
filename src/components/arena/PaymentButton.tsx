'use client';
// ════════════════════════════════════════════════════════════
// src/components/arena/PaymentButton.tsx
// UPDATED: pays via Razorpay Checkout instead of manual UPI +
// admin review. Access is confirmed instantly after a verified
// payment.
// ════════════════════════════════════════════════════════════

import { useState } from 'react';
import type { User, Contest } from '@/types/database';
import { payWithRazorpay } from '@/lib/razorpay';

interface PaymentButtonProps {
  contest:   Contest;
  user:      User;
  onSuccess: (txnId: string) => void;
  onError:   (msg: string)   => void;
}

export default function PaymentButton({ contest, user, onSuccess, onError }: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);
  const [paymentId, setPaymentId] = useState('');

  async function handlePay() {
    if (loading) return;
    setLoading(true);

    payWithRazorpay({
      purpose: 'contest',
      contestId: contest.id,
      contestName: contest.name,
      name: 'BitByBit Arena',
      description: `Entry: ${contest.name}`,
      prefillName: user.name,
      onSuccess: (paymentId) => {
        setPaymentId(paymentId);
        setDone(true);
        onSuccess(paymentId);
        setLoading(false);
      },
      onFailure: (msg) => {
        onError(msg);
        setLoading(false);
      },
    });
  }

  if (done) {
    return (
      <div className="w-full p-4 bg-[#00e87a10] border border-[#00e87a40] rounded-xl text-center">
        <div className="text-2xl mb-2">✓</div>
        <p className="text-xs font-mono text-[#00e87a] font-bold mb-1">Payment Confirmed</p>
        <p className="text-[10px] font-mono text-[#888]">Payment ID: {paymentId}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 p-4 bg-[#0f0f0f] rounded-xl border border-[#1f1f1f]">
      <div className="text-center">
        <p className="text-xs font-mono text-[#666] mb-1">Entry Fee</p>
        <p className="font-mono font-bold text-[#e0e0e0] text-2xl">₹{contest.entry_fee}</p>
      </div>

      {process.env.NEXT_PUBLIC_PAYMENTS_LIVE === 'true' ? (
        <>
          <button
            onClick={handlePay}
            disabled={loading}
            className={`w-full py-2.5 font-mono font-bold text-sm rounded-lg transition-all active:scale-[0.98]
              ${loading
                ? 'bg-[#00e87a40] text-[#00e87a60] cursor-not-allowed'
                : 'bg-[#00e87a] text-black hover:bg-[#00ff88]'}`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Processing…
              </span>
            ) : (
              `Pay ₹${contest.entry_fee} →`
            )}
          </button>
          <p className="text-[10px] font-mono text-[#444] text-center">
            Secured by Razorpay · Cards, UPI, Netbanking, Wallets
          </p>
        </>
      ) : (
        <div className="w-full text-center">
          <div className="w-full py-2.5 bg-[#1a1a1a] text-[#666] font-mono font-bold text-sm rounded-lg cursor-not-allowed">
            We'll be back soon
          </div>
          <p className="text-[10px] font-mono text-[#555] mt-2">
            Registration is temporarily unavailable. Check back shortly.
          </p>
        </div>
      )}
    </div>
  );
}