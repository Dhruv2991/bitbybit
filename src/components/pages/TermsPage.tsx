"use client";

/**
 * TermsPage.tsx
 * BitByBit — Terms & Conditions
 *
 * NOTE: This is a solid starting template, not legal advice.
 * Review with a lawyer before relying on it, especially around
 * payment terms, liability limits, and jurisdiction, which should
 * match your actual business setup.
 */

interface Props {
  onNavigate: (page: string) => void;
}

const LAST_UPDATED = "July 2026";

export default function TermsPage({ onNavigate }: Props) {
  return (
    <div className="max-w-3xl mx-auto animate-fade-up py-4 pb-20">
      <div className="text-center mb-10">
        <h1 className="font-display font-black text-3xl md:text-4xl text-[#e2e2e2] mb-2 tracking-tight">
          Terms &amp; Conditions
        </h1>
        <p className="text-[#666] font-mono text-xs">Last updated: {LAST_UPDATED}</p>
      </div>

      <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-6 mb-5 space-y-5 text-[#888] font-mono text-xs leading-relaxed">

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">1. Acceptance of terms</h2>
          <p>By creating an account or using BitByBit ("the platform"), you agree to these Terms & Conditions. If you do not agree, please do not use the platform.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">2. What BitByBit is</h2>
          <p>BitByBit is a competitive coding practice platform offering a problems library, weekly challenges, a proctored contest arena, AI-assisted hints and code review, and a leaderboard. Access to weekly challenges and AI features requires a one-time lifetime subscription. Access to proctored Arena contests requires a separate per-contest entry fee.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">3. No prizes or payouts</h2>
          <p>BitByBit does not offer cash prizes, rewards, or payouts of any kind to users. Contests and challenges are ranked purely by points and leaderboard position. No money is ever paid out to users through this platform.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">4. Payments</h2>
          <p>All payments are processed securely via Razorpay. Subscription payments grant lifetime access to weekly challenges and AI features. Contest entry fees grant access to a single specified contest. All payments are confirmed automatically upon successful, verified transaction — no manual approval step is required.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">5. Account & eligibility</h2>
          <p>You must sign in with a valid GitHub account to use the platform. You are responsible for maintaining the security of your GitHub account. One subscription/entry is tied to one GitHub account and is non-transferable.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">6. Acceptable use</h2>
          <p>You agree not to: cheat, plagiarize solutions, exploit bugs for unfair advantage, use automated tools to solve problems on your behalf in ways that violate contest rules, attempt to access other users' data, or attempt to disrupt the platform's operation. In proctored Arena contests, tab-switching and other monitored behaviors may result in disqualification per the contest's stated rules (e.g. a 3-strike policy).</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">7. Intellectual property</h2>
          <p>The platform's source code, design, problem content, UI components, AI integration, and scoring system are the exclusive property of Dhruv G Nayak and TeamCodeLocked, BMS College of Engineering. Unauthorized copying, reproduction, or redistribution is prohibited — see the About page for full copyright terms.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">8. AI features</h2>
          <p>AI-generated hints, code reviews, and editorials are provided for educational assistance and may occasionally be inaccurate or incomplete. You should independently verify any AI-generated guidance rather than relying on it as a sole source of truth.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">9. Availability & changes</h2>
          <p>We aim to keep the platform available but do not guarantee uninterrupted access. Features, pricing, and these terms may change over time; continued use after a change constitutes acceptance of the updated terms.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">10. Limitation of liability</h2>
          <p>The platform is provided "as is" without warranties of any kind. To the maximum extent permitted by law, we are not liable for indirect, incidental, or consequential damages arising from your use of the platform.</p>
        </section>

        <section>
          <h2 className="text-[#e0e0e0] font-bold text-sm mb-2">11. Contact</h2>
          <p>
            Questions about these terms?{" "}
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