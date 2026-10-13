import { Metadata } from 'next';
import { Suspense } from 'react';
import UnsubscribeClient from '@/components/unsubscribe/UnsubscribeClient';

export const metadata: Metadata = {
  title: 'Email Unsubscribe · BitByBit',
  description: 'Manage your email preferences and opt out of promotional communications from Bit by Bit.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function UnsubscribePage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-200 flex flex-col justify-between selection:bg-cyan-500/20 selection:text-cyan-400">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-8 shadow-sm text-center">
              <div className="w-8 h-8 border-2 border-sky-600 dark:border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="font-mono text-xs text-slate-500 dark:text-slate-400">Loading email preferences...</p>
            </div>
          </div>
        }
      >
        <UnsubscribeClient />
      </Suspense>
    </div>
  );
}
