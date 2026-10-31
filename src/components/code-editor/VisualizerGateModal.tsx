// ════════════════════════════════════════════════════════════
// src/components/code-editor/VisualizerGateModal.tsx
// Tiered visualizer quota & upgrade modal.
// ════════════════════════════════════════════════════════════

import { useEffect } from 'react';
import { msUntilMidnight } from '@/lib/visualizer';
import { PRICING_CONFIG, formatPrice } from '@/lib/pricing';

interface VisualizerGateModalProps {
  reason:    'free_limit_reached' | 'pro_limit_reached' | 'not_subscriber';
  used?:     number;
  limit?:    number;
  onClose:   () => void;
  onUpgrade: () => void;
}

function IconFlash() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-cyan-400">
      <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12.5L13 2z"/>
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7 text-amber-400">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

export default function VisualizerGateModal({
  reason,
  used = 5,
  limit = 5,
  onClose,
  onUpgrade,
}: VisualizerGateModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isProLimit = reason === 'pro_limit_reached';
  const resetsIn = msUntilMidnight();

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800/90 rounded-2xl shadow-xl overflow-hidden animate-fade-up text-slate-900 dark:text-zinc-100"
      >
        {/* Accent Bar */}
        <div
          className={`h-1.5 w-full ${
            isProLimit
              ? 'bg-gradient-to-r from-amber-500 to-orange-500'
              : 'bg-gradient-to-r from-cyan-500 via-sky-500 to-blue-500'
          }`}
        />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-start gap-4 mb-5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                isProLimit
                  ? 'bg-amber-500/10 border border-amber-500/20'
                  : 'bg-cyan-500/10 border border-cyan-500/25'
              }`}
            >
              {isProLimit ? <IconClock /> : <IconFlash />}
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-slate-900 dark:text-zinc-100 mb-1">
                {isProLimit ? 'Daily Pro Limit Reached' : 'Daily Free Runs Exhausted'}
              </h2>
              <p className="text-xs font-mono text-slate-600 dark:text-zinc-400 leading-relaxed">
                {isProLimit
                  ? `You have reached the fair-use limit of ${limit} Pro visualizer runs for today.`
                  : `You've used all ${limit} free visualizer runs for today. Upgrade to Pro for 50 runs/day.`}
              </p>
            </div>
          </div>

          {/* Quota tracker */}
          <div className="mb-5 bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/60 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2 font-mono text-xs">
              <span className="text-slate-600 dark:text-zinc-400">Runs used today</span>
              <span className={`font-bold ${isProLimit ? 'text-amber-600 dark:text-amber-400' : 'text-cyan-600 dark:text-cyan-400'}`}>
                {used} / {limit}
              </span>
            </div>
            <div className="h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isProLimit
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 w-full'
                    : 'bg-gradient-to-r from-cyan-500 to-sky-500 w-full'
                }`}
              />
            </div>
            <p className="font-mono text-[10.5px] text-slate-500 dark:text-zinc-500 mt-2">
              Credits automatically refill in{' '}
              <span className="text-slate-800 dark:text-zinc-300 font-bold">{resetsIn}</span> (at midnight).
            </p>
          </div>

          {/* Pro Perks Box (shown for free tier exhaustion) */}
          {!isProLimit && (
            <div className="mb-5 bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[11px] font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">
                  ✦ BitByBit Pro Tier
                </span>
                <span className="font-mono text-xs font-bold text-cyan-700 dark:text-cyan-200 bg-cyan-500/15 px-2 py-0.5 rounded-full border border-cyan-500/30">
                  {formatPrice(PRICING_CONFIG.defaultMonthlyFee)} / {PRICING_CONFIG.periodUnit}
                </span>
              </div>
              {[
                '50 Visualizer runs every day (10× capacity)',
                'Full step-debugging for Python, JS, C++, Java, Go, Rust',
                'Verified Cryptographic Certificates on completion',
                'Permanent free entry to all weekly contests & arenas',
              ].map((perk, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-cyan-600 dark:text-cyan-400 text-xs mt-0.5 shrink-0 font-bold">✓</span>
                  <span className="font-mono text-xs text-slate-700 dark:text-zinc-300 leading-snug">{perk}</span>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl font-mono text-xs font-semibold text-slate-700 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 hover:text-slate-900 dark:hover:text-zinc-200 transition-all"
            >
              {isProLimit ? 'Understood' : 'Maybe Later'}
            </button>
            {!isProLimit && (
              <button
                id="modal-upgrade-btn"
                onClick={onUpgrade}
                className="flex-1 py-2.5 rounded-xl font-mono text-xs font-bold bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white dark:from-cyan-400 dark:to-cyan-500 dark:text-zinc-950 transition-all shadow-xs flex items-center justify-center gap-1.5"
              >
                <span>⚡ Get Pro — {formatPrice(PRICING_CONFIG.defaultMonthlyFee)}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
