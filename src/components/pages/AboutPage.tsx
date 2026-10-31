"use client";

/**
 * AboutPage.tsx
 * BitByBit — About & Legal
 * © 2026 Dhruv G Nayak / TeamCodeLocked, BMS College of Engineering
 */

import { PRICING_CONFIG, formatPriceWithPeriod } from "@/lib/pricing";

interface Props {
  onNavigate: (page: string) => void;
}

const YEAR = new Date().getFullYear();

export default function AboutPage({ onNavigate }: Props) {
  return (
    <div className="max-w-3xl mx-auto animate-fade-up py-4 pb-20">

      {/* Hero */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 mb-5">
          <span className="text-3xl font-mono font-bold text-cyan-600 dark:text-cyan-400">{'{ }'}</span>
        </div>
        <h1 className="font-bold text-3xl md:text-4xl text-slate-900 dark:text-zinc-100 mb-3 tracking-tight">
          BitByBit
        </h1>
        <p className="text-slate-600 dark:text-zinc-400 font-mono text-sm max-w-md mx-auto leading-relaxed">
          An AI-powered coding practice and interview preparation platform built for students and developers to improve one problem at a time.
        </p>
      </div>

      {/* About the platform */}
      <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-6 mb-5 shadow-xs">
        <h2 className="font-semibold text-slate-900 dark:text-zinc-100 text-base mb-3 flex items-center gap-2">
          <span className="text-cyan-600 dark:text-cyan-400">✦</span> What is BitByBit?
        </h2>
        <p className="text-slate-600 dark:text-zinc-400 font-mono text-xs leading-relaxed mb-3">
          BitByBit is an AI-powered coding practice and interview preparation platform featuring
          real-time code execution, curated programming challenges, proctored coding assessments,
          AI-assisted learning tools, and community leaderboards designed to help learners improve
          their programming skills.
        </p>
        <p className="text-slate-600 dark:text-zinc-400 font-mono text-xs leading-relaxed">
          Problems are executed securely in-browser or within isolated server environments.
          Subscribers get monthly access ({formatPriceWithPeriod(PRICING_CONFIG.defaultMonthlyFee)}) to premium challenges, AI-powered learning features,
          advanced analytics, and proctored coding assessments.
        </p>
      </div>

      {/* Built by */}
      <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-6 mb-5 shadow-xs">
        <h2 className="font-semibold text-slate-900 dark:text-zinc-100 text-base mb-4 flex items-center gap-2">
          <span className="text-cyan-600 dark:text-cyan-400">✦</span> Built by
        </h2>
        <div className="flex items-center gap-4 mb-4">
          <a
            href="https://github.com/Dhruv2991"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
          >
            <img
              src="https://github.com/Dhruv2991.png?size=80"
              alt="Dhruv G Nayak"
              width={56}
              height={56}
              style={{ width: 56, height: 56 }}
              className="rounded-full ring-2 ring-cyan-500/30 object-cover"
              onError={e => { (e.target as HTMLImageElement).src = "https://avatars.githubusercontent.com/u/0"; }}
            />
          </a>
          <div>
            <div className="font-mono font-bold text-slate-900 dark:text-zinc-200 text-sm">Dhruv G Nayak</div>
            <div className="text-slate-400 dark:text-zinc-500 font-mono text-[10px] mt-0.5">Dhruv2991</div>
            <a
              href="mailto:ddhruvgnayak@gmail.com"
              className="text-cyan-600 dark:text-cyan-400 font-mono text-[11px] hover:text-cyan-500 dark:hover:text-cyan-300 transition-colors mt-0.5 block"
            >
              ddhruvgnayak@gmail.com
            </a>
          </div>
        </div>
        <div className="border-t border-slate-200 dark:border-zinc-800/80 pt-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <span className="text-amber-500 dark:text-amber-400 text-sm">🏛</span>
            </div>
            <div>
              <div className="font-mono font-semibold text-slate-800 dark:text-zinc-200 text-sm">TeamCodeLocked</div>
              <div className="text-slate-500 dark:text-zinc-500 font-mono text-[10px]">BMS College of Engineering, Bengaluru</div>
            </div>
            <a
              href="https://www.instagram.com/teamcodelocked/"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5
                bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg
                hover:bg-amber-500/20 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              @teamcodelocked
            </a>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-6 mb-5 shadow-xs">
        <h2 className="font-semibold text-slate-900 dark:text-zinc-100 text-base mb-4 flex items-center gap-2">
          <span className="text-emerald-500 dark:text-emerald-400">✦</span> Platform features
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            ["{ }", "Problems library",      "Curated problems with hidden test cases"],
            ["🏅",  "Weekly challenges",     "New problems every week, time bonus scoring"],
            ["🏆",  "Proctored arena", "Live supervised coding assessments with secure proctoring"],
            ["⭐",  "Monthly subscription",  `${formatPriceWithPeriod(PRICING_CONFIG.defaultMonthlyFee)}, unlocks weekly access & free contest entry`],
            ["✦",  "AI features",           "Hints, debugger, and code review"],
            ["💬",  "Discussion threads",    "Community discussion on every problem"],
            ["⚡",  "Leaderboard",           "Real-time rankings by points and streak"],
            ["🔒",  "Secure execution",      "Code runs in browser or sandboxed server"],
          ].map(([icon, title, desc]) => (
            <div key={title} className="flex gap-3 items-start p-3 bg-slate-50 dark:bg-zinc-900/30 rounded-xl border border-slate-200/80 dark:border-zinc-800/60">
              <span className="text-base shrink-0 mt-0.5 w-5 text-center">{icon}</span>
              <div>
                <div className="text-xs font-mono font-semibold text-slate-800 dark:text-zinc-200">{title}</div>
                <div className="text-[10px] font-mono text-slate-500 dark:text-zinc-500 mt-0.5">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payments & Subscription */}
      <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-6 mb-5 shadow-xs">
        <h2 className="font-semibold text-slate-900 dark:text-zinc-100 text-base mb-3 flex items-center gap-2">
          <span className="text-cyan-600 dark:text-cyan-400">✦</span> Payments &amp; Subscription
        </h2>

        <div className="space-y-2 text-slate-600 dark:text-zinc-400 font-mono text-xs leading-relaxed">
          <p>
            BitByBit offers a monthly subscription ({formatPriceWithPeriod(PRICING_CONFIG.defaultMonthlyFee)}) that unlocks premium educational
            features including weekly coding challenges, AI-powered tools, the complete
            problems library, advanced analytics, and free entry to every proctored coding assessment.
          </p>

          <p>
            Each payment covers 30 days of access. This is a manually-renewed pass, not an
            automatic recurring charge &mdash; there's no auto-debit or standing mandate, so nothing
            is ever charged without you actively paying again. Renewing a few days early simply
            adds the new 30 days on top of your remaining time.
          </p>

          <p>
            Payments are securely processed through our authorized payment gateway partner.
            Subscription payments are solely for accessing premium software features and
            educational services offered on the platform.
          </p>

          <p>
            BitByBit uses points, rankings, streaks, badges, and leaderboards as gamified
            learning features to encourage continuous skill development and community engagement.
          </p>
        </div>
      </div>

      {/* Legal / Copyright */}
      <div className="bg-white dark:bg-zinc-900/50 border border-rose-500/30 dark:border-rose-500/20 rounded-2xl p-6 mb-5 shadow-xs">
        <h2 className="font-semibold text-slate-900 dark:text-zinc-100 text-base mb-4 flex items-center gap-2">
          <span className="text-rose-500 dark:text-rose-400">✦</span> Copyright & Legal
        </h2>

        <div className="space-y-3 text-slate-600 dark:text-zinc-400 font-mono text-xs leading-relaxed">
          <p>
            <span className="text-slate-900 dark:text-zinc-200 font-semibold">
              © {YEAR} Dhruv G Nayak. All rights reserved.
            </span>
          </p>
          <p>
            BitByBit &mdash; including its source code, design, problem content, UI components,
            AI integration, scoring system, and all associated intellectual property &mdash; is the
            exclusive property of <span className="text-slate-900 dark:text-zinc-200 font-medium">Dhruv G Nayak</span> and
            <span className="text-slate-900 dark:text-zinc-200 font-medium"> TeamCodeLocked, BMS College of Engineering</span>.
          </p>
          <p>
            <span className="text-rose-600 dark:text-rose-400 font-semibold">Unauthorized copying, reproduction, modification,
            distribution, or use of this platform or any part of it &mdash; in whole or in part &mdash;
            is strictly prohibited</span> without prior written permission from the author.
          </p>
          <p>
            This includes but is not limited to: cloning or forking the codebase for deployment,
            copying the UI design or problem structure, reusing the scoring algorithm or
            subscription model, and impersonating this platform or its branding.
          </p>
          <p>
            Violations may be subject to legal action under applicable intellectual property laws.
          </p>
          <div className="border-t border-slate-200 dark:border-zinc-800/80 pt-3 mt-3">
            <p className="text-slate-500 dark:text-zinc-500">
              For licensing inquiries, institutional partnerships, or club collaborations:
              {" "}<button onClick={() => onNavigate("collaborations")} className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 underline underline-offset-2 transition-colors">
                View Collaborations &amp; Partnerships
              </button>
            </p>
          </div>
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-200 dark:border-zinc-800/80 flex-wrap">
            <button onClick={() => onNavigate("collaborations")} className="text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 transition-colors">
              Collaborations
            </button>
            <button onClick={() => onNavigate("privacy")} className="text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 transition-colors">
              Privacy Policy
            </button>
            <button onClick={() => onNavigate("terms")} className="text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 transition-colors">
              Terms &amp; Conditions
            </button>
            <button onClick={() => onNavigate("refunds")} className="text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-300 transition-colors">
              Refund Policy
            </button>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-6 mb-8 shadow-xs">
        <h2 className="font-semibold text-slate-900 dark:text-zinc-100 text-base mb-4 flex items-center gap-2">
          <span className="text-cyan-600 dark:text-cyan-400">✦</span> Contact & Support
        </h2>
        <div className="space-y-3">
          {[
            { label: "General enquiries", value: "ddhruvgnayak@gmail.com", href: "mailto:ddhruvgnayak@gmail.com", lightColor: "#0284c7", darkColor: "#00E5FF" },
            { label: "Instagram",         value: "@teamcodelocked",        href: "https://www.instagram.com/teamcodelocked/", lightColor: "#d97706", darkColor: "#f59e0b" },
            { label: "GitHub",            value: "@Dhruv2991",            href: "https://github.com/Dhruv2991", lightColor: "#334155", darkColor: "#e4e4e7" },
          ].map(({ label, value, href, lightColor, darkColor }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-zinc-800/60 last:border-0">
              <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-500 uppercase tracking-widest">{label}</span>
              <a href={href} target="_blank" rel="noopener noreferrer"
                className="text-xs font-mono text-slate-700 dark:text-zinc-200 hover:opacity-80 transition-opacity">
                {value}
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Back button */}
      <div className="text-center">
        <button
          onClick={() => onNavigate("home")}
          className="text-xs font-mono text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 transition-colors"
        >
          ← Back to home
        </button>
      </div>
    </div>
  );
}
