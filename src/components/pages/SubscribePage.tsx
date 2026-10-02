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
      <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-zinc-400 text-xs font-mono">Loading…</span>
    </div>
  );

  // Active subscriber
  if (isActive) return (
    <div className="max-w-lg mx-auto py-12 text-center animate-fade-up">
      <div className="text-5xl mb-4">🎉</div>
      <h1 className="font-display font-semibold text-2xl text-zinc-100 mb-2">You're subscribed!</h1>
      <p className="text-zinc-400 font-sans text-sm mb-6">
        {expiryLabel ? `Active until ${expiryLabel}.` : "Monthly access active."} Renew before then to avoid losing access.
      </p>
      <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl px-5 py-4 text-left space-y-2 mb-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-cyan-400">✓</span>
          <span className="text-zinc-300">All weekly challenge problems unlocked</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-cyan-400">✓</span>
          <span className="text-zinc-300">Every future weekly challenge included</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-cyan-400">✓</span>
          <span className="text-zinc-300">Free entry to every Arena contest</span>
        </div>
      </div>
      {process.env.NEXT_PUBLIC_PAYMENTS_LIVE === "true" && (
        <button
          onClick={handlePay}
          disabled={paying || fee === null}
          className="px-5 py-2.5 bg-cyan-400 text-zinc-950 font-mono font-bold text-sm rounded-xl
            hover:bg-cyan-300 active:scale-[0.98] transition-all disabled:opacity-40 shadow-[0_0_20px_rgba(0,229,255,0.25)]"
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
      <h1 className="font-display font-semibold text-2xl text-zinc-100 mb-2">Sign in to subscribe</h1>
      <p className="text-zinc-400 font-mono text-sm">
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
        <h1 className="font-display font-semibold text-2xl md:text-3xl text-zinc-100 mb-2">
          {isLapsed ? "Renew Your Access" : "Monthly Access"}
        </h1>
        <p className="text-zinc-400 font-sans text-sm">
          {isLapsed && expiryLabel
            ? `Your access ended on ${expiryLabel}. Renew to continue.`
            : "₹39/month · Unlock all weekly problems, Arena contests & AI features"}
        </p>
      </div>

      {/* What you get */}
      <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-5 mb-6 space-y-3 shadow-sm">
        <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-3">What's included</p>
        {[
          ["✓", "All current and future weekly challenge problems"],
          ["✓", "Free entry to every Arena contest"],
          ["✓", "Early-solver time bonus (solve earlier = more points)"],
          ["✓", "Weekly leaderboard participation"],
        ].map(([icon, text], i) => (
          <div key={i} className="flex items-start gap-3 text-xs font-mono">
            <span className="text-cyan-400 shrink-0 mt-0.5">{icon}</span>
            <span className="text-zinc-300">{text}</span>
          </div>
        ))}
      </div>

      {/* Payment card */}
      <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm">
        {/* Price */}
        <div className="px-5 py-4 border-b border-zinc-800/80 text-center">
          <div className="text-4xl font-display font-bold text-cyan-400 mb-1">
            {fee !== null ? `₹${fee}` : "—"}
          </div>
          <div className="text-xs font-mono text-zinc-400">per month · 30 days of access</div>
        </div>

        <div className="px-5 py-5">
          {err && (
            <p className="text-xs text-rose-400 font-mono mb-3 text-center">{err}</p>
          )}

          {process.env.NEXT_PUBLIC_PAYMENTS_LIVE === "true" ? (
            <>
              <button
                onClick={handlePay}
                disabled={paying || fee === null}
                className="w-full py-2.5 bg-cyan-400 text-zinc-950 font-mono font-bold text-sm rounded-xl
                  hover:bg-cyan-300 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(0,229,255,0.25)]"
              >
                {paying ? "Processing…" : isLapsed ? `Renew — ₹${fee ?? "—"} →` : `Pay ₹${fee ?? "—"} →`}
              </button>
              <p className="text-center text-[11px] text-zinc-500 font-mono mt-4">
                Secured by Razorpay · Cards, UPI, Netbanking, Wallets · Access unlocks instantly ·
                Renews manually every 30 days — no auto-debit, ever
              </p>
            </>
          ) : (
            <div className="text-center py-2">
              <div className="w-full py-2.5 bg-zinc-800 text-zinc-500 font-mono font-semibold text-sm rounded-xl cursor-not-allowed">
                We'll be back soon
              </div>
              <p className="text-xs text-zinc-500 font-mono mt-3">
                Payments are temporarily unavailable while we finish setting things up. Check back shortly.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
