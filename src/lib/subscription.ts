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
  hasPriorPayment: boolean = false,
): string {
  const now = Date.now();

  // If they do NOT have a legitimate prior Razorpay payment on record
  // (e.g. converting from a pre-Razorpay manual/admin grant), force a fresh 
  // 30-day window starting from today instead of stacking on top of the old manual date.
  if (!hasPriorPayment) {
    return new Date(now + PERIOD_MS).toISOString();
  }

  const existingEnd =
    currentStatus === "confirmed" && currentPeriodEnd
      ? new Date(currentPeriodEnd).getTime()
      : NaN;

  // Stacking logic only applies to people who genuinely paid through Razorpay before
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