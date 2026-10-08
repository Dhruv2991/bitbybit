'use client';

import { useState, useRef, useEffect } from 'react';
import SpotlightCard from '@/components/ui/SpotlightCard';

interface ProShowcaseProps {
  onNavigate: (page: string) => void;
  isSubscriber?: boolean;
}

/* ── Subtle ambient illumination inside the CTA card ─────────────────── */
function AuroraBg() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      <div
        className="absolute -top-16 -left-16 w-56 h-56 rounded-full opacity-15 dark:opacity-20 blur-3xl pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(6,182,212,0.3) 0%, rgba(14,165,233,0.15) 60%, transparent 80%)',
        }}
      />
      <div
        className="absolute -bottom-16 -right-16 w-56 h-56 rounded-full opacity-10 dark:opacity-15 blur-3xl pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(14,165,233,0.25) 0%, rgba(59,130,246,0.1) 60%, transparent 80%)',
        }}
      />
    </div>
  );
}

/* ── Single perk card ───────────────────────────────────────────────────── */
interface PerkCardProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
  accentHex: string;
  spotlightColor: string;
  delay?: number;
}

function PerkCard({ icon, title, desc, badge, accentHex, spotlightColor, delay = 0 }: PerkCardProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold: 0.12 }
    );
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="transition-all duration-700"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transitionDelay: `${delay}ms`,
      }}
    >
      <SpotlightCard spotlightColor={spotlightColor} className="p-5 rounded-2xl h-full group cursor-default flex flex-col gap-3.5 border border-slate-200/90 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/40">
        {/* Icon + badge */}
        <div className="flex items-start justify-between">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-slate-200/80 dark:border-white/[0.07] group-hover:scale-105 transition-transform duration-200"
            style={{ background: `${accentHex}14` }}
          >
            {icon}
          </div>
          {badge && (
            <span
              className="text-[10px] font-mono font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full border"
              style={{ color: accentHex, background: `${accentHex}10`, borderColor: `${accentHex}30` }}
            >
              {badge}
            </span>
          )}
        </div>

        <div>
          <h3 className="font-sans font-semibold text-[14px] text-slate-900 dark:text-zinc-100 mb-1.5 leading-snug group-hover:text-cyan-600 dark:group-hover:text-white transition-colors">
            {title}
          </h3>
          <p className="text-[12px] text-slate-600 dark:text-zinc-400 leading-relaxed">{desc}</p>
        </div>

        {/* Hover accent bar */}
        <div
          className="mt-auto h-px w-full rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ background: `linear-gradient(90deg, transparent, ${accentHex}55, transparent)` }}
        />
      </SpotlightCard>
    </div>
  );
}

/* ── Comparison table row ───────────────────────────────────────────────── */
function FeatureRow({ label, free, pro }: { label: string; free: string | boolean; pro: string | boolean }) {
  function Cell({ val }: { val: string | boolean }) {
    if (val === true)  return <span className="text-emerald-600 dark:text-emerald-400 text-[15px] leading-none font-semibold">✓</span>;
    if (val === false) return <span className="text-slate-400 dark:text-zinc-600 text-[15px] leading-none">—</span>;
    return <span className="text-[11px] font-mono text-slate-700 dark:text-zinc-300 text-center font-medium">{val}</span>;
  }
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-2.5 border-b border-slate-200/70 dark:border-white/[0.04] last:border-0 px-2 -mx-2 rounded-lg hover:bg-slate-100/60 dark:hover:bg-white/[0.025] transition-colors group">
      <span className="text-[13px] font-sans text-slate-700 dark:text-zinc-400 group-hover:text-slate-900 dark:group-hover:text-zinc-200 transition-colors">{label}</span>
      <div className="w-14 flex justify-center"><Cell val={free} /></div>
      <div className="w-14 flex justify-center"><Cell val={pro} /></div>
    </div>
  );
}

/* ── Main export ────────────────────────────────────────────────────────── */
export default function ProShowcase({ onNavigate, isSubscriber = false }: ProShowcaseProps) {
  /* ---------- data ---------- */
  const perks: PerkCardProps[] = [
    {
      icon: (
        <svg className="w-5 h-5 text-cyan-600 dark:text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
        </svg>
      ),
      title: 'Line-by-Line Logic Visualizer',
      desc: 'Step through every execution tick — variables, call stack, and stdout — to understand exactly why your code fails.',
      badge: 'Interactive',
      accentHex: '#0891b2',
      spotlightColor: 'rgba(8,145,178,0.08)',
    },
    {
      icon: (
        <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4M7 8l2 2 4-4" />
        </svg>
      ),
      title: 'BMSCE & CodeLocked Certificates',
      desc: 'Auto-generated PDFs with unique QR-verified IDs — officially recognized by BMSCE for activity points.',
      badge: 'Official',
      accentHex: '#d97706',
      spotlightColor: 'rgba(217,119,6,0.08)',
    },
    {
      icon: (
        <svg className="w-5 h-5 text-sky-600 dark:text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      ),
      title: 'Priority Arena Access',
      desc: 'Free contest entry, real-time leaderboard, and post-contest analytics — no separate fee, ever.',
      badge: 'Pro',
      accentHex: '#0284c7',
      spotlightColor: 'rgba(2,132,199,0.08)',
    },
    {
      icon: (
        <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
          <path d="m4.93 10.93 1.41 1.41M2 18h2M20 18h2m-1.93-7.07-1.41 1.41M22 22H2m6-4 4-10 4 10" />
        </svg>
      ),
      title: 'Advanced AI Code Coach',
      desc: 'Higher daily limits for hints, code reviews, editorial generation, and approach validation — all powered by Groq LLM.',
      badge: 'AI Powered',
      accentHex: '#0d9488',
      spotlightColor: 'rgba(13,148,136,0.08)',
    },
  ];

  const features = [
    { label: 'Problem Set Access',          free: true,       pro: true           },
    { label: 'In-Browser Code Execution',   free: true,       pro: true           },
    { label: 'AI Hints & Debugger (daily)', free: 'Limited',  pro: 'Higher limits' },
    { label: 'Weekly Challenges',           free: false,      pro: true           },
    { label: 'Arena Contest Entry',         free: false,      pro: 'Free entry'   },
    { label: 'Logic Visualizer',            free: false,      pro: true           },
    { label: 'Verified Certificates',       free: false,      pro: true           },
    { label: 'AI Editorial Generation',     free: false,      pro: true           },
  ];

  /* ---------- scroll-reveal for whole section ---------- */
  const [sectionIn, setSectionIn] = useState(false);
  const secRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setSectionIn(true); },
      { threshold: 0.06 }
    );
    if (secRef.current) io.observe(secRef.current);
    return () => io.disconnect();
  }, []);

  /* ---------- render ---------- */
  return (
    <div
      ref={secRef}
      className="mb-8 transition-all duration-700"
      style={{ opacity: sectionIn ? 1 : 0, transform: sectionIn ? 'translateY(0)' : 'translateY(24px)' }}
    >
      {/* ── Section header ─────────────────────────────── */}
      <div className="flex items-start sm:items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-wider uppercase bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
              ✦ BitByBit Pro
            </span>
            {isSubscriber && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                Active
              </span>
            )}
          </div>
          <h2 className="font-display font-medium text-base sm:text-lg text-slate-900 dark:text-zinc-100 tracking-tight">
            Everything you need to level up
          </h2>
          <p className="font-sans text-xs text-slate-500 dark:text-zinc-500 mt-0.5">₹39/month · cancel anytime · all features, no hidden fees</p>
        </div>

        {/* Header CTA — only shown to non-subscribers */}
        {!isSubscriber && (
          <button
            id="pro-upgrade-header-btn"
            onClick={() => onNavigate('subscribe')}
            className="group relative inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-mono font-semibold text-[13px] text-white bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 dark:from-cyan-500 dark:dark:to-cyan-600 dark:text-slate-950 shadow-sm transition-all duration-150 shrink-0 active:scale-[0.98]"
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            Upgrade to Pro
          </button>
        )}

        {isSubscriber && (
          <button
            onClick={() => onNavigate('profile')}
            className="btn-ghost text-xs px-4 py-2 flex items-center gap-2 shrink-0 border border-slate-200 dark:border-slate-800"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            Manage Subscription
          </button>
        )}
      </div>

      {/* ── Perk cards ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
        {perks.map((perk, i) => (
          <PerkCard key={perk.title} {...perk} delay={i * 80} />
        ))}
      </div>

      {/* ── Comparison table + pricing CTA ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Comparison table */}
        <div className="lg:col-span-3">
          <SpotlightCard spotlightColor="rgba(8,145,178,0.05)" className="p-5 sm:p-6 rounded-2xl h-full border border-slate-200/90 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/40">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 pb-2.5 mb-1 border-b border-slate-200/80 dark:border-white/[0.06]">
              <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-500 uppercase tracking-wider font-semibold">Feature</span>
              <div className="w-14 text-center">
                <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-500 uppercase tracking-wider font-semibold">Free</span>
              </div>
              <div className="w-14 text-center">
                <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400 uppercase tracking-wider font-semibold">Pro</span>
              </div>
            </div>
            {features.map((f) => (
              <FeatureRow key={f.label} {...f} />
            ))}
          </SpotlightCard>
        </div>

        {/* Pricing CTA card */}
        <div className="lg:col-span-2">
          <SpotlightCard spotlightColor="rgba(8,145,178,0.08)" className="p-5 sm:p-6 rounded-2xl h-full flex flex-col relative overflow-hidden border border-slate-200/90 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/40">
            <AuroraBg />

            <div className="relative z-10 flex flex-col h-full">
              {/* Badge + price */}
              <div className="mb-5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-mono text-cyan-600 dark:text-cyan-400 font-semibold tracking-wider uppercase mb-4">
                  ✦ BitByBit Pro
                </div>
                <div className="flex items-end gap-1 mb-1">
                  <span className="font-display font-bold text-4xl sm:text-5xl text-slate-900 dark:text-zinc-100 tracking-tight leading-none">₹39</span>
                  <span className="text-slate-500 dark:text-zinc-400 font-sans text-sm mb-1.5">/month</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-500 font-sans">Billed monthly · cancel anytime</p>
              </div>

              {/* Feature list */}
              <ul className="flex-1 space-y-2.5 mb-6">
                {[
                  { icon: '🧠', text: 'Logic Visualizer — step debugger' },
                  { icon: '🏅', text: 'Official verified certificates' },
                  { icon: '⚡', text: 'Free contest entry, forever' },
                  { icon: '✦',  text: 'Advanced AI coaching limits'  },
                  { icon: '📈', text: 'Weekly challenge access'       },
                ].map((item) => (
                  <li key={item.text} className="flex items-center gap-2.5">
                    <span className="text-[15px] leading-none shrink-0">{item.icon}</span>
                    <span className="text-[12.5px] font-sans text-slate-700 dark:text-zinc-300">{item.text}</span>
                  </li>
                ))}
              </ul>

              {/* CTA buttons */}
              <div className="flex flex-col gap-2.5">
                {isSubscriber ? (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse shrink-0" />
                    <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-medium">Pro subscription is active</span>
                  </div>
                ) : (
                  <>
                    <button
                      id="pro-upgrade-cta"
                      onClick={() => onNavigate('subscribe')}
                      className="w-full py-3 rounded-xl font-mono font-semibold text-sm text-white bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 dark:from-cyan-500 dark:to-cyan-600 dark:text-slate-950 shadow-sm transition-all duration-150 active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                      Get BitByBit Pro
                    </button>
                    <button
                      onClick={() => onNavigate('subscribe')}
                      className="w-full py-2.5 rounded-xl font-mono text-xs text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 border border-slate-200 dark:border-zinc-800/80 hover:border-slate-300 dark:hover:border-zinc-700 bg-transparent hover:bg-slate-100/60 dark:hover:bg-zinc-800/30 transition-all"
                    >
                      View pricing details →
                    </button>
                  </>
                )}
              </div>
            </div>
          </SpotlightCard>
        </div>
      </div>
    </div>
  );
}


