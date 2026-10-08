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
        <h1 className="font-display font-black text-3xl md:text-4xl text-slate-900 dark:text-zinc-100 mb-2 tracking-tight">
          Terms &amp; Conditions
        </h1>
        <p className="text-slate-500 dark:text-zinc-500 font-mono text-xs">
          Last updated: {LAST_UPDATED}
        </p>
      </div>

      <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-6 md:p-8 mb-5 space-y-6 text-slate-600 dark:text-zinc-400 font-mono text-xs leading-relaxed shadow-xs">
        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">
            1. Acceptance of terms
          </h2>
          <p>
            By creating an account or using BitByBit ("the platform"), you agree
            to these Terms & Conditions. If you do not agree, please do not use
            the platform.
          </p>
        </section>

        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">
            2. What BitByBit is
          </h2>
          <p>
            BitByBit is an AI-powered coding practice and interview preparation
            platform offering a curated problems library, weekly coding
            challenges, proctored coding assessments, AI-assisted hints, code
            review, performance analytics, and community leaderboards. A
            monthly subscription (₹39/month) unlocks premium educational
            features, including AI tools, advanced challenges, and free entry
            to every proctored coding assessment ("Arena" contest). No
            separate per-contest fee is charged to subscribers.
          </p>
        </section>

        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">
            3. Coding Challenges
          </h2>
          <p>
            BitByBit periodically hosts coding challenges and proctored coding
            assessments to encourage learning, problem-solving, and technical
            skill development.
          </p>

          <p className="mt-2">
            Points, rankings, streaks, badges, and leaderboards are used solely
            as gamified educational features to help users track their progress
            and engage with the community.
          </p>

          <p className="mt-2">
            Where a third-party organizer independently announces any prize or
            recognition, such arrangements are governed entirely by the
            organizer's own terms and are not administered, processed, or
            guaranteed by BitByBit.
          </p>
        </section>

        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">4. Payments</h2>
          <p>
            Payments are securely processed through our authorized payment
            gateway partner.
          </p>

          <p className="mt-2">
            A monthly subscription (₹39/month) grants access to premium
            educational features including AI-powered tools, weekly coding
            challenges, the complete problems library, advanced analytics,
            free entry to every proctored coding assessment, and
            participation in proctored coding assessments, for a period of
            30 days from the date of payment.
          </p>

          <p className="mt-2">
            This is a manually-renewed pass, not an automatic recurring
            billing arrangement. We do not store your card, UPI, or bank
            details, and no amount is ever charged without you actively
            initiating a payment. Your access simply expires 30 days after
            payment unless you choose to pay again; there is no auto-debit,
            no standing mandate, and no obligation to renew.
          </p>

          <p className="mt-2">
            Subscription payments are made solely for accessing premium
            platform features and are not linked to leaderboard rankings,
            coding challenge outcomes, or prizes.
          </p>

          <p className="mt-2">
            Subscription access is activated automatically after a successful
            verified payment, and is extended by 30 days from whichever is
            later — the moment of payment, or the end of your current paid
            period (so renewing a few days early never wastes time you've
            already paid for).
          </p>
        </section>

        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">
            5. Account & eligibility
          </h2>
          <p>
            You must sign in with a valid GitHub account to use the platform.
            You are responsible for maintaining the security of your GitHub
            account. One subscription is tied to one GitHub account and is
            non-transferable.
          </p>
        </section>

        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">
            6. Acceptable use
          </h2>
          <p>
            You agree not to: cheat, plagiarize solutions, exploit bugs for
            unfair advantage, use automated tools to solve problems on your
            behalf in ways that violate contest rules, attempt to access other
            users' data, or attempt to disrupt the platform's operation. In
            proctored coding assessments, monitored behaviours such as repeated
            tab switching or attempts to bypass platform rules may result in
            warnings, disqualification, or other actions in accordance with the
            applicable challenge rules.
          </p>
        </section>

        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">
            7. Intellectual property
          </h2>
          <p>
            The platform's source code, design, problem content, UI components,
            AI integration, and scoring system are the exclusive property of
            Dhruv G Nayak and TeamCodeLocked, BMS College of Engineering.
            Unauthorized copying, reproduction, or redistribution is prohibited
            — see the About page for full copyright terms.
          </p>
        </section>

        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">
            8. AI features
          </h2>
          <p>
            AI-generated hints, code reviews, and editorials are provided for
            educational assistance and may occasionally be inaccurate or
            incomplete. You should independently verify any AI-generated
            guidance rather than relying on it as a sole source of truth.
          </p>
        </section>

        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">
            9. Availability & changes
          </h2>
          <p>
            We aim to keep the platform available but do not guarantee
            uninterrupted access. Features, pricing, and these terms may change
            over time; continued use after a change constitutes acceptance of
            the updated terms.
          </p>
        </section>

        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">
            10. Limitation of liability
          </h2>
          <p>
            The platform is provided "as is" without warranties of any kind. To
            the maximum extent permitted by law, we are not liable for indirect,
            incidental, or consequential damages arising from your use of the
            platform.
          </p>
        </section>

        <section>
          <h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm mb-2">11. Contact</h2>
          <p>
            Questions about these terms?{" "}
            <a
              href="mailto:ddhruvgnayak@gmail.com"
              className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 underline underline-offset-2 transition-colors"
            >
              ddhruvgnayak@gmail.com
            </a>
          </p>
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
