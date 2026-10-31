'use client';
// ════════════════════════════════════════════════════════════
// src/components/arena/ContestEntryButton.tsx
// Arena contest entry — FREE for confirmed subscribers, no
// payment collected. Non-subscribers are prompted to subscribe
// (₹39/month) rather than being asked to pay per contest, per
// Razorpay's restriction for unregistered businesses.
// ════════════════════════════════════════════════════════════

import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { PRICING_CONFIG, formatPriceWithPeriod } from '@/lib/pricing';
import type { User, Contest } from '@/types/database';

interface ContestEntryButtonProps {
  contest:              Contest;
  user:                 User;
  isSubscriber:         boolean;
  onSuccess:            () => void;
  onError:              (msg: string) => void;
  onNavigateSubscribe?: () => void;
}

export default function ContestEntryButton({
  contest, user, isSubscriber, onSuccess, onError, onNavigateSubscribe,
}: ContestEntryButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (loading) return;
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        onError('Please sign in again to continue.');
        return;
      }

      const res = await fetch('/api/contest/register', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ contestId: contest.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      onSuccess();
    } catch (e: any) {
      onError(e.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  if (!isSubscriber) {
    return (
      <div className="flex flex-col items-center gap-2.5 p-3.5 bg-zinc-900/50 rounded-xl border border-zinc-800/80">
        <p className="text-[11px] font-mono text-zinc-400 text-center leading-relaxed">
          Contest entry is <span className="text-emerald-400 font-semibold">free for subscribers</span> &mdash;
          subscribe monthly ({formatPriceWithPeriod(PRICING_CONFIG.defaultMonthlyFee)}) to unlock every contest, weekly problem, and AI feature.
        </p>
        <button
          onClick={onNavigateSubscribe}
          className="w-full py-2.5 bg-gradient-to-r from-cyan-400 to-cyan-500 text-zinc-950 font-mono font-bold text-xs rounded-lg active:scale-[0.98] shadow-[0_0_15px_rgba(0,229,255,0.25)] hover:opacity-90 transition-all"
        >
          Subscribe to Enter &rarr;
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleRegister}
      disabled={loading}
      className={`w-full py-2.5 font-mono font-bold text-xs rounded-lg transition-all active:scale-[0.98]
        ${loading
          ? 'bg-cyan-500/50 text-zinc-950/50 cursor-not-allowed'
          : 'bg-gradient-to-r from-cyan-400 to-cyan-500 text-zinc-950 hover:opacity-90 shadow-[0_0_20px_rgba(0,229,255,0.25)]'}`}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
          Registering…
        </span>
      ) : (
        'Register — Free →'
      )}
    </button>
  );
}
