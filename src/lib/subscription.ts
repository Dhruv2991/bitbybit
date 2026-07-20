// ════════════════════════════════════════════════════════════
// src/lib/subscription.ts
// Shared helpers for the monthly (₹39/mo) subscription model.
//
// This is a manually-renewed monthly pass, NOT an auto-debit
// recurring mandate — Razorpay Checkout only creates one-time
// orders here. Each successful payment extends `current_period_end`
// by 30 days. There is no silent auto-charge; the user pays again
// each month to keep access, and can renew early (which stacks the
// extra days on top of their current period instead of wasting them).
// ════════════════════════════════════════════════════════════

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function computeNewPeriodEnd(
  currentStatus: string | null | undefined,
  currentPeriodEnd: string | null | undefined,
): string {
  const now = Date.now();
  const existingEnd =
    currentStatus === "confirmed" && currentPeriodEnd
      ? new Date(currentPeriodEnd).getTime()
      : NaN;

  // If they still have time left, renewing early stacks on top of it.
  // Otherwise (new subscriber or lapsed subscriber), the new period
  // starts from now.
  const base = !Number.isNaN(existingEnd) && existingEnd > now ? existingEnd : now;
  return new Date(base + PERIOD_MS).toISOString();
}

export function isActiveSubscription(
  status: string | null | undefined,
  currentPeriodEnd: string | null | undefined,
): boolean {
  if (status !== "confirmed" || !currentPeriodEnd) return false;
  return new Date(currentPeriodEnd).getTime() > Date.now();
}
