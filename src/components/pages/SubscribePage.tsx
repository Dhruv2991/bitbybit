"use client";
/**
 * SubscribePage
 *
 * Monthly access pass — Base Price $199/month (or configured fee),
 * with interactive coupon / promo code support reducing price (e.g. to $39/month).
 * - Reads fee from app_config or defaults to $199
 * - Validates coupons securely server-side against Supabase `coupons` table
 * - User pays via Razorpay Checkout with pricing override applied
 * - Payment is verified server-side and access is CONFIRMED instantly
 *   for 30 days from payment
 */

import { useState, useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { payWithRazorpay } from "@/lib/razorpay";
import { isActiveSubscription } from "@/lib/subscription";
import { validateCouponAction } from "@/app/actions/coupons";
import type { User, Subscriber } from "@/types/database";
import type { CouponValidationResponse } from "@/types/coupons";

interface Props {
  user: User | null;
}

export default function SubscribePage({ user }: Props) {
  const db = getSupabaseClient();

  // Base price defaults to $199
  const [basePrice, setBasePrice] = useState<number>(199);
  const [myStatus, setMyStatus] = useState<Subscriber | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState("");

  // Promo code / Coupon states
  const [couponInput, setCouponInput] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidationResponse | null>(null);

  useEffect(() => {
    load();
  }, [user]);

  async function load() {
    setLoading(true);
    try {
      // Load fee from app_config or fallback to 199
      const { data: configs } = await (db.from("app_config") as any)
        .select("*")
        .eq("key", "subscription_fee");

      for (const c of configs || []) {
        if (c.key === "subscription_fee" && c.value && !isNaN(Number(c.value))) {
          setBasePrice(Number(c.value));
        }
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

  // Handle promo code application
  async function handleApplyCoupon(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setCouponError("");

    const code = couponInput.trim().toUpperCase();
    if (!code) {
      setCouponError("Please enter a promo code.");
      return;
    }

    setValidatingCoupon(true);
    try {
      const res = await validateCouponAction(code, basePrice);
      if (res.valid && res.coupon) {
        setAppliedCoupon(res);
        setCouponError("");
      } else {
        setCouponError(res.error || "Invalid or inactive promo code.");
        setAppliedCoupon(null);
      }
    } catch (error: any) {
      setCouponError(error.message || "Failed to validate promo code.");
      setAppliedCoupon(null);
    } finally {
      setValidatingCoupon(false);
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponError("");
  }

  // Calculate effective final price
  const finalPrice = appliedCoupon?.finalPrice ?? basePrice;
  const discountAmount = appliedCoupon?.discountAmount ?? 0;

  function handlePay() {
    if (!user || finalPrice === null || paying) return;
    setErr("");
    setPaying(true);

    payWithRazorpay({
      purpose: "subscription",
      name: "BitByBit",
      description: `Monthly Access — 30 days${appliedCoupon?.coupon ? ` (${appliedCoupon.coupon.code})` : ""}`,
      prefillName: user.name,
      couponCode: appliedCoupon?.coupon?.code,
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
    ? new Date(myStatus.current_period_end).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  // ── What to show based on status ─────────────────────────

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-slate-500 dark:text-zinc-400 text-xs font-mono">Loading…</span>
      </div>
    );

  // Active subscriber
  if (isActive)
    return (
      <div className="max-w-lg mx-auto py-12 text-center animate-fade-up">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="font-display font-semibold text-2xl text-slate-900 dark:text-zinc-100 mb-2">
          You're subscribed!
        </h1>
        <p className="text-slate-600 dark:text-zinc-400 font-sans text-sm mb-6">
          {expiryLabel
            ? `Active until ${expiryLabel}.`
            : "Monthly access active."}{" "}
          Renew before then to avoid losing access.
        </p>
        <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl px-5 py-4 text-left space-y-2 mb-6 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-cyan-600 dark:text-cyan-400 font-bold">✓</span>
            <span className="text-slate-700 dark:text-zinc-300">
              All weekly challenge problems unlocked
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-cyan-600 dark:text-cyan-400 font-bold">✓</span>
            <span className="text-slate-700 dark:text-zinc-300">
              Every future weekly challenge included
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-cyan-600 dark:text-cyan-400 font-bold">✓</span>
            <span className="text-slate-700 dark:text-zinc-300">
              Free entry to every Arena contest
            </span>
          </div>
        </div>
        {process.env.NEXT_PUBLIC_PAYMENTS_LIVE === "true" && (
          <button
            onClick={handlePay}
            disabled={paying}
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white dark:from-cyan-400 dark:to-cyan-500 dark:text-zinc-950 font-mono font-bold text-sm rounded-xl
            active:scale-[0.98] transition-all disabled:opacity-40 shadow-xs"
          >
            {paying ? "Processing…" : `Renew early — $${basePrice}`}
          </button>
        )}
      </div>
    );

  // Not signed in
  if (!user)
    return (
      <div className="max-w-lg mx-auto py-12 text-center animate-fade-up">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="font-display font-semibold text-2xl text-slate-900 dark:text-zinc-100 mb-2">
          Sign in to subscribe
        </h1>
        <p className="text-slate-600 dark:text-zinc-400 font-mono text-sm">
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
        <h1 className="font-display font-semibold text-2xl md:text-3xl text-slate-900 dark:text-zinc-100 mb-2">
          {isLapsed ? "Renew Your Access" : "Monthly Access Pass"}
        </h1>
        <p className="text-slate-600 dark:text-zinc-400 font-sans text-sm">
          {isLapsed && expiryLabel
            ? `Your access ended on ${expiryLabel}. Renew to continue.`
            : "Unlock all weekly problems, Arena contests, and AI features"}
        </p>
      </div>

      {/* What you get */}
      <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-5 mb-6 space-y-3 shadow-xs">
        <p className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono uppercase tracking-widest mb-3">
          What's included
        </p>
        {[
          ["✓", "All current and future weekly challenge problems"],
          ["✓", "Free entry to every Arena contest"],
          ["✓", "Early-solver time bonus (solve earlier = more points)"],
          ["✓", "Weekly leaderboard participation & certificate generation"],
        ].map(([icon, text], i) => (
          <div key={i} className="flex items-start gap-3 text-xs font-mono">
            <span className="text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5 font-bold">{icon}</span>
            <span className="text-slate-700 dark:text-zinc-300">{text}</span>
          </div>
        ))}
      </div>

      {/* Payment Card & Checkout */}
      <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs">
        {/* Dynamic Pricing Header */}
        <div className="px-5 py-5 border-b border-slate-200 dark:border-zinc-800/80 text-center relative bg-slate-50/70 dark:bg-zinc-900/40">
          {appliedCoupon ? (
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono font-bold uppercase tracking-wider mb-1">
                <span>🏷 Promo Applied</span>
                <span>•</span>
                <span>Save ${discountAmount}</span>
              </div>
              <div className="flex items-center justify-center gap-3">
                <span className="text-2xl font-display font-semibold text-slate-400 dark:text-zinc-500 line-through">
                  ${basePrice}
                </span>
                <span className="text-4xl md:text-5xl font-display font-bold text-cyan-600 dark:text-cyan-400 tracking-tight">
                  ${finalPrice}
                </span>
              </div>
              <div className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                per month · 30 days of full access
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-4xl md:text-5xl font-display font-bold text-cyan-600 dark:text-cyan-400 mb-1">
                ${basePrice}
              </div>
              <div className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                per month · 30 days of full access
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Promo Code Input Box */}
          <div className="bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800/80 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="coupon-input"
                className="text-xs font-mono text-slate-800 dark:text-zinc-300 font-medium flex items-center gap-1.5"
              >
                <span>🏷</span>
                <span>Have a Promo Code?</span>
              </label>
              {appliedCoupon && (
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {appliedCoupon.coupon?.code} applied
                </span>
              )}
            </div>

            {!appliedCoupon ? (
              <form
                onSubmit={handleApplyCoupon}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <input
                    id="coupon-input"
                    type="text"
                    value={couponInput}
                    onChange={(e) => {
                      setCouponInput(e.target.value.toUpperCase());
                      setCouponError("");
                    }}
                    placeholder="Enter code (e.g. SAVE160)"
                    disabled={validatingCoupon}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700/70 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-zinc-100 uppercase placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={validatingCoupon || !couponInput.trim()}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-slate-800 dark:border-zinc-700 text-white dark:text-zinc-200 font-mono text-xs font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
                >
                  {validatingCoupon ? (
                    <>
                      <div className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                      <span>Checking…</span>
                    </>
                  ) : (
                    <span>Apply</span>
                  )}
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2.5 text-xs font-mono">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                  <span>✓</span>
                  <span>
                    Code{" "}
                    <strong className="text-emerald-800 dark:text-emerald-200">
                      {appliedCoupon.coupon?.code}
                    </strong>{" "}
                    applied (-${discountAmount} off)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className="text-xs text-slate-500 hover:text-rose-500 dark:text-zinc-400 dark:hover:text-rose-400 transition-colors px-2 py-0.5 rounded hover:bg-rose-500/10"
                >
                  Remove
                </button>
              </div>
            )}

            {couponError && (
              <p className="text-[11px] text-rose-500 dark:text-rose-400 font-mono mt-1">
                ✕ {couponError}
              </p>
            )}
          </div>

          {/* Pricing Breakdown if Coupon Applied */}
          {appliedCoupon && (
            <div className="bg-slate-50 dark:bg-zinc-950/40 border border-slate-200 dark:border-zinc-800/60 rounded-xl p-3 space-y-1.5 text-xs font-mono">
              <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
                <span>Base Price:</span>
                <span>${basePrice}.00</span>
              </div>
              <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                <span>
                  Promo Discount ({appliedCoupon.coupon?.code}):
                </span>
                <span>-${discountAmount}.00</span>
              </div>
              <div className="border-t border-slate-200 dark:border-zinc-800 pt-1.5 flex items-center justify-between text-slate-900 dark:text-zinc-200 font-bold">
                <span>Total Due Now:</span>
                <span className="text-cyan-600 dark:text-cyan-400">${finalPrice}.00</span>
              </div>
            </div>
          )}

          {/* Error notice */}
          {err && (
            <p className="text-xs text-rose-500 dark:text-rose-400 font-mono text-center">
              {err}
            </p>
          )}

          {/* Payment CTA */}
          {process.env.NEXT_PUBLIC_PAYMENTS_LIVE === "true" ? (
            <>
              <button
                onClick={handlePay}
                disabled={paying}
                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white dark:from-cyan-400 dark:to-cyan-500 dark:text-zinc-950 font-mono font-bold text-sm rounded-xl
                  active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-2"
              >
                {paying ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white dark:border-zinc-950 border-t-transparent rounded-full animate-spin" />
                    <span>Opening Checkout…</span>
                  </>
                ) : isLapsed ? (
                  `Renew Access — $${finalPrice} →`
                ) : (
                  `Complete Checkout — $${finalPrice} →`
                )}
              </button>
              <p className="text-center text-[11px] text-slate-500 dark:text-zinc-500 font-mono mt-2">
                Secured by Razorpay · Cards, UPI, Netbanking, Wallets · Access unlocks instantly ·
                Renews manually every 30 days — no auto-debit
              </p>
            </>
          ) : (
            <div className="text-center py-2">
              <div className="w-full py-2.5 bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-zinc-500 font-mono font-semibold text-sm rounded-xl cursor-not-allowed">
                We'll be back soon
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-500 font-mono mt-3">
                Payments are temporarily unavailable while we finish setting things up. Check back shortly.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
