'use client';
// ════════════════════════════════════════════════════════════
// src/components/arena/ContestEntryButton.tsx
// Arena contest entry — FREE for confirmed subscribers, no
// payment collected. Non-subscribers are prompted to subscribe
// (a one-time lifetime fee) rather than being asked to pay per
// contest, per Razorpay's restriction for unregistered businesses.
// ════════════════════════════════════════════════════════════

import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
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
      <div className="flex flex-col items-center gap-2 p-3 bg-[#0f0f0f] rounded-xl border border-[#1f1f1f]">
        <p className="text-[11px] font-mono text-[#888] text-center leading-relaxed">
          Contest entry is <span className="text-[#00e87a] font-bold">free for subscribers</span> —
          subscribe once (lifetime) to unlock every contest, weekly problem, and AI feature.
        </p>
        <button
          onClick={onNavigateSubscribe}
          className="w-full py-2.5 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-lg
            hover:bg-[#00ff88] active:scale-[0.98] transition-all"
        >
          Subscribe to Enter →
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleRegister}
      disabled={loading}
      className={`w-full py-2.5 font-mono font-bold text-sm rounded-lg transition-all active:scale-[0.98]
        ${loading
          ? 'bg-[#00e87a40] text-[#00e87a60] cursor-not-allowed'
          : 'bg-[#00e87a] text-black hover:bg-[#00ff88]'}`}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
          Registering…
        </span>
      ) : (
        'Register — Free →'
      )}
    </button>
  );
}