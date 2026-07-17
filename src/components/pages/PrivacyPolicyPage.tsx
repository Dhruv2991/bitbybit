"use client";

/**
 * PrivacyPolicyPage.tsx
 * BitByBit — Privacy Policy
 *
 * NOTE: This is a solid starting template, not legal advice.
 * Review with a lawyer before relying on it, especially the data
 * you actually collect/store and any region-specific requirements
 * (e.g. India's DPDP Act) that apply to your users.
 */

interface Props {
  onNavigate: (page: string) => void;
}

const LAST_UPDATED = "July 2026";

export default function PrivacyPolicyPage({ onNavigate }: Props) {
  return (
    <div className="max-w-3xl mx-auto animate-fade-up py-4 pb-20">
      <div className="text-center mb-10">
        <h1 className="font-display font-black text-3xl md:text-4xl text-[#e2e2e2] mb-2 tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-[#666] font-mono text-xs">Last updated: {LAST_UPDATED}</p>
      </div>

      <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-6 mb-5 space-y-5 text-[#888] font-mono text-xs leading-relaxed">

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">1. What we collect</h2>
          <p>When you sign in with GitHub, we receive your GitHub username, display name, and public avatar URL from GitHub's OAuth flow. We do not receive your GitHub password or private repository data.</p>
          <p className="mt-2">We also store data you generate while using the platform: code submissions, problem-solving progress, points, streaks, contest registrations, subscription status, and payment references (transaction/payment IDs — not your card or bank details, which never pass through our servers).</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">2. Payment data</h2>
          <p>All payments are processed by Razorpay. We never see or store your card number, UPI PIN, or bank credentials. We only store the payment/order ID that Razorpay returns after a successful transaction, which we use to confirm your subscription or contest entry.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">3. How we use your data</h2>
          <p>We use your data to operate the platform: authenticate you, track your progress and points, grant access to subscribed content, run contests and leaderboards, and provide AI-powered features (hints, code review) to subscribers. We do not sell your data to third parties.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">4. AI features</h2>
          <p>When you use AI features (hints, code review, editorials), your submitted code and problem context are sent to our AI providers (Groq and, as a fallback, our own self-hosted model) to generate a response. This data is used only to generate that response and is not used to train third-party models by us.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">5. Data storage & security</h2>
          <p>Data is stored with Supabase (Postgres). We take reasonable technical measures to protect your data, but no system is 100% secure — we cannot guarantee absolute security.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">6. Third parties</h2>
          <p>We share data with: GitHub (authentication), Razorpay (payments), Supabase (database/auth hosting), Vercel (application hosting), and our AI providers (Groq / self-hosted). Each of these has its own privacy policy governing how they handle data.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">7. Your rights</h2>
          <p>You can request access to, correction of, or deletion of your personal data by contacting us (see below). Deleting your account will remove your profile data; some records (e.g. payment references) may be retained as required for accounting/legal purposes.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">8. Cookies</h2>
          <p>We use essential cookies/local storage to keep you signed in and remember your preferences. We do not use third-party advertising trackers.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">9. Changes to this policy</h2>
          <p>We may update this policy from time to time. Material changes will be reflected by updating the "Last updated" date above.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">10. Contact</h2>
          <p>
            Questions about this policy?{" "}
            <a href="mailto:ddhruvgnayak@gmail.com" className="text-[#a78bfa] hover:text-[#c4b5fd] transition-colors">
              ddhruvgnayak@gmail.com
            </a>
          </p>
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