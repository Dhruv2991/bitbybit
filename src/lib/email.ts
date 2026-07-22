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
// Trade-offs:
//   - Free tier: 300 emails/day, no credit card required.
//   - Sending from a domain-verified sender lands in inboxes more
//     reliably than a personal Gmail address did.
//   - No daily send-rate footgun like Gmail's undocumented limits —
//     Brevo enforces a clear, visible quota in its dashboard.
//
// Server-only — never import this from a client component.
// ════════════════════════════════════════════════════════════

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
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
  if (!ready() || !to) return false;
  const result = await brevoSend(to, subject, html);
  return result.ok;
}

/**
 * Same as sendEmail but also returns the failure reason — used by
 * the broadcast route so a failed send can show *why* in the admin
 * toast instead of just a bare failed count.
 */
export async function sendEmailDetailed(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!ready()) return { ok: false, error: 'BREVO_API_KEY / BREVO_SENDER_EMAIL not set' };
  if (!to) return { ok: false, error: 'No recipient email' };
  return brevoSend(to, subject, html);
}

export interface BatchRecipient {
  to: string;
  subject: string;
  html: string;
}

/**
 * Batch send for broadcasts (contest live, weekly challenge,
 * subscribe nudge). Brevo's API is per-recipient like Gmail's SMTP
 * was, so this still sends sequentially with a small delay between
 * each — gentler on rate limits than firing everything at once, and
 * keeps a single bad recipient from aborting the rest.
 *
 * Note: on Vercel's default (10s) function timeout, this comfortably
 * handles dozens of recipients. If your subscriber list grows into
 * the hundreds, this will need chunking across multiple requests —
 * flag it if you get there.
 */
export async function sendBatch(recipients: BatchRecipient[]): Promise<{ sent: number; failed: number; lastError?: string }> {
  if (!ready()) return { sent: 0, failed: recipients.length, lastError: 'BREVO_API_KEY / BREVO_SENDER_EMAIL not set' };

  let sent = 0, failed = 0;
  let lastError: string | undefined;
  for (const r of recipients) {
    const result = await brevoSend(r.to, r.subject, r.html);
    if (result.ok) sent++;
    else { failed++; lastError = result.error; }
    // Gentle pacing to avoid tripping Brevo's per-second rate limit.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { sent, failed, lastError };
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
