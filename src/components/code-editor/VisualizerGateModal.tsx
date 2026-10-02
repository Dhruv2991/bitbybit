'use client';
// ════════════════════════════════════════════════════════════
// src/components/code-editor/VisualizerGateModal.tsx
//
// Modal shown when the user either:
//  (a) isn't a subscriber → prompts them to upgrade
//  (b) exceeded the daily 15-run quota → shows reset time
// ════════════════════════════════════════════════════════════

import { useEffect } from 'react';

interface VisualizerGateModalProps {
  reason:    'not_subscriber' | 'quota_exceeded';
  used?:     number;
  limit?:    number;
  onClose:   () => void;
  /** Navigate to subscription / upgrade page */
  onUpgrade: () => void;
}

function IconFlash() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-indigo-400">
      <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12.5L13 2z"/>
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8 text-amber-400">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}

function IconLock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function msUntilMidnight(): string {
  const now   = new Date();
  const mdn   = new Date(now);
  mdn.setHours(24, 0, 0, 0);
  const ms    = mdn.getTime() - now.getTime();
  const hrs   = Math.floor(ms / 3600000);
  const mins  = Math.floor((ms % 3600000) / 60000);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

export default function VisualizerGateModal({
  reason,
  used  = 0,
  limit = 15,
  onClose,
  onUpgrade,
}: VisualizerGateModalProps) {
  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const isQuota = reason === 'quota_exceeded';
  const resetsIn = msUntilMidnight();
  const pct = Math.round((used / limit) * 100);

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-zinc-950 border border-zinc-800/80 rounded-2xl shadow-2xl overflow-hidden animate-fade-up"
      >
        {/* Top accent gradient */}
        <div className={`h-1 w-full ${isQuota ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-gradient-to-r from-indigo-500 to-violet-500'}`} />

        <div className="p-6">
          {/* Icon + title */}
          <div className="flex items-start gap-4 mb-5">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0
              ${isQuota ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-indigo-500/10 border border-indigo-500/20'}`}>
              {isQuota ? <IconClock /> : <IconFlash />}
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-zinc-100 mb-1">
                {isQuota ? 'Daily limit reached' : 'Subscribers only'}
              </h2>
              <p className="text-sm font-mono text-zinc-400 leading-relaxed">
                {isQuota
                  ? `You've used all ${limit} visualizer runs for today. Quota resets at midnight.`
                  : 'The Logic Visualizer is a premium feature available to BitByBit subscribers.'}
              </p>
            </div>
          </div>

          {/* Quota progress (only for quota_exceeded) */}
          {isQuota && (
            <div className="mb-5 bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2 font-mono text-xs">
                <span className="text-zinc-400">Runs used today</span>
                <span className="text-amber-400 font-bold">{used} / {limit}</span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="font-mono text-[10px] text-zinc-500 mt-2">
                Resets in <span className="text-amber-400 font-bold">{resetsIn}</span>
              </p>
            </div>
          )}

          {/* Feature list (only for not_subscriber) */}
          {!isQuota && (
            <div className="mb-5 bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-4 space-y-2.5">
              {[
                'Step through every line of your Python code',
                'Inspect live variable values at each execution step',
                'Play / Pause / Rewind with full playback controls',
                '15 traces per day included with subscription',
              ].map((feat, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-indigo-400 font-bold text-xs mt-0.5 shrink-0">✓</span>
                  <span className="font-mono text-xs text-zinc-400">{feat}</span>
                </div>
              ))}
            </div>
          )}

          {/* Pricing note (not_subscriber) */}
          {!isQuota && (
            <div className="mb-5 flex items-center gap-3 bg-indigo-500/5 border border-indigo-500/15 rounded-xl px-4 py-3">
              <IconLock />
              <div>
                <p className="font-mono text-xs text-indigo-300 font-bold">₹39 / month</p>
                <p className="font-mono text-[10px] text-zinc-500">Full AI suite + Logic Visualizer + unlimited hints</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl font-mono text-sm text-zinc-400 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200 transition-all"
            >
              {isQuota ? 'Got it' : 'Not now'}
            </button>
            {!isQuota && (
              <button
                onClick={onUpgrade}
                className="flex-1 py-2.5 rounded-xl font-mono text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-lg shadow-indigo-500/20"
              >
                ⚡ Upgrade Now
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
