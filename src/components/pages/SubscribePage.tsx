"use client";
/**
 * SubscribePage
 *
 * Monthly access pass — ₹39/month.
 * - Reads fee from app_config table (admin-adjustable)
 * - User pays via Razorpay Checkout
 * - Payment is verified server-side and access is CONFIRMED instantly
 *   for 30 days from payment (or from the current period's end, if
 *   renewing early — extra days are never wasted)
 * - This is a manually-renewed pass, NOT auto-debit: there is no
 *   recurring mandate, so nothing is ever charged without the user
 *   actively clicking pay again each month.
 */

import { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { payWithRazorpay } from "@/lib/razorpay";
import { isActiveSubscription } from "@/lib/subscription";
import type { User, Subscriber } from "@/types/database";

interface Props {
  user: User | null;
}

export default function SubscribePage({ user }: Props) {
  const db = getSupabaseClient();

  const [fee,        setFee]        = useState<number | null>(null);
  const [myStatus,   setMyStatus]   = useState<Subscriber | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [paying,     setPaying]     = useState(false);
  const [err,        setErr]        = useState("");

  useEffect(() => { load(); }, [user]);

  async function load() {
    setLoading(true);
    try {
      // Load fee from app_config
      const { data: configs } = await (db.from("app_config") as any)
        .select("*")
        .eq("key", "subscription_fee");

      for (const c of configs || []) {
        if (c.key === "subscription_fee") setFee(Number(c.value));
      }

      // Load user's subscription status
      if (user?.github) {
        const { data: sub } = await (db.from("subscribers") as any)
          .select("*")
          .eq("github", user.github)
          .maybeSingle();
        setMyStatus(sub || null);
      }
    } catch {}
    setLoading(false);
  }

  function handlePay() {
    if (!user || fee === null || paying) return;
    setErr("");
    setPaying(true);

    payWithRazorpay({
      purpose: "subscription",
      name: "BitByBit",
      description: "Monthly Access — 30 days",
      prefillName: user.name,
      onSuccess: (paymentId, currentPeriodEnd) => {
        setMyStatus({
          id: myStatus?.id || "",
          github: user.github,
          name: user.name,
          txn_id: paymentId,
          status: "confirmed",
          current_period_end: currentPeriodEnd || myStatus?.current_period_end || null,
          created_at: myStatus?.created_at || new Date().toISOString(),
        });
        setPaying(false);
      },
      onFailure: (msg) => {
        setErr(msg);
        setPaying(false);
      },
    });
  }

  const isActive = isActiveSubscription(myStatus?.status, myStatus?.current_period_end);
  const expiryLabel = myStatus?.current_period_end
    ? new Date(myStatus.current_period_end).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

  // ── What to show based on status ─────────────────────────

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="spinner" />
      <span className="text-[#bbb] text-xs font-mono">Loading…</span>
    </div>
  );

  // Active subscriber
  if (isActive) return (
    <div className="max-w-lg mx-auto py-12 text-center animate-fade-up">
      <div className="text-5xl mb-4">🎉</div>
      <h1 className="font-display font-bold text-2xl text-[#e0e0e0] mb-2">You're subscribed!</h1>
      <p className="text-[#777] font-mono text-sm mb-6">
        {expiryLabel ? `Active until ${expiryLabel}.` : "Monthly access active."} Renew before then to avoid losing access.
      </p>
      <div className="bg-[#00e87a08] border border-[#00e87a20] rounded-2xl px-5 py-4 text-left space-y-2 mb-6">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-[#00e87a]">✓</span>
          <span className="text-[#bbb]">All weekly challenge problems unlocked</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-[#00e87a]">✓</span>
          <span className="text-[#bbb]">Every future weekly challenge included</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-[#00e87a]">✓</span>
          <span className="text-[#bbb]">Free entry to every Arena contest</span>
        </div>
      </div>
      {process.env.NEXT_PUBLIC_PAYMENTS_LIVE === "true" && (
        <button
          onClick={handlePay}
          disabled={paying || fee === null}
          className="px-5 py-2.5 bg-[#00e87a10] border border-[#00e87a30] text-[#00e87a] font-mono font-bold text-sm rounded-xl
            hover:bg-[#00e87a18] active:scale-[0.98] transition-all disabled:opacity-40"
        >
          {paying ? "Processing…" : `Renew early — ₹${fee ?? "—"}`}
        </button>
      )}
    </div>
  );

  // Not signed in
  if (!user) return (
    <div className="max-w-lg mx-auto py-12 text-center animate-fade-up">
      <div className="text-5xl mb-4">🔒</div>
      <h1 className="font-display font-bold text-2xl text-[#e0e0e0] mb-2">Sign in to subscribe</h1>
      <p className="text-[#777] font-mono text-sm">
        Please sign in with GitHub to get monthly access.
      </p>
    </div>
  );

  // Lapsed subscriber (paid before, period ended) vs brand-new subscriber
  const isLapsed = myStatus?.status === "confirmed" && !isActive;

  // Main payment page
  return (
    <div className="max-w-lg mx-auto animate-fade-up">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="text-4xl mb-3">⭐</div>
        <h1 className="font-display font-bold text-2xl md:text-3xl text-[#e0e0e0] mb-2">
          {isLapsed ? "Renew Your Access" : "Monthly Access"}
        </h1>
        <p className="text-[#777] font-mono text-sm">
          {isLapsed && expiryLabel
            ? `Your access ended on ${expiryLabel}. Renew to continue.`
            : "₹39/month · Unlock all weekly problems, Arena contests & AI features"}
        </p>
      </div>

      {/* What you get */}
      <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-5 mb-6 space-y-3">
        <p className="text-[10px] text-[#666] font-mono uppercase tracking-widest mb-3">What's included</p>
        {[
          ["✓", "All current and future weekly challenge problems", "#00e87a"],
          ["✓", "Free entry to every Arena contest", "#00e87a"],
          ["✓", "Early-solver time bonus (solve earlier = more points)", "#00e87a"],
          ["✓", "Weekly leaderboard participation", "#00e87a"],
        ].map(([icon, text, color], i) => (
          <div key={i} className="flex items-start gap-3 text-xs font-mono">
            <span style={{ color }} className="shrink-0 mt-0.5">{icon}</span>
            <span className="text-[#bbb]">{text}</span>
          </div>
        ))}
      </div>

      {/* Payment card */}
      <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl overflow-hidden">
        {/* Price */}
        <div className="px-5 py-4 border-b border-[#161616] text-center">
          <div className="text-4xl font-display font-bold text-[#00e87a] mb-1">
            {fee !== null ? `₹${fee}` : "—"}
          </div>
          <div className="text-[10px] font-mono text-[#555]">per month · 30 days of access</div>
        </div>

        <div className="px-5 py-5">
          {err && (
            <p className="text-[10px] text-[#ff4d4d] font-mono mb-3 text-center">{err}</p>
          )}

          {process.env.NEXT_PUBLIC_PAYMENTS_LIVE === "true" ? (
            <>
              <button
                onClick={handlePay}
                disabled={paying || fee === null}
                className="w-full py-3 bg-[#00e87a] text-black font-mono font-bold text-sm rounded-xl
                  hover:bg-[#00ff88] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {paying ? "Processing…" : isLapsed ? `Renew — ₹${fee ?? "—"} →` : `Pay ₹${fee ?? "—"} →`}
              </button>
              <p className="text-center text-[10px] text-[#444] font-mono mt-4">
                Secured by Razorpay · Cards, UPI, Netbanking, Wallets · Access unlocks instantly ·
                Renews manually every 30 days — no auto-debit, ever
              </p>
            </>
          ) : (
            <div className="text-center py-2">
              <div className="w-full py-3 bg-[#1a1a1a] text-[#666] font-mono font-bold text-sm rounded-xl cursor-not-allowed">
                We'll be back soon
              </div>
              <p className="text-[10px] text-[#555] font-mono mt-3">
                Payments are temporarily unavailable while we finish setting things up. Check back shortly.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
