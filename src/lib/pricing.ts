// ════════════════════════════════════════════════════════════
// src/lib/pricing.ts
// Central pricing & currency configuration for BitByBit
// ════════════════════════════════════════════════════════════

export const PRICING_CONFIG = {
  defaultMonthlyFee: 39,
  currencyCode: 'INR',
  currencySymbol: '₹',
  periodDays: 30,
  periodUnit: 'month',
  planName: 'Monthly Access Pass',
} as const;

export function formatPrice(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return '—';
  return `${PRICING_CONFIG.currencySymbol}${amount}`;
}

export function formatPriceWithPeriod(amount: number | null | undefined): string {
  return `${formatPrice(amount)}/${PRICING_CONFIG.periodUnit}`;
}

