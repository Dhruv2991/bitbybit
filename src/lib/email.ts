// ════════════════════════════════════════════════════════════
// src/lib/email.ts
// Sends every outbound email (subscription confirmations,
// contest/challenge alerts, subscribe nudges) through Gmail SMTP
// via Nodemailer — no domain verification needed, unlike Resend.
//
// Requires GMAIL_USER (your Gmail address) and GMAIL_APP_PASSWORD
// (a 16-character App Password, NOT your normal Gmail password —
// generate one at https://myaccount.google.com/apppasswords, which
// requires 2-Step Verification to be turned on first).
//
// Trade-offs vs. a verified domain:
//   - Free, works immediately, no DNS required.
//   - Can send to ANY recipient (not just your own address).
//   - Capped around ~500 emails/day by Gmail.
//   - Sent from your personal Gmail address, so it's more likely
//     to get flagged as spam than mail from a verified domain —
//     fine for now, worth revisiting once you have a domain.
//
// Server-only — never import this from a client component.
// ════════════════════════════════════════════════════════════

import nodemailer from 'nodemailer';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const FROM = process.env.EMAIL_FROM || `Bit by Bit <${GMAIL_USER}>`;

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error('[email] GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping send');
    return null;
  }
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      // Reuse one connection across a whole batch instead of doing a
      // fresh TLS handshake per email — this is the difference between
      // ~2s and ~300ms per send, which matters a lot once you're
      // sending to dozens of people in one request.
      pool: true,
      maxConnections: 1,
      rateDelta: 1000,
      rateLimit: 4, // stay well under Gmail's per-second throttling
    });
  }
  return cachedTransporter;
}

function wrap(bodyHtml: string) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0a0a0a;padding:32px 0;">
    <div style="max-width:480px;margin:0 auto;background:#111;border:1px solid #222;border-radius:16px;padding:32px;color:#e0e0e0;">
      <div style="font-family:monospace;font-weight:bold;color:#00e87a;font-size:14px;margin-bottom:24px;">Bit by Bit</div>
      ${bodyHtml}
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #222;font-size:11px;color:#666;">
        You're receiving this because you have an account on Bit by Bit.
      </div>
    </div>
  </div>`;
}

/**
 * Single transactional send (confirmations, receipts). Never throws —
 * logs and returns false on failure so a failed email can't take
 * down a payment-verification request.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter || !to) return false;
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
    return true;
  } catch (err) {
    console.error('[email] send failed:', err);
    return false;
  }
}

export interface BatchRecipient {
  to: string;
  subject: string;
  html: string;
}

/**
 * Batch send for broadcasts (contest live, weekly challenge,
 * subscribe nudge). Gmail SMTP has no true batch endpoint, so this
 * sends sequentially with a small delay between each — gentler on
 * Gmail's per-second limits than firing everything at once, and
 * keeps a single bad recipient from aborting the rest.
 *
 * Note: on Vercel's default (10s) function timeout, this comfortably
 * handles dozens of recipients. If your subscriber list grows into
 * the hundreds, this will need chunking across multiple requests —
 * flag it if you get there.
 */
export async function sendBatch(recipients: BatchRecipient[]): Promise<{ sent: number; failed: number }> {
  const transporter = getTransporter();
  if (!transporter) return { sent: 0, failed: recipients.length };

  let sent = 0, failed = 0;
  for (const r of recipients) {
    try {
      await transporter.sendMail({ from: FROM, to: r.to, subject: r.subject, html: r.html });
      sent++;
    } catch (err) {
      console.error('[email] batch send failed for', r.to, err);
      failed++;
    }
    // Gentle pacing to avoid tripping Gmail's rate limiting.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { sent, failed };
}

// ────────────────────────────────────────────────────────────
// Templates (unchanged — same output regardless of provider)
// ────────────────────────────────────────────────────────────

export function subscriptionConfirmedEmail(name: string, periodEnd: string) {
  const until = new Date(periodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    subject: "You're subscribed ✓",
    html: wrap(`
      <p style="font-size:15px;">Hey ${name},</p>
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

export function contestLiveEmail(name: string, contestName: string) {
  return {
    subject: `🏆 ${contestName} is live now`,
    html: wrap(`
      <p style="font-size:15px;">Hey ${name},</p>
      <p style="font-size:14px;color:#aaa;line-height:1.6;">
        <strong style="color:#e0e0e0;">${contestName}</strong> just went live in the Arena.
        Free entry for subscribers — jump in before it wraps up.
      </p>
      <a href="${SITE_URL}/#arena" style="display:inline-block;margin-top:16px;background:#00e87a;color:#000;
        padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:13px;">
        Enter the Arena →
      </a>
    `),
  };
}

export function weeklyChallengeEmail(name: string, title: string) {
  return {
    subject: `🏅 New weekly challenge: ${title}`,
    html: wrap(`
      <p style="font-size:15px;">Hey ${name},</p>
      <p style="font-size:14px;color:#aaa;line-height:1.6;">
        This week's challenge <strong style="color:#e0e0e0;">${title}</strong> is up.
        Solve it before the week's out to climb the leaderboard.
      </p>
      <a href="${SITE_URL}/#weekly" style="display:inline-block;margin-top:16px;background:#00e87a;color:#000;
        padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:13px;">
        View challenge →
      </a>
    `),
  };
}

export function subscribeNudgeEmail(name: string) {
  return {
    subject: "You're missing out on this week's challenge",
    html: wrap(`
      <p style="font-size:15px;">Hey ${name},</p>
      <p style="font-size:14px;color:#aaa;line-height:1.6;">
        You signed in but haven't subscribed yet — subscribers get full problem access,
        weekly challenges, and free contest entry, all for ₹39/month.
      </p>
      <a href="${SITE_URL}/#problems" style="display:inline-block;margin-top:16px;background:#00e87a;color:#000;
        padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:13px;">
        Subscribe now →
      </a>
    `),
  };
}
