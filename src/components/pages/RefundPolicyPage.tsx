"use client";

/**
 * RefundPolicyPage.tsx
 * BitByBit — Refund & Cancellation Policy
 *
 * NOTE: This is a solid starting template, not legal advice.
 * The specific refund windows/conditions below are reasonable
 * defaults — review and adjust them (and confirm with a lawyer)
 * before publishing, especially to align with Razorpay's and
 * RBI's requirements for your account type.
 */

interface Props {
  onNavigate: (page: string) => void;
}

const LAST_UPDATED = "July 2026";

export default function RefundPolicyPage({ onNavigate }: Props) {
  return (
    <div className="max-w-3xl mx-auto animate-fade-up py-4 pb-20">
      <div className="text-center mb-10">
        <h1 className="font-display font-black text-3xl md:text-4xl text-slate-900 dark:text-zinc-100 mb-2 tracking-tight">
          Refund &amp; Cancellation Policy
        </h1>
        <p className="text-slate-500 dark:text-zinc-500 font-mono text-xs">Last updated: {LAST_UPDATED}</p>
      </div>

      <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-6 md:p-8 mb-5 space-y-6 text-slate-600 dark:text-zinc-400 font-mono text-xs leading-relaxed shadow-xs">

        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">1. Monthly subscription</h2>
          <p>The subscription is a <span className="text-slate-900 dark:text-zinc-200 font-semibold">₹39/month manually-renewed pass</span> — there is no auto-debit or recurring mandate. Each payment grants immediate access to weekly challenges, AI features, and free entry to every proctored Arena contest for 30 days. Because access is granted instantly for the full period upon payment, subscription payments are <span className="text-slate-900 dark:text-zinc-200 font-semibold">non-refundable</span> once access has been granted for that period, except as required by applicable law.</p>
          <p className="mt-2">If you believe you were charged in error (e.g. a duplicate charge, or a technical failure where payment succeeded but access was not granted), contact us within 7 days of the transaction and we will investigate and issue a refund if a genuine error is confirmed.</p>
          <p className="mt-2">There is nothing to "cancel" — since we never charge you automatically, simply not making another payment when your 30 days end is all that's needed to stop. You may renew early at any time, in which case the new 30 days are added on top of whatever time you have remaining, so you never lose paid-for access.</p>
        </section>

        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">2. Contest entry</h2>
          <p>Contest entry is <span className="text-slate-900 dark:text-zinc-200 font-semibold">free for confirmed subscribers</span> — no separate fee is ever charged to enter a contest. Since no payment is collected for contest entry, there is nothing to refund in connection with entering, participating in, or being disqualified from a contest.</p>
        </section>

        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">3. Disqualification</h2>
          <p>If you are disqualified from a contest for a violation of the contest rules (e.g. excessive tab-switching in the proctored Arena, cheating, or plagiarism), you may lose access to that specific contest, but your underlying subscription is unaffected.</p>
        </section>

        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">4. How refunds are processed</h2>
          <p>Approved refunds are issued to the original payment method via payment gateway and typically reflect within 5–10 business days, depending on your bank/payment provider.</p>
        </section>

        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">5. Requesting a refund</h2>
          <p>
            To request a refund, email{" "}
            <a href="mailto:ddhruvgnayak@gmail.com" className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 underline underline-offset-2 transition-colors">
              ddhruvgnayak@gmail.com
            </a>{" "}
            with your GitHub username, the payment ID from your payment gateway receipt, and the reason for your request. We aim to respond within 3–5 business days.
          </p>
        </section>

        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">6. Prizes are separate from platform payments</h2>
          <p>This policy governs refunds of the monthly subscription payment only, since that is the only payment collected by the platform. Any contest prize is arranged and given separately, directly by the organizer, outside of payment gateway and this platform — see our Terms &amp; Conditions for details.</p>
        </section>
      </div>

      <div className="text-center">
        <button
          onClick={() => onNavigate("about")}
          className="text-xs font-mono text-slate-500 dark:text-zinc-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
        >
          ← Back to About
        </button>
      </div>
    </div>
  );
}
