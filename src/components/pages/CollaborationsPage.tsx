'use client';
// ════════════════════════════════════════════════════════════
// src/components/pages/CollaborationsPage.tsx
// Public-facing Collaborations & Partnerships Page
// ════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '@/lib/supabase';
import CollaborationsContentRenderer from '@/components/collaborations/CollaborationsContentRenderer';
import type { CollaborationsPageData } from '@/types/collaborations';

interface Props {
  onNavigate?: (page: string) => void;
}

const FALLBACK_DATA: CollaborationsPageData = {
  title: 'Our Collaborations & Partnerships',
  content: `<h2>Empowering Developers Together</h2>
<p>BitByBit collaborates with top collegiate developer clubs, technical organizations, and industry partners to host competitive programming arenas, hackathons, and structured learning cohorts.</p>

<h3>Why Partner With BitByBit?</h3>
<ul>
  <li><strong>High Engagement:</strong> Direct access to an active community of skilled problem solvers and engineers.</li>
  <li><strong>Custom Arena Competitions:</strong> Turnkey proctored coding assessments tailored to your college or organization.</li>
  <li><strong>Verified Credentials:</strong> Issue cryptographically verifiable certificates with activity points recognition.</li>
</ul>

<p>Interested in organizing an event or partnering with BitByBit? Contact our team at <a href="mailto:teamcodelocked@gmail.com">teamcodelocked@gmail.com</a>.</p>`,
};

export default function CollaborationsPage({ onNavigate }: Props) {
  const [data, setData] = useState<CollaborationsPageData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadContent() {
      setLoading(true);
      setError(null);
      try {
        const supabase = getSupabaseClient();
        // eslint-disable-next-line
        const { data: dbData, error: dbError } = await (supabase.from('collaborations_page') as any)
          .select('id, title, content, updated_at')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (dbError) {
          // Fallback to API route
          const res = await fetch('/api/collaborations');
          const json = await res.json();
          if (isMounted) {
            setData(json.data || FALLBACK_DATA);
          }
        } else if (isMounted) {
          setData(dbData || FALLBACK_DATA);
        }
      } catch (err: any) {
        console.warn('Failed to load collaborations data, using fallback:', err);
        if (isMounted) {
          setData(FALLBACK_DATA);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadContent();

    return () => {
      isMounted = false;
    };
  }, []);

  const formattedDate = data?.updated_at
    ? new Date(data.updated_at).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })
    : 'Recent';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-24 animate-fade-up">
      {/* ── Top Breadcrumbs / Back ── */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-zinc-500">
          {onNavigate ? (
            <button
              onClick={() => onNavigate('home')}
              className="hover:text-slate-800 dark:hover:text-zinc-300 transition-colors"
            >
              Home
            </button>
          ) : (
            <Link href="/" className="hover:text-slate-800 dark:hover:text-zinc-300 transition-colors">
              Home
            </Link>
          )}
          <span>/</span>
          <span className="text-slate-700 dark:text-zinc-300">Collaborations</span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 font-mono text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-pulse" />
          <span>Ecosystem &amp; Partners</span>
        </div>
      </div>

      {/* ── Hero Banner ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-50 via-white to-slate-100 dark:from-zinc-900/90 dark:via-zinc-900/60 dark:to-zinc-950 border border-slate-200 dark:border-zinc-800/80 p-8 sm:p-12 mb-8 shadow-xs">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-white/80 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700/60 text-slate-700 dark:text-zinc-300 font-mono text-xs mb-4 shadow-xs">
            <span>🤝 Community &amp; Institutional Outreach</span>
          </div>

          <h1 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-slate-900 dark:text-zinc-100 tracking-tight leading-[1.15] mb-4">
            {loading ? (
              <span className="inline-block w-3/4 h-10 bg-slate-200 dark:bg-zinc-800/60 animate-pulse rounded-lg" />
            ) : (
              data?.title || 'Our Collaborations & Partnerships'
            )}
          </h1>

          <p className="text-slate-600 dark:text-zinc-400 text-sm sm:text-base leading-relaxed font-sans max-w-xl">
            Building meaningful developer ecosystems across colleges, coding communities, and tech organizations through shared contests, workshops, and verified credentials.
          </p>

          <div className="flex flex-wrap items-center gap-4 mt-6 pt-4 border-t border-slate-200/80 dark:border-zinc-800/60 text-xs font-mono text-slate-500 dark:text-zinc-500">
            <span>⚡ Last updated: {formattedDate}</span>
            <span>·</span>
            <span>📍 TeamCodeLocked</span>
          </div>
        </div>
      </div>

      {/* ── Value Pillar Chips ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-8">
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800/80 hover:border-slate-300 dark:hover:border-zinc-700/80 transition-all flex items-start gap-3.5 shadow-xs">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0 text-base">
            🏆
          </div>
          <div>
            <h4 className="text-xs font-mono font-bold text-slate-900 dark:text-zinc-200">Custom Arena Contests</h4>
            <p className="text-[11px] text-slate-500 dark:text-zinc-500 font-sans mt-0.5">Turnkey proctored assessments for college fests &amp; clubs.</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800/80 hover:border-slate-300 dark:hover:border-zinc-700/80 transition-all flex items-start gap-3.5 shadow-xs">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 text-base">
            📜
          </div>
          <div>
            <h4 className="text-xs font-mono font-bold text-slate-900 dark:text-zinc-200">Verifiable Credentials</h4>
            <p className="text-[11px] text-slate-500 dark:text-zinc-500 font-sans mt-0.5">Instant PDF certificates with QR verification &amp; activity points.</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800/80 hover:border-slate-300 dark:hover:border-zinc-700/80 transition-all flex items-start gap-3.5 shadow-xs">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 text-base">
            🌐
          </div>
          <div>
            <h4 className="text-xs font-mono font-bold text-slate-900 dark:text-zinc-200">Developer Reach</h4>
            <p className="text-[11px] text-slate-500 dark:text-zinc-500 font-sans mt-0.5">Connect with passionate competitive programmers &amp; devs.</p>
          </div>
        </div>
      </div>

      {/* ── Main Dynamic Content Body ── */}
      <div className="bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-zinc-800/90 rounded-3xl p-6 sm:p-10 shadow-xs mb-8 relative">
        {loading ? (
          <div className="space-y-4 py-8 animate-pulse">
            <div className="h-6 bg-slate-200 dark:bg-zinc-800/60 rounded-md w-1/3" />
            <div className="h-4 bg-slate-200 dark:bg-zinc-800/40 rounded-md w-full" />
            <div className="h-4 bg-slate-200 dark:bg-zinc-800/40 rounded-md w-5/6" />
            <div className="h-4 bg-slate-200 dark:bg-zinc-800/40 rounded-md w-4/6" />
            <div className="h-32 bg-slate-100 dark:bg-zinc-850/50 rounded-2xl w-full my-6 border border-slate-200 dark:border-zinc-800/50" />
            <div className="h-4 bg-slate-200 dark:bg-zinc-800/40 rounded-md w-full" />
            <div className="h-4 bg-slate-200 dark:bg-zinc-800/40 rounded-md w-3/4" />
          </div>
        ) : error ? (
          <div className="text-center py-12 space-y-3 font-mono">
            <span className="text-3xl">⚠️</span>
            <p className="text-rose-500 dark:text-rose-400 text-sm">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 text-xs rounded-lg hover:border-cyan-500 transition-colors shadow-xs"
            >
              Retry Loading
            </button>
          </div>
        ) : (
          <CollaborationsContentRenderer content={data?.content || ''} />
        )}
      </div>

      {/* ── Bottom Call To Action / Contact Card ── */}
      <div className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-gradient-to-r dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xs">
        <div className="space-y-1.5 text-center sm:text-left">
          <h3 className="font-display font-bold text-lg text-slate-900 dark:text-zinc-100">
            Want to collaborate on an upcoming event?
          </h3>
          <p className="text-xs font-mono text-slate-600 dark:text-zinc-400">
            We actively support college hackathons, technical symposiums, and coding clubs.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <a
            href="mailto:teamcodelocked@gmail.com?subject=Partnership%20Inquiry%20-%20BitByBit"
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white dark:from-cyan-400 dark:to-cyan-500 dark:text-zinc-950 font-mono font-bold text-xs transition-all shadow-xs active:scale-95"
          >
            ✉️ Contact Partnerships
          </a>
        </div>
      </div>

      {/* ── Bottom Back Navigation ── */}
      <div className="text-center mt-10">
        {onNavigate ? (
          <button
            onClick={() => onNavigate('home')}
            className="text-xs font-mono text-slate-500 dark:text-zinc-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
          >
            ← Back to Homepage
          </button>
        ) : (
          <Link
            href="/"
            className="text-xs font-mono text-slate-500 dark:text-zinc-500 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
          >
            ← Back to Homepage
          </Link>
        )}
      </div>
    </div>
  );
}
