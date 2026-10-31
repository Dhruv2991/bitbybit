'use client';
// ════════════════════════════════════════════════════════════
// src/components/pages/PricingPage.tsx
// Public Pricing & Plan Comparison (Free vs Pro)
// ════════════════════════════════════════════════════════════

import React from 'react';
import SpotlightCard from '@/components/ui/SpotlightCard';
import { PRICING_CONFIG, formatPrice } from '@/lib/pricing';
import { getSupabaseClient } from '@/lib/supabase';
import type { User } from '@/types/database';
import {
  Check,
  X,
  Zap,
  Sparkles,
  ShieldCheck,
  Flame,
  Award,
  Terminal,
  Brain,
  HelpCircle,
  Clock,
  CreditCard,
  ChevronRight,
} from 'lucide-react';

interface PricingPageProps {
  user: User | null;
  onNavigate: (page: string) => void;
}

export default function PricingPage({ user, onNavigate }: PricingPageProps) {
  const isSubscriber = Boolean(user?.is_admin || user?.is_subscriber);
  const formattedPrice = formatPrice(PRICING_CONFIG.defaultMonthlyFee);

  const handleCta = async () => {
    if (!user) {
      const db = getSupabaseClient();
      await db.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/subscribe`,
          queryParams: { prompt: 'select_account' },
        },
      });
      return;
    }
    onNavigate('subscribe');
  };

  const COMPARISON_FEATURES = [
    {
      feature: 'Core Problem Set',
      desc: 'Access to curated algorithmic problem library',
      free: 'Standard Free Problems',
      pro: 'Full Library + Weekly Problems',
    },
    {
      feature: 'Multi-Language Execution',
      desc: 'Python, JavaScript, C++, Java, Go, Rust',
      free: true,
      pro: true,
    },
    {
      feature: 'Logic Visualizer (Step Debugger)',
      desc: 'Interactive AST runtime state execution inspector',
      free: '5 runs / day',
      pro: '50 runs / day (10×)',
    },
    {
      feature: 'Weekly DSA Challenges',
      desc: '3 new challenge problems weekly with time-bonus scoring',
      free: false,
      pro: true,
    },
    {
      feature: 'Arena Proctored Contests',
      desc: 'Live competitive programming assessments with leaderboard',
      free: false,
      pro: 'Free unlimited entry',
    },
    {
      feature: 'AI Code Coach & Hints',
      desc: 'Failure diagnostics, custom hints, and code review',
      free: false,
      pro: 'Full access',
    },
    {
      feature: 'Cryptographic Certificates',
      desc: 'Shareable on LinkedIn, GitHub, and resumes with QR verification',
      free: false,
      pro: true,
    },
    {
      feature: 'Community & Discussions',
      desc: 'Global leaderboard, daily streaks, and discussion threads',
      free: true,
      pro: true,
    },
  ];

  const FAQS = [
    {
      q: 'Is there an automatic recurring charge / auto-debit?',
      a: 'No. BitByBit uses a 100% manually renewed 30-day pass. We do not set up standing mandates, e-mandates, or auto-debits. When your 30 days are up, access simply pauses until you actively choose to renew.',
    },
    {
      q: 'Can I renew early before my 30 days expire?',
      a: 'Yes! Early renewals stack seamlessly on top of your existing expiration date, so you never lose any paid days.',
    },
    {
      q: 'What payment methods are supported?',
      a: 'We accept all major payment methods supported by Razorpay, including UPI (Google Pay, PhonePe, Paytm, CRED), Netbanking, and Indian/International Debit & Credit Cards.',
    },
    {
      q: 'Do I get access to all previous weekly challenges?',
      a: 'Yes. Once subscribed, you have full access to current challenges as well as the complete historical catalog of weekly problems for practice and learning.',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-12 animate-fade-up">
      {/* ── Header ── */}
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-xs font-mono font-medium tracking-wide">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Simple, Honest Pricing</span>
        </div>
        <h1 className="font-display font-bold text-3xl sm:text-4xl text-slate-900 dark:text-zinc-100 tracking-tight">
          Invest in your coding journey.
        </h1>
        <p className="text-sm font-sans text-slate-600 dark:text-zinc-400 leading-relaxed">
          One affordable 30-day pass unlocks full access to weekly challenges, live arena contests, step-by-step logic visualizer, and AI coaching.
        </p>
      </div>

      {/* ── Billing Transparency Banner ── */}
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-mono font-bold text-sm text-slate-900 dark:text-zinc-100">
              30-Day Pass · No Auto-Debit · Renew When You Want
            </h3>
            <p className="text-xs font-sans text-slate-600 dark:text-zinc-400 mt-0.5">
              Zero recurring surprises. No hidden subscriptions or auto-renewal mandates. You pay once for 30 days of access.
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-lg border border-emerald-500/30">
          <span>✓ 100% Manual Renewal</span>
        </div>
      </div>

      {/* ── Pricing Cards Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        {/* Free Plan Card */}
        <SpotlightCard
          spotlightColor="rgba(148, 163, 184, 0.08)"
          className="p-6 sm:p-8 bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl flex flex-col justify-between shadow-xs"
        >
          <div className="space-y-6">
            <div className="space-y-2">
              <span className="font-mono text-xs font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                Free Forever
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-display font-bold text-4xl text-slate-900 dark:text-zinc-100">
                  ₹0
                </span>
                <span className="font-mono text-xs text-slate-500 dark:text-zinc-400">/ forever</span>
              </div>
              <p className="text-xs font-sans text-slate-600 dark:text-zinc-400">
                Essential algorithmic practice for developers and students starting out.
              </p>
            </div>

            <div className="border-t border-slate-100 dark:border-zinc-800 pt-4 space-y-3 font-mono text-xs">
              <p className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase tracking-widest font-semibold">
                Included with Free:
              </p>
              {[
                'Standard algorithmic problem set',
                'In-browser & server code execution',
                '5 Logic Visualizer runs per day',
                'Global leaderboard & streak tracking',
                'Community discussion participation',
              ].map((perk, i) => (
                <div key={i} className="flex items-center gap-2.5 text-slate-700 dark:text-zinc-300">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{perk}</span>
                </div>
              ))}
              {[
                'Weekly challenges with time bonus',
                'Free entry to proctored Arena contests',
                'Verified Cryptographic Certificates',
                'AI Code Coach diagnostics & hints',
              ].map((excluded, i) => (
                <div key={i} className="flex items-center gap-2.5 text-slate-400 dark:text-zinc-600 line-through">
                  <X className="w-4 h-4 text-slate-300 dark:text-zinc-700 shrink-0" />
                  <span>{excluded}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-4">
            <button
              onClick={() => onNavigate('problems')}
              className="w-full py-2.5 rounded-xl font-mono text-xs font-semibold text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800/80 hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors border border-slate-200 dark:border-zinc-700"
            >
              Start Free Practice →
            </button>
          </div>
        </SpotlightCard>

        {/* Pro Plan Card */}
        <SpotlightCard
          spotlightColor="rgba(6, 182, 212, 0.12)"
          className="p-6 sm:p-8 bg-white dark:bg-zinc-900/60 border-2 border-cyan-500/50 dark:border-cyan-500/40 rounded-2xl flex flex-col justify-between relative shadow-md shadow-cyan-500/5"
        >
          <div className="absolute -top-3 right-6 bg-gradient-to-r from-cyan-600 to-sky-600 text-white font-mono text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
            Most Popular
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">
                  ✦ BitByBit Pro Pass
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display font-bold text-4xl text-slate-900 dark:text-zinc-100">
                  {formattedPrice}
                </span>
                <span className="font-mono text-xs text-slate-500 dark:text-zinc-400">/ 30-day pass</span>
              </div>
              <p className="text-xs font-sans text-slate-600 dark:text-zinc-400">
                Complete access to all competitive features, visual debugging, AI tools, and certificates.
              </p>
            </div>

            <div className="border-t border-slate-100 dark:border-zinc-800 pt-4 space-y-3 font-mono text-xs">
              <p className="text-[10px] text-cyan-600 dark:text-cyan-400 uppercase tracking-widest font-semibold">
                Everything in Free, plus:
              </p>
              {[
                '3 new weekly problems with time bonus',
                'Unlimited free entry to all Arena contests',
                '50 Logic Visualizer runs/day (10× capacity)',
                'AI Code Coach hints, review & diagnostics',
                'Official Cryptographic Certificates',
                'Subscriber profile & leaderboard badge',
                'Full history of past challenge sets',
              ].map((perk, i) => (
                <div key={i} className="flex items-center gap-2.5 text-slate-800 dark:text-zinc-200 font-medium">
                  <Check className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                  <span>{perk}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-4">
            <button
              onClick={handleCta}
              className="w-full py-3 rounded-xl font-mono text-sm font-bold text-white bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 shadow-md hover:shadow-cyan-500/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>
                {isSubscriber
                  ? 'Manage / Extend Pro Pass →'
                  : user
                  ? `Get Pro Pass — ${formattedPrice} →`
                  : 'Sign In with GitHub to Subscribe →'}
              </span>
            </button>
            <p className="text-center text-[10px] font-mono text-slate-400 dark:text-zinc-500 mt-2">
              Instant activation · 30-day access · Never auto-debited
            </p>
          </div>
        </SpotlightCard>
      </div>

      {/* ── Feature Comparison Table ── */}
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <h2 className="font-display font-bold text-xl text-slate-900 dark:text-zinc-100">
            Compare Feature Details
          </h2>
          <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">
            A complete side-by-side view of what you get with each tier
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/40">
                  <th className="py-3.5 px-4 sm:px-6 text-slate-800 dark:text-zinc-200 font-bold uppercase text-[11px]">
                    Feature
                  </th>
                  <th className="py-3.5 px-4 text-center text-slate-600 dark:text-zinc-400 font-semibold w-32 sm:w-44">
                    Free Tier
                  </th>
                  <th className="py-3.5 px-4 text-center text-cyan-600 dark:text-cyan-400 font-bold w-36 sm:w-48 bg-cyan-500/5">
                    Pro Pass ({formattedPrice})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                {COMPARISON_FEATURES.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                    <td className="py-3.5 px-4 sm:px-6">
                      <div className="font-semibold text-slate-900 dark:text-zinc-200 font-sans">
                        {row.feature}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono mt-0.5">
                        {row.desc}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {typeof row.free === 'boolean' ? (
                        row.free ? (
                          <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                        ) : (
                          <X className="w-4 h-4 text-slate-300 dark:text-zinc-700 mx-auto" />
                        )
                      ) : (
                        <span className="text-slate-600 dark:text-zinc-400 text-[11px] font-mono">
                          {row.free}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center bg-cyan-500/5">
                      {typeof row.pro === 'boolean' ? (
                        row.pro ? (
                          <Check className="w-4 h-4 text-cyan-600 dark:text-cyan-400 mx-auto font-bold" />
                        ) : (
                          <X className="w-4 h-4 text-slate-300 dark:text-zinc-700 mx-auto" />
                        )
                      ) : (
                        <span className="text-cyan-600 dark:text-cyan-400 font-semibold text-[11px] font-mono">
                          {row.pro}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Frequently Asked Questions ── */}
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <h2 className="font-display font-bold text-xl text-slate-900 dark:text-zinc-100 flex items-center justify-center gap-2">
            <HelpCircle className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            <span>Frequently Asked Questions</span>
          </h2>
          <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">
            Everything you need to know about BitByBit passes and payments
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FAQS.map((faq, i) => (
            <div
              key={i}
              className="p-5 rounded-2xl bg-white dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800/80 shadow-xs space-y-2"
            >
              <h3 className="font-semibold text-sm text-slate-900 dark:text-zinc-100 font-sans">
                {faq.q}
              </h3>
              <p className="text-xs font-mono text-slate-600 dark:text-zinc-400 leading-relaxed">
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom Call To Action ── */}
      <div className="p-8 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 text-white text-center space-y-4 border border-cyan-500/20 shadow-xl">
        <h2 className="font-display font-bold text-2xl tracking-tight">
          Ready to level up your algorithms?
        </h2>
        <p className="text-sm font-sans text-slate-300 max-w-xl mx-auto">
          Join hundreds of developers mastering competitive programming, building verified streaks, and earning certificates.
        </p>
        <div className="pt-2">
          <button
            onClick={handleCta}
            className="px-6 py-3 rounded-xl font-mono text-sm font-bold bg-gradient-to-r from-cyan-400 to-sky-400 hover:from-cyan-300 hover:to-sky-300 text-zinc-950 shadow-md hover:shadow-cyan-400/20 transition-all inline-flex items-center gap-2 cursor-pointer"
          >
            <span>{user ? `Get Started for ${formattedPrice}` : 'Sign In with GitHub to Start'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

