// ════════════════════════════════════════════════════════════
// src/lib/certificates/idGenerator.ts
// ════════════════════════════════════════════════════════════

import crypto from 'crypto';

/**
 * Generates a collision-safe, professional certificate ID.
 * Format: BBCERT-YYYY-XXXXXX (e.g. BBCERT-2026-8F2A9B)
 */
export function generateCertificateId(year: number = new Date().getFullYear()): string {
  // 6 hex characters = 16.7 million combinations per year + unique DB constraint
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `BBCERT-${year}-${randomHex}`;
}
