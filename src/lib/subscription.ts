// ════════════════════════════════════════════════════════════
// src/lib/subscription.ts
// Shared helpers for the monthly (₹39/mo) subscription model.
// ════════════════════════════════════════════════════════════

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function computeNewPeriodEnd(
  currentStatus: string | null | undefined,
  currentPeriodEnd: string | null | undefined,
  hasPriorPayment: boolean = false,
): string {
  const now = Date.now();

  // If this is their first automated Razorpay payment, force-reset the 30-day 
  // window from `now` to wipe out any grandfathered/manual dates.
  if (!hasPriorPayment) {
    return new Date(now + PERIOD_MS).toISOString();
  }

  const existingEnd =
    currentStatus === "confirmed" && currentPeriodEnd
      ? new Date(currentPeriodEnd).getTime()
      : NaN;

  // Standard stacking: if they still have time left, add 30 days on top of existing end date.
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