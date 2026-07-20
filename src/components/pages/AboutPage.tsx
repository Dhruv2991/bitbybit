  "use client";

  /**
   * AboutPage.tsx
   * BitByBit — About & Legal
   * © 2026 Dhruv G Nayak / TeamCodeLocked, BMS College of Engineering
   */

  interface Props {
    onNavigate: (page: string) => void;
  }

  const YEAR = new Date().getFullYear();

  export default function AboutPage({ onNavigate }: Props) {
    return (
      <div className="max-w-3xl mx-auto animate-fade-up py-4 pb-20">

        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#00e87a10] border border-[#00e87a20] mb-5">
            <span className="text-3xl font-display font-black text-[#00e87a]">{'{ }'}</span>
          </div>
          <h1 className="font-display font-black text-3xl md:text-4xl text-[#e2e2e2] mb-3 tracking-tight">
            BitByBit
          </h1>
          <p className="text-[#777] font-mono text-sm max-w-md mx-auto leading-relaxed">
            An AI-powered coding practice and interview preparation platform built for students and developers to improve one problem at a time.
          </p>
        </div>

        {/* About the platform */}
        <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-6 mb-5">
          <h2 className="font-display font-bold text-[#e0e0e0] text-base mb-3 flex items-center gap-2">
            <span className="text-[#00e87a]">✦</span> What is BitByBit?
          </h2>
          <p className="text-[#888] font-mono text-sm leading-relaxed mb-3">
            BitByBit is an AI-powered coding practice and interview preparation platform featuring
            real-time code execution, curated programming challenges, proctored coding assessments,
            AI-assisted learning tools, and community leaderboards designed to help learners improve
            their programming skills.
          </p>
          <p className="text-[#888] font-mono text-sm leading-relaxed">
            Problems are executed securely in-browser or within isolated server environments.
            Subscribers get monthly access (₹39/month) to premium challenges, AI-powered learning features,
            advanced analytics, and proctored coding assessments.
          </p>
        </div>

        {/* Built by */}
        <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-6 mb-5">
          <h2 className="font-display font-bold text-[#e0e0e0] text-base mb-4 flex items-center gap-2">
            <span className="text-[#a78bfa]">✦</span> Built by
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
                className="rounded-full ring-2 ring-[#a78bfa30] object-cover"
                onError={e => { (e.target as HTMLImageElement).src = "https://avatars.githubusercontent.com/u/0"; }}
              />
            </a>
            <div>
              <div className="font-mono font-bold text-[#e0e0e0] text-sm">Dhruv G Nayak</div>
              <div className="text-[#555] font-mono text-[10px] mt-0.5">Dhruv2991</div>
              <a
                href="mailto:ddhruvgnayak@gmail.com"
                className="text-[#a78bfa] font-mono text-[10px] hover:text-[#c4b5fd] transition-colors mt-0.5 block"
              >
                ddhruvgnayak@gmail.com
              </a>
            </div>
          </div>
          <div className="border-t border-[#161616] pt-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#f0b42910] border border-[#f0b42920] flex items-center justify-center shrink-0">
                <span className="text-[#f0b429] text-sm">🏛</span>
              </div>
              <div>
                <div className="font-mono font-bold text-[#e0e0e0] text-sm">TeamCodeLocked</div>
                <div className="text-[#555] font-mono text-[10px]">BMS College of Engineering, Bengaluru</div>
              </div>
              <a
                href="https://www.instagram.com/teamcodelocked/"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5
                  bg-[#f0b42910] border border-[#f0b42920] text-[#f0b429] rounded-lg
                  hover:bg-[#f0b42918] transition-all"
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
        <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-6 mb-5">
          <h2 className="font-display font-bold text-[#e0e0e0] text-base mb-4 flex items-center gap-2">
            <span className="text-[#00e87a]">✦</span> Platform features
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              ["{ }", "Problems library",      "Curated problems with hidden test cases"],
              ["🏅",  "Weekly challenges",     "New problems every week, time bonus scoring"],
              ["🏆",  "Proctored arena", "Live supervised coding assessments with secure proctoring"],
              ["⭐",  "Monthly subscription",  "₹39/month, unlocks weekly access & free contest entry"],
              ["✦",  "AI features",           "Hints, debugger, and code review"],
              ["💬",  "Discussion threads",    "Community discussion on every problem"],
              ["⚡",  "Leaderboard",           "Real-time rankings by points and streak"],
              ["🔒",  "Secure execution",      "Code runs in browser or sandboxed server"],
            ].map(([icon, title, desc]) => (
              <div key={title} className="flex gap-3 items-start p-3 bg-[#060606] rounded-xl border border-[#141414]">
                <span className="text-base shrink-0 mt-0.5 w-5 text-center">{icon}</span>
                <div>
                  <div className="text-xs font-mono font-bold text-[#e0e0e0]">{title}</div>
                  <div className="text-[10px] font-mono text-[#555] mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Payments & Subscription */}
<div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-6 mb-5">
  <h2 className="font-display font-bold text-[#e0e0e0] text-base mb-3 flex items-center gap-2">
    <span className="text-[#00e87a]">✦</span> Payments &amp; Subscription
  </h2>

  <div className="space-y-2 text-[#888] font-mono text-xs leading-relaxed">
    <p>
      BitByBit offers a monthly subscription (₹39/month) that unlocks premium educational
      features including weekly coding challenges, AI-powered tools, the complete
      problems library, advanced analytics, and free entry to every proctored coding assessment.
    </p>

    <p>
      Each payment covers 30 days of access. This is a manually-renewed pass, not an
      automatic recurring charge — there's no auto-debit or standing mandate, so nothing
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

        {/* Tech stack */}
        {/* <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-6 mb-5">
          <h2 className="font-display font-bold text-[#e0e0e0] text-base mb-4 flex items-center gap-2">
            <span className="text-[#f0b429]">✦</span> Tech stack
          </h2>
          <div className="flex flex-wrap gap-2">
            {[
              "Next.js 14", "TypeScript", "Tailwind CSS",
              "Supabase", "Monaco Editor", "Pyodide",
              "Groq AI", "GitHub OAuth", "Vercel",
            ].map(tech => (
              <span key={tech}
                className="px-3 py-1 bg-[#111] border border-[#1f1f1f] rounded-lg text-[10px] font-mono text-[#777]">
                {tech}
              </span>
            ))}
          </div>
        </div> */}

        {/* Legal / Copyright */}
        <div className="bg-[#0a0a0a] border border-[#ff4d4d20] rounded-2xl p-6 mb-5">
          <h2 className="font-display font-bold text-[#e0e0e0] text-base mb-4 flex items-center gap-2">
            <span className="text-[#ff6b6b]">✦</span> Copyright & Legal
          </h2>

          <div className="space-y-3 text-[#888] font-mono text-xs leading-relaxed">
            <p>
              <span className="text-[#e0e0e0] font-bold">
                © {YEAR} Dhruv G Nayak. All rights reserved.
              </span>
            </p>
            <p>
              BitByBit — including its source code, design, problem content, UI components,
              AI integration, scoring system, and all associated intellectual property — is the
              exclusive property of <span className="text-[#e0e0e0]">Dhruv G Nayak</span> and
              <span className="text-[#e0e0e0]"> TeamCodeLocked, BMS College of Engineering</span>.
            </p>
            <p>
              <span className="text-[#ff6b6b] font-bold">Unauthorized copying, reproduction, modification,
              distribution, or use of this platform or any part of it — in whole or in part —
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
            <div className="border-t border-[#1f1f1f] pt-3 mt-3">
              <p className="text-[#555]">
                For licensing inquiries, collaborations, or permissions:
                {" "}<a href="mailto:ddhruvgnayak@gmail.com"
                  className="text-[#a78bfa] hover:text-[#c4b5fd] transition-colors">
                  ddhruvgnayak@gmail.com
                </a>
              </p>
            </div>
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[#1f1f1f]">
              <button onClick={() => onNavigate("privacy")} className="text-[10px] font-mono text-[#00e87a] hover:text-[#00ff88] transition-colors">
                Privacy Policy
              </button>
              <button onClick={() => onNavigate("terms")} className="text-[10px] font-mono text-[#00e87a] hover:text-[#00ff88] transition-colors">
                Terms &amp; Conditions
              </button>
              <button onClick={() => onNavigate("refunds")} className="text-[10px] font-mono text-[#00e87a] hover:text-[#00ff88] transition-colors">
                Refund Policy
              </button>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="bg-[#0a0a0a] border border-[#161616] rounded-2xl p-6 mb-8">
          <h2 className="font-display font-bold text-[#e0e0e0] text-base mb-4 flex items-center gap-2">
            <span className="text-[#00e87a]">✦</span> Contact & Support
          </h2>
          <div className="space-y-3">
            {[
              { label: "General enquiries", value: "ddhruvgnayak@gmail.com", href: "mailto:ddhruvgnayak@gmail.com", color: "#a78bfa" },
              { label: "Instagram",         value: "@teamcodelocked",        href: "https://www.instagram.com/teamcodelocked/", color: "#f0b429" },
              { label: "GitHub",            value: "@Dhruv2991",            href: "https://github.com/Dhruv2991", color: "#e0e0e0" },
            ].map(({ label, value, href, color }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-[#141414] last:border-0">
                <span className="text-[10px] font-mono text-[#555] uppercase tracking-widest">{label}</span>
                <a href={href} target="_blank" rel="noopener noreferrer"
                  style={{ color }}
                  className="text-xs font-mono hover:opacity-80 transition-opacity">
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
            className="text-xs font-mono text-[#555] hover:text-[#00e87a] transition-colors"
          >
            ← Back to home
          </button>
        </div>
      </div>
    );
  }