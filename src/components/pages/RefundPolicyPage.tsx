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
        <h1 className="font-display font-black text-3xl md:text-4xl text-[#e2e2e2] mb-2 tracking-tight">
          Refund &amp; Cancellation Policy
        </h1>
        <p className="text-[#666] font-mono text-xs">Last updated: {LAST_UPDATED}</p>
      </div>

      <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-6 mb-5 space-y-5 text-[#888] font-mono text-xs leading-relaxed">

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">1. Lifetime subscription</h2>
          <p>The one-time lifetime subscription grants immediate, permanent access to weekly challenges, AI features, and free entry to every proctored Arena contest, upon successful payment. Because access is granted instantly and is not time-limited or consumable, subscription payments are <span className="text-[#e0e0e0] font-bold">non-refundable</span> once access has been granted, except as required by applicable law.</p>
          <p className="mt-2">If you believe you were charged in error (e.g. a duplicate charge, or a technical failure where payment succeeded but access was not granted), contact us within 7 days of the transaction and we will investigate and issue a refund if a genuine error is confirmed.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">2. Contest entry</h2>
          <p>Contest entry is <span className="text-[#e0e0e0] font-bold">free for confirmed subscribers</span> — no separate fee is ever charged to enter a contest. Since no payment is collected for contest entry, there is nothing to refund in connection with entering, participating in, or being disqualified from a contest.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">3. Disqualification</h2>
          <p>If you are disqualified from a contest for a violation of the contest rules (e.g. excessive tab-switching in the proctored Arena, cheating, or plagiarism), you may lose access to that specific contest, but your underlying subscription is unaffected.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">4. How refunds are processed</h2>
          <p>Approved refunds are issued to the original payment method via payment gateway and typically reflect within 5–10 business days, depending on your bank/payment provider.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">5. Requesting a refund</h2>
          <p>
            To request a refund, email{" "}
            <a href="mailto:ddhruvgnayak@gmail.com" className="text-[#a78bfa] hover:text-[#c4b5fd] transition-colors">
              ddhruvgnayak@gmail.com
            </a>{" "}
            with your GitHub username, the payment ID from your payment gateway receipt, and the reason for your request. We aim to respond within 3–5 business days.
          </p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">6. Prizes are separate from platform payments</h2>
          <p>This policy governs refunds of the lifetime subscription payment only, since that is the only payment collected by the platform. Any contest prize is arranged and given separately, directly by the organizer, outside of payment gateway and this platform — see our Terms &amp; Conditions for details.</p>
        </section>
      </div>

      <div className="text-center">
        <button
          onClick={() => onNavigate("about")}
          className="text-xs font-mono text-[#555] hover:text-[#00e87a] transition-colors"
        >
          ← Back to About
        </button>
      </div>
    </div>
  );
}