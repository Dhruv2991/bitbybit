// ════════════════════════════════════════════════════════════
// src/lib/email.ts
// Sends every outbound email (subscription confirmations,
// contest/challenge alerts, subscribe nudges) through Brevo's
// transactional email API (https://api.brevo.com) — a plain HTTPS
// call, no SMTP handshake, no domain verification required to get
// started.
//
// Requires BREVO_API_KEY (Settings → SMTP & API → API Keys in your
// Brevo dashboard) and BREVO_SENDER_EMAIL (must be a "Sender"
// verified in Brevo — Settings → Senders & IP).
//
// Compliant Unsubscribe Support:
//   - Checks the user's `email_subscribed` flag before sending any
//     promotional or marketing emails.
//   - Appends a mandatory, clear unsubscribe footer to every outbound
//     promotional email template linking to:
//     `https://bitbybit-9h8e.vercel.app/unsubscribe?email=USER_EMAIL`
//
// Server-only — never import this from a client component.
// ════════════════════════════════════════════════════════════

import { createServerSupabaseClient } from '@/lib/supabase';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
export const UNSUBSCRIBE_BASE_URL = 'https://bitbybit-9h8e.vercel.app/unsubscribe';

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Bit by Bit';
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

function ready(): boolean {
  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
    console.error('[email] BREVO_API_KEY / BREVO_SENDER_EMAIL not set — skipping send');
    return false;
  }
  return true;
}

/**
 * Generates the compliant unsubscribe URL with recipient email encoded.
 * Fallback to direct placeholder URL format per specification.
 */
export function getUnsubscribeUrl(email?: string): string {
  if (!email || !email.trim()) {
    return `${UNSUBSCRIBE_BASE_URL}?email=USER_EMAIL`;
  }
  return `${UNSUBSCRIBE_BASE_URL}?email=${encodeURIComponent(email.trim().toLowerCase())}`;
}

/**
 * Checks whether an email address is subscribed to promotional communications.
 * Respects opt-out across members, subscribers, and email_unsubscribes tables.
 */
export async function isEmailSubscribed(email: string): Promise<boolean> {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return false;
  }

  try {
    const cleanEmail = email.trim().toLowerCase();
    const db = createServerSupabaseClient();

    // 1. Check dedicated email_unsubscribes opt-out table
    // eslint-disable-next-line
    const { data: optOut, error: optErr } = await (db.from('email_unsubscribes') as any)
      .select('email')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (!optErr && optOut) {
      return false;
    }

    // 2. Check members table (user accounts/profiles)
    // eslint-disable-next-line
    const { data: member, error: memberErr } = await (db.from('members') as any)
      .select('email_subscribed')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (!memberErr && member && member.email_subscribed === false) {
      return false;
    }

    // 3. Check subscribers table (paid subscribers)
    // eslint-disable-next-line
    const { data: subscriber, error: subErr } = await (db.from('subscribers') as any)
      .select('email_subscribed')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (!subErr && subscriber && subscriber.email_subscribed === false) {
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[email] Warning checking email subscription status for', email, err);
    // If Supabase check fails unexpectedly, do not block critical operations
    return true;
  }
}

async function brevoSend(to: string, subject: string, html: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY!,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const msg = body?.message || `HTTP ${res.status}`;
      console.error('[email] Brevo send failed for', to, msg);
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (err: any) {
    console.error('[email] Brevo request failed for', to, err);
    return { ok: false, error: err?.message || String(err) };
  }
}

export interface WrapOptions {
  isPromotional?: boolean;
  recipientEmail?: string;
}

/**
 * Standard unsubscribe footer renderer for marketing & broadcast messages.
 */
export function renderUnsubscribeFooter(recipientEmail?: string): string {
  const unsubscribeUrl = getUnsubscribeUrl(recipientEmail);
  return `
    <div style="margin-top:32px;padding-top:18px;border-top:1px solid #222;font-size:11px;color:#777;line-height:1.6;">
      <p style="margin:0 0 6px 0;color:#888;">
        You're receiving this promotional update because you have an account with Bit by Bit.
      </p>
      <p style="margin:0;color:#666;">
        Don't want to receive promotional notifications? 
        <a href="${unsubscribeUrl}" style="color:#00e87a;text-decoration:underline;font-weight:600;" target="_blank" rel="noopener noreferrer">
          Unsubscribe here
        </a>
      </p>
    </div>
  `;
}

function wrap(bodyHtml: string, options?: WrapOptions) {
  const footerHtml = options?.isPromotional
    ? renderUnsubscribeFooter(options?.recipientEmail)
    : `
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #222;font-size:11px;color:#666;">
        You're receiving this transactional notice because you have an account on Bit by Bit.
      </div>
    `;

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0a0a0a;padding:32px 0;">
    <div style="max-width:480px;margin:0 auto;background:#111;border:1px solid #222;border-radius:16px;padding:32px;color:#e0e0e0;">
      <div style="font-family:monospace;font-weight:bold;color:#00e87a;font-size:14px;margin-bottom:24px;">Bit by Bit</div>
      ${bodyHtml}
      ${footerHtml}
    </div>
  </div>`;
}

export interface SendEmailOptions {
  isPromotional?: boolean;
}

/**
 * Single transactional or promotional send (confirmations, receipts, nudges).
 * If `options?.isPromotional` is set, verifies that the user is subscribed
 * before dispatching. Logs and returns false on failure or opt-out.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  options?: SendEmailOptions
): Promise<boolean> {
  if (!ready() || !to) return false;

  if (options?.isPromotional) {
    const subscribed = await isEmailSubscribed(to);
    if (!subscribed) {
      console.log(`[email] Skipping promotional send to ${to}: user has opted out.`);
      return false;
    }
  }

  const result = await brevoSend(to, subject, html);
  return result.ok;
}

/**
 * Same as sendEmail but also returns detailed status and failure reasons.
 * Verifies `isEmailSubscribed` before sending promotional emails.
 */
export async function sendEmailDetailed(
  to: string,
  subject: string,
  html: string,
  options?: SendEmailOptions
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!ready()) return { ok: false, error: 'BREVO_API_KEY / BREVO_SENDER_EMAIL not set' };
  if (!to) return { ok: false, error: 'No recipient email' };

  if (options?.isPromotional) {
    const subscribed = await isEmailSubscribed(to);
    if (!subscribed) {
      console.log(`[email] Skipping promotional send to ${to}: user has opted out.`);
      return { ok: false, skipped: true, error: 'Recipient has opted out of promotional emails.' };
    }
  }

  return brevoSend(to, subject, html);
}

/**
 * Dedicated dispatch helper for promotional or marketing emails.
 * Explicitly guards against opt-out requests.
 */
export async function sendPromotionalEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  return sendEmailDetailed(to, subject, html, { isPromotional: true });
}

export interface BatchRecipient {
  to: string;
  subject: string;
  html: string;
  isPromotional?: boolean;
}

/**
 * Batch send for broadcasts (contest live, weekly challenge,
 * subscribe nudge). Checks opt-out status for promotional recipients
 * and paces sends sequentially with a small delay.
 */
export async function sendBatch(
  recipients: BatchRecipient[]
): Promise<{ sent: number; failed: number; skipped: number; lastError?: string }> {
  if (!ready()) {
    return { sent: 0, failed: recipients.length, skipped: 0, lastError: 'BREVO_API_KEY / BREVO_SENDER_EMAIL not set' };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let lastError: string | undefined;

  for (const r of recipients) {
    if (r.isPromotional) {
      const subscribed = await isEmailSubscribed(r.to);
      if (!subscribed) {
        console.log(`[email/batch] Skipping promotional send to ${r.to}: user opted out.`);
        skipped++;
        continue;
      }
    }

    const result = await brevoSend(r.to, r.subject, r.html);
    if (result.ok) {
      sent++;
    } else {
      failed++;
      lastError = result.error;
    }
    // Gentle pacing to avoid tripping Brevo's per-second rate limit.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return { sent, failed, skipped, lastError };
}

function he(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ────────────────────────────────────────────────────────────
// Templates
// ────────────────────────────────────────────────────────────

// 1. Transactional: Subscription Confirmed
export function subscriptionConfirmedEmail(name: string, periodEnd: string) {
  const safeName = he(name);
  const until = he(new Date(periodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }));
  return {
    subject: "You're subscribed ✓",
    html: wrap(`
      <p style="font-size:15px;">Hey ${safeName},</p>
      <p style="font-size:14px;color:#aaa;line-height:1.6;">
        Your subscription is active. You've got full access to problems, weekly challenges,
        and free contest entry until <strong style="color:#00e87a;">${until}</strong>.
      </p>
      <a href="${SITE_URL}/#problems" style="display:inline-block;margin-top:16px;background:#00e87a;color:#000;
        padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:13px;">
        Start solving →
      </a>
    `),
  };
}

// 2. Transactional: Subscription Revoked / Refunded
export function subscriptionRevokedEmail(name: string) {
  const safeName = he(name);
  return {
    subject: 'Your subscription has been refunded',
    html: wrap(`
      <p style="font-size:15px;">Hey ${safeName},</p>
      <p style="font-size:14px;color:#aaa;line-height:1.6;">
        We've processed a refund for your subscription, and your access has been
        turned off accordingly. If you think this was a mistake, just reply to this
        email and we'll sort it out.
      </p>
    `),
  };
}

// 3. Promotional: Contest Live Announcement
export function contestLiveEmail(name: string, contestName: string, recipientEmail?: string) {
  const safeName = he(name);
  const safeContest = he(contestName);
  return {
    subject: `🏆 ${contestName} is live now`,
    html: wrap(`
      <p style="font-size:15px;">Hey ${safeName},</p>
      <p style="font-size:14px;color:#aaa;line-height:1.6;">
        <strong style="color:#e0e0e0;">${safeContest}</strong> just went live in the Arena.
        Free entry for subscribers — jump in before it wraps up.
      </p>
      <a href="${SITE_URL}/#arena" style="display:inline-block;margin-top:16px;background:#00e87a;color:#000;
        padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:13px;">
        Enter the Arena →
      </a>
    `, { isPromotional: true, recipientEmail }),
  };
}

// 4. Promotional: Weekly Challenge Drop
export function weeklyChallengeEmail(name: string, title: string, recipientEmail?: string) {
  const safeName = he(name);
  const safeTitle = he(title);
  return {
    subject: `🏅 New weekly challenge: ${title}`,
    html: wrap(`
      <p style="font-size:15px;">Hey ${safeName},</p>
      <p style="font-size:14px;color:#aaa;line-height:1.6;">
        This week's challenge <strong style="color:#e0e0e0;">${safeTitle}</strong> is up.
        Solve it before the week's out to climb the leaderboard.
      </p>
      <a href="${SITE_URL}/#weekly" style="display:inline-block;margin-top:16px;background:#00e87a;color:#000;
        padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:13px;">
        View challenge →
      </a>
    `, { isPromotional: true, recipientEmail }),
  };
}

// 5. Promotional: Inactivity Nudge
export function inactivityNudgeEmail(name: string, daysInactive: number, recipientEmail?: string) {
  const safeName = he(name);
  const safeDays = he(daysInactive);
  return {
    subject: "We miss you at Bit by Bit 👋",
    html: wrap(`
      <p style="font-size:15px;">Hey ${safeName},</p>
      <p style="font-size:14px;color:#aaa;line-height:1.6;">
        It's been ${safeDays} days since you last solved a problem —
        your account, streak, and points are all still here. Come back and
        solve one to pick up where you left off.
      </p>
      <a href="${SITE_URL}/#problems" style="display:inline-block;margin-top:16px;background:#00e87a;color:#000;
        padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:13px;">
        Solve a problem →
      </a>
    `, { isPromotional: true, recipientEmail }),
  };
}

// 6. Promotional: Subscribe Nudge
export function subscribeNudgeEmail(name: string, recipientEmail?: string) {
  const safeName = he(name);
  return {
    subject: "You're missing out on this week's challenge",
    html: wrap(`
      <p style="font-size:15px;">Hey ${safeName},</p>
      <p style="font-size:14px;color:#aaa;line-height:1.6;">
        You signed in but haven't subscribed yet — subscribers get full problem access,
        weekly challenges, and free contest entry, all for ₹39/month.
      </p>
      <a href="${SITE_URL}/#problems" style="display:inline-block;margin-top:16px;background:#00e87a;color:#000;
        padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:13px;">
        Subscribe now →
      </a>
    `, { isPromotional: true, recipientEmail }),
  };
}

// 7. Transactional: Certificate Issued
export function certificateIssuedEmail(
  name: string,
  certificateTitle: string,
  eventName: string,
  certificateId: string,
  viewUrl?: string
) {
  const safeName = he(name);
  const safeTitle = he(certificateTitle);
  const safeEvent = he(eventName);
  const safeCertId = he(certificateId);
  const targetUrl = viewUrl || `${SITE_URL}/profile`;

  return {
    subject: 'Your Bit-by-Bit Certificate Has Been Issued',
    html: wrap(`
      <p style="font-size:16px;font-weight:bold;color:#fff;margin-bottom:8px;">Hello ${safeName},</p>
      <p style="font-size:15px;color:#00e87a;font-weight:bold;margin-bottom:16px;">🎉 Congratulations!</p>
      <p style="font-size:14px;color:#ccc;line-height:1.6;margin-bottom:16px;">
        A certificate has been issued to you through Bit-by-Bit.
      </p>
      <div style="background:#161616;border:1px solid #282828;border-radius:12px;padding:16px;margin:16px 0;font-size:13px;line-height:1.8;">
        <div style="color:#888;">Certificate:</div>
        <div style="color:#00e87a;font-weight:bold;margin-bottom:8px;">${safeTitle}</div>
        <div style="color:#888;">Event:</div>
        <div style="color:#e0e0e0;font-weight:bold;margin-bottom:8px;">${safeEvent}</div>
        <div style="color:#888;">Certificate ID:</div>
        <div style="color:#f0b429;font-family:monospace;font-weight:bold;">${safeCertId}</div>
      </div>
      <p style="font-size:13px;color:#aaa;line-height:1.5;">
        You can view and download your certificate anytime from your Bit-by-Bit profile.
      </p>
      <a href="${targetUrl}" style="display:inline-block;margin-top:20px;background:#00e87a;color:#000;
        padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;box-shadow:0 0 16px rgba(0,232,122,0.3);">
        View Certificate →
      </a>
    `),
  };
}
