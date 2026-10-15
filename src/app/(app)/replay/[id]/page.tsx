'use client';
// ════════════════════════════════════════════════════════════
// src/app/(app)/replay/[id]/page.tsx
// Public share route for replaying an algorithmic solution's evolution
// ════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Layers,
  Clock,
  GitBranch,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sparkles,
  ArrowLeft,
  Share2,
  Check,
  Code2,
  ExternalLink,
  Flame,
  AlertCircle
} from 'lucide-react';
import ReplayPlayer from '@/components/workspace/ReplayPlayer';
import type { ProblemTimeline } from '@/types/database';

export default function ReplaySharePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<ProblemTimeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (!id) return;

    async function fetchTimeline() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/timeline/${id}`);
        const data = await res.json();
        if (!res.ok || !data.timeline) {
          setError(data.error || 'Timeline replay not found or may have expired.');
        } else {
          setTimeline(data.timeline);
        }
      } catch (err: any) {
        setError('Network error while loading timeline replay.');
      } finally {
        setLoading(false);
      }
    }

    fetchTimeline();
  }, [id]);

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Algorithmic Solution Replay: ${timeline?.problem_title || 'BitByBit'}`,
          text: `Check out the step-by-step logic evolution for ${timeline?.problem_title || 'this problem'} on BitByBit!`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setShared(true);
        setTimeout(() => setShared(false), 2500);
      }
    } catch {}
  };

  function formatDuration(seconds: number): string {
    if (!seconds || seconds < 60) return `${seconds || 0}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  }

  // Calculate detailed summary metrics from snapshots
  const summaryMetrics = timeline ? (() => {
    let refactors = 0;
    let testsPassed = 0;
    let testsFailed = 0;
    let deadEnds = 0;

    timeline.snapshots?.forEach((snap) => {
      if (snap.eventType === 'edit') refactors++;
      else if (snap.eventType === 'test_passed') testsPassed++;
      else if (snap.eventType === 'test_failed') testsFailed++;
      else if (snap.eventType === 'reset') deadEnds++;
    });

    return {
      duration: formatDuration(timeline.duration_seconds),
      refactors,
      testsPassed,
      testsFailed,
      deadEnds,
      totalSnapshots: timeline.snapshots?.length || 0,
      language: timeline.snapshots?.[0]?.language || 'python',
    };
  })() : null;

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-500 animate-pulse mb-4">
          <Layers className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold font-display text-slate-900 dark:text-white mb-1">
          Loading Logic Replay…
        </h2>
        <p className="text-xs font-mono text-slate-500 dark:text-zinc-400">
          Decompressing chronological solution snapshots
        </p>
      </div>
    );
  }

  if (error || !timeline) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mb-4">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold font-display text-slate-900 dark:text-white mb-2">
          Replay Not Found
        </h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mb-6">
          {error || 'This problem-solving timeline does not exist or has been removed.'}
        </p>
        <Link
          href="/problems"
          className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-sm transition shadow"
        >
          Explore Problem Workspace
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* ── Breadcrumb & Back Link ── */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <Link
          href="/problems"
          className="inline-flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-zinc-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Problem Archive</span>
        </Link>

        <div className="flex items-center gap-2">
          {timeline.problem_id && (
            <Link
              href={`/problems?p=${timeline.problem_id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 transition"
            >
              <span>Solve Problem</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}

          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black transition shadow"
          >
            {shared ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{shared ? 'Link Copied!' : 'Share Replay'}</span>
          </button>
        </div>
      </div>

      {/* ── Session Summary Header Card ── */}
      <div className="mb-6 p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                Logic Time-Lapse
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                {summaryMetrics?.language}
              </span>
              <span className="text-xs text-slate-400 dark:text-zinc-500 font-mono">
                {new Date(timeline.created_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
              {timeline.problem_title || timeline.problem_id}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400 font-mono">
              Solution evolution by{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                @{timeline.user_github || timeline.user_name || 'anonymous'}
              </span>
            </p>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/60">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 mb-1">
                <Clock className="w-3.5 h-3.5 text-cyan-500" />
                <span>Time Spent</span>
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">
                {summaryMetrics?.duration}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/60">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 mb-1">
                <GitBranch className="w-3.5 h-3.5 text-purple-500" />
                <span>Refactors</span>
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">
                {summaryMetrics?.refactors}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/60">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 mb-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Tests Passed</span>
              </div>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {summaryMetrics?.testsPassed}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/60">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 mb-1">
                <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                <span>Dead Ends</span>
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">
                {summaryMetrics?.deadEnds}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Interactive Replay Player Component ── */}
      <ReplayPlayer timeline={timeline} standalone={true} />
    </div>
  );
}
