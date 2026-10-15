'use client';
// ════════════════════════════════════════════════════════════
// src/components/workspace/ReplayPlayer.tsx
// Sleek, dual-theme adaptive playback interface for replaying the
// chronological evolution of an algorithmic solution.
// ════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  CheckCircle2,
  XCircle,
  FileCode2,
  Share2,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Sparkles,
  GitBranch,
  Flame,
  Clock,
  Layers,
  Code2,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import type { TimelineSnapshot, SupportedLang, ProblemTimeline } from '@/types/database';

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface ReplayPlayerProps {
  timeline: ProblemTimeline | {
    id?: string;
    problem_id: string;
    problem_title?: string | null;
    user_github?: string | null;
    user_name?: string | null;
    snapshots: TimelineSnapshot[];
    duration_seconds?: number;
    created_at?: string;
  };
  onClose?: () => void;
  standalone?: boolean;
}

const SPEED_OPTIONS = [1, 2, 4, 8];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

function formatOffsetMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function ReplayPlayer({ timeline, onClose, standalone = false }: ReplayPlayerProps) {
  const snapshots = useMemo(() => timeline.snapshots || [], [timeline.snapshots]);
  const totalSnapshots = snapshots.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(2);
  const [theme, setTheme] = useState<'vs-dark' | 'vs'>('vs-dark');
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [showDiffView, setShowDiffView] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Theme observer for Monaco sync
  useEffect(() => {
    const updateTheme = () => {
      const isDark =
        document.documentElement.classList.contains('dark') ||
        document.documentElement.getAttribute('data-theme') === 'dark';
      setTheme(isDark ? 'vs-dark' : 'vs');
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Compute session analytics
  const analytics = useMemo(() => {
    let refactors = 0;
    let testRuns = 0;
    let testsPassed = 0;
    let testsFailed = 0;
    let deadEnds = 0;

    snapshots.forEach((snap) => {
      if (snap.eventType === 'edit') refactors++;
      else if (snap.eventType === 'test_run' || snap.eventType === 'test_passed' || snap.eventType === 'test_failed') {
        testRuns++;
        if (snap.eventType === 'test_passed') testsPassed++;
        if (snap.eventType === 'test_failed') testsFailed++;
      } else if (snap.eventType === 'reset') {
        deadEnds++;
      }
    });

    const lastSnap = snapshots[snapshots.length - 1];
    const durationSeconds = timeline.duration_seconds || (lastSnap ? Math.round(lastSnap.timestamp / 1000) : 0);

    return {
      durationSeconds,
      refactors,
      testRuns,
      testsPassed,
      testsFailed,
      deadEnds,
    };
  }, [snapshots, timeline.duration_seconds]);

  const currentSnapshot = useMemo(() => {
    return (
      snapshots[currentIndex] ||
      snapshots[0] || {
        code: '// No code recorded in timeline',
        language: 'python' as SupportedLang,
        timestamp: 0,
        eventType: 'initial' as const,
      }
    );
  }, [snapshots, currentIndex]);

  const prevSnapshot = currentIndex > 0 ? snapshots[currentIndex - 1] : null;

  // Simple diff stats
  const diffInfo = useMemo(() => {
    if (!prevSnapshot) return null;
    const prevLines = prevSnapshot.code.split('\n');
    const currLines = currentSnapshot.code.split('\n');
    const lineDelta = currLines.length - prevLines.length;
    const charDelta = currentSnapshot.code.length - prevSnapshot.code.length;
    return { lineDelta, charDelta };
  }, [prevSnapshot, currentSnapshot]);

  // Step Forward / Backward
  const stepForward = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev >= totalSnapshots - 1) {
        setIsPlaying(false);
        return prev;
      }
      return prev + 1;
    });
  }, [totalSnapshots]);

  const stepBackward = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const jumpToStart = useCallback(() => {
    setIsPlaying(false);
    setCurrentIndex(0);
  }, []);

  const jumpToEnd = useCallback(() => {
    setIsPlaying(false);
    setCurrentIndex(Math.max(0, totalSnapshots - 1));
  }, [totalSnapshots]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      return;
    }

    if (currentIndex >= totalSnapshots - 1) {
      setIsPlaying(false);
      return;
    }

    // Dynamic pace: compute delay based on difference to next snapshot, scaled by speed
    const currentMs = snapshots[currentIndex]?.timestamp || 0;
    const nextMs = snapshots[currentIndex + 1]?.timestamp || currentMs + 2000;
    const rawGap = Math.max(400, Math.min(3500, nextMs - currentMs));
    const delay = Math.max(250, rawGap / speed);

    playTimerRef.current = setTimeout(() => {
      stepForward();
    }, delay);

    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, [isPlaying, currentIndex, totalSnapshots, speed, snapshots, stepForward]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        stepForward();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        stepBackward();
      } else if (e.code === 'Home') {
        e.preventDefault();
        jumpToStart();
      } else if (e.code === 'End') {
        e.preventDefault();
        jumpToEnd();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stepForward, stepBackward, jumpToStart, jumpToEnd]);

  // Copy code helper
  const handleCopyCode = async () => {
    if (!currentSnapshot?.code) return;
    try {
      await navigator.clipboard.writeText(currentSnapshot.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // Share replay URL
  const handleShare = async () => {
    const url = timeline.id
      ? `${window.location.origin}/replay/${timeline.id}`
      : window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2500);
    } catch {}
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Determine event pill styling
  const eventBadge = useMemo(() => {
    const type = currentSnapshot.eventType;
    switch (type) {
      case 'test_passed':
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          title: currentSnapshot.label || 'Test Passed',
        };
      case 'test_failed':
        return {
          icon: <XCircle className="w-4 h-4 text-rose-400" />,
          bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          title: currentSnapshot.label || 'Test Failed',
        };
      case 'submission':
        return {
          icon: <Sparkles className="w-4 h-4 text-purple-400" />,
          bg: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
          title: currentSnapshot.label || 'Final Submission',
        };
      case 'reset':
        return {
          icon: <RotateCcw className="w-4 h-4 text-amber-400" />,
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          title: currentSnapshot.label || 'Dead End: Reverted',
        };
      case 'initial':
        return {
          icon: <FileCode2 className="w-4 h-4 text-slate-400" />,
          bg: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
          title: currentSnapshot.label || 'Starter Boilerplate',
        };
      default:
        return {
          icon: <Code2 className="w-4 h-4 text-cyan-400" />,
          bg: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
          title: currentSnapshot.label || 'Iterative Refactor',
        };
    }
  }, [currentSnapshot]);

  if (totalSnapshots === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-card border border-border rounded-xl">
        <FileCode2 className="w-12 h-12 text-muted mb-3" />
        <h3 className="text-lg font-bold text-text mb-1">No Timeline Snapshots Found</h3>
        <p className="text-sm text-muted2 max-w-sm mb-4">
          This problem solving session hasn&apos;t recorded any keystrokes or test runs yet.
        </p>
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-surface hover:bg-border text-text transition"
          >
            Close Viewer
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-2xl transition-all ${
        standalone ? 'min-h-[85vh] w-full max-w-7xl mx-auto' : 'h-full w-full'
      }`}
    >
      {/* ── Top Header Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-white dark:bg-zinc-900/80 border-b border-slate-200 dark:border-zinc-800 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 border border-cyan-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white truncate font-display">
                {timeline.problem_title || timeline.problem_id || 'Algorithmic Solution'}
              </h2>
              <span className="px-2 py-0.5 text-[11px] font-mono font-medium rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                {currentSnapshot.language || 'code'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-zinc-400 font-mono">
              {timeline.user_name || timeline.user_github ? (
                <span>by @{timeline.user_github || timeline.user_name}</span>
              ) : (
                <span>Anonymous Coder</span>
              )}
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatDuration(analytics.durationSeconds)}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <GitBranch className="w-3.5 h-3.5" />
                {analytics.refactors} refactors
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDiffView((v) => !v)}
            title="Toggle line diff summary"
            className={`px-2.5 py-1.5 text-xs font-mono rounded-lg border transition flex items-center gap-1.5 ${
              showDiffView
                ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border-cyan-500/30'
                : 'bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-700'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Diff Info</span>
          </button>

          <button
            onClick={() => setShowLogDrawer((v) => !v)}
            title="Toggle milestone timeline log"
            className={`px-2.5 py-1.5 text-xs font-mono rounded-lg border transition flex items-center gap-1.5 ${
              showLogDrawer
                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-300 border-purple-500/30'
                : 'bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Milestones ({totalSnapshots})</span>
          </button>

          <button
            onClick={handleCopyCode}
            title="Copy snapshot code to clipboard"
            className="p-2 text-xs font-mono rounded-lg bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-700 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleShare}
            title="Share Replay URL"
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black shadow transition flex items-center gap-1.5"
          >
            {shared ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{shared ? 'Copied Link!' : 'Share'}</span>
          </button>

          <button
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="p-2 text-xs font-mono rounded-lg bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-700 transition"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {onClose && (
            <button
              onClick={onClose}
              title="Close Replay"
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 transition"
            >
              Exit
            </button>
          )}
        </div>
      </div>

      {/* ── Main Playback & Editor Area (Split if log drawer open) ── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Editor Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-zinc-950">
          {/* Active Milestone Status Pill */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 bg-slate-100/70 dark:bg-zinc-900/40 border-b border-slate-200 dark:border-zinc-800/80">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium border ${eventBadge.bg}`}>
                {eventBadge.icon}
                <span>{eventBadge.title}</span>
              </span>
              <span className="text-xs font-mono text-slate-500 dark:text-zinc-400">
                +{formatOffsetMs(currentSnapshot.timestamp)}
              </span>
            </div>

            {/* Quick stats on snapshot */}
            <div className="flex items-center gap-3 text-xs font-mono text-slate-500 dark:text-zinc-400">
              {currentSnapshot.activeTestsPassed && (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {currentSnapshot.activeTestsPassed.passed}/{currentSnapshot.activeTestsPassed.total} tests passing
                </span>
              )}
              <span>Lines: {currentSnapshot.stats?.lines ?? currentSnapshot.code.split('\n').length}</span>
              <span>Chars: {currentSnapshot.stats?.chars ?? currentSnapshot.code.length}</span>
              {diffInfo && showDiffView && (
                <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                  {diffInfo.lineDelta >= 0 ? `+${diffInfo.lineDelta}` : diffInfo.lineDelta} lines (
                  {diffInfo.charDelta >= 0 ? `+${diffInfo.charDelta}` : diffInfo.charDelta} chars)
                </span>
              )}
            </div>
          </div>

          {/* Monaco Instance */}
          <div className="flex-1 relative min-h-[380px]">
            <Editor
              height="100%"
              language={currentSnapshot.language === 'cpp' ? 'cpp' : currentSnapshot.language}
              value={currentSnapshot.code}
              theme={theme}
              options={{
                readOnly: true,
                domReadOnly: true,
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
                lineHeight: 20,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                folding: true,
                renderLineHighlight: 'all',
                wordWrap: 'on',
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                padding: { top: 12, bottom: 12 },
              }}
            />
          </div>
        </div>

        {/* Collapsible Milestone Log Drawer */}
        {showLogDrawer && (
          <div className="w-80 border-l border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col h-full animate-fade-in z-10 shadow-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-zinc-800">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Evolution Milestones
              </span>
              <button
                onClick={() => setShowLogDrawer(false)}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800/60 p-2 space-y-1">
              {snapshots.map((snap, i) => {
                const isActive = i === currentIndex;
                const isPassed = snap.eventType === 'test_passed';
                const isFailed = snap.eventType === 'test_failed';
                const isReset = snap.eventType === 'reset';
                const isSub = snap.eventType === 'submission';

                return (
                  <button
                    key={snap.id || i}
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentIndex(i);
                    }}
                    className={`w-full text-left p-2.5 rounded-lg transition flex items-start gap-2.5 ${
                      isActive
                        ? 'bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-300 dark:border-cyan-800 shadow-sm'
                        : 'hover:bg-slate-100 dark:hover:bg-zinc-800/50 border border-transparent'
                    }`}
                  >
                    <div className="mt-0.5">
                      {isPassed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : isFailed ? (
                        <XCircle className="w-3.5 h-3.5 text-rose-500" />
                      ) : isReset ? (
                        <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                      ) : isSub ? (
                        <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                      ) : (
                        <Code2 className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 dark:text-zinc-500">
                        <span>#{i + 1}</span>
                        <span>+{formatOffsetMs(snap.timestamp)}</span>
                      </div>
                      <div className={`text-xs font-medium truncate ${isActive ? 'text-cyan-700 dark:text-cyan-300 font-semibold' : 'text-slate-700 dark:text-zinc-300'}`}>
                        {snap.label || (isPassed ? 'Tests Passed' : isFailed ? 'Tests Failed' : isReset ? 'Reverted Dead End' : 'Code Refactor')}
                      </div>
                      {snap.activeTestsPassed && (
                        <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                          {snap.activeTestsPassed.passed}/{snap.activeTestsPassed.total} Passed
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Interactive Timeline Progress Bar & Scrub Track ── */}
      <div className="px-5 pt-3 pb-2 bg-slate-100/90 dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 select-none">
        {/* Milestone Marker Track */}
        <div className="relative w-full h-7 mb-1 flex items-center">
          {/* Base Track Line */}
          <div className="absolute inset-x-0 h-2 bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
            {/* Played Fill */}
            <div
              className="h-full bg-cyan-500 transition-all duration-150 ease-out"
              style={{
                width: `${totalSnapshots > 1 ? (currentIndex / (totalSnapshots - 1)) * 100 : 100}%`,
              }}
            />
          </div>

          {/* Milestone markers along the track */}
          {snapshots.map((snap, idx) => {
            if (
              snap.eventType === 'edit' &&
              totalSnapshots > 30 &&
              idx !== 0 &&
              idx !== totalSnapshots - 1
            ) {
              // Condense minor routine edits when there are many snapshots
              return null;
            }

            const pct = totalSnapshots > 1 ? (idx / (totalSnapshots - 1)) * 100 : 0;
            const isPassed = snap.eventType === 'test_passed';
            const isFailed = snap.eventType === 'test_failed';
            const isReset = snap.eventType === 'reset';
            const isSub = snap.eventType === 'submission';
            const isInitial = snap.eventType === 'initial';

            let dotColor = 'bg-slate-400 dark:bg-zinc-500';
            if (isPassed) dotColor = 'bg-emerald-500 ring-2 ring-emerald-400/30';
            else if (isFailed) dotColor = 'bg-rose-500 ring-2 ring-rose-400/30';
            else if (isReset) dotColor = 'bg-amber-500 ring-2 ring-amber-400/30';
            else if (isSub) dotColor = 'bg-purple-500 ring-2 ring-purple-400/30';
            else if (isInitial) dotColor = 'bg-cyan-500';

            return (
              <button
                key={snap.id || idx}
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentIndex(idx);
                }}
                title={`Snapshot ${idx + 1} (+${formatOffsetMs(snap.timestamp)}): ${snap.label || snap.eventType}`}
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full transition-transform hover:scale-150 focus:outline-none z-10 ${
                  isPassed || isFailed || isSub || isReset ? 'w-3 h-3' : 'w-2 h-2'
                } ${dotColor} ${idx === currentIndex ? 'scale-150 ring-2 ring-cyan-400' : ''}`}
                style={{ left: `${pct}%` }}
              />
            );
          })}

          {/* Actual Invisible HTML Range Input for Drag & Scrub */}
          <input
            type="range"
            min={0}
            max={Math.max(0, totalSnapshots - 1)}
            value={currentIndex}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentIndex(parseInt(e.target.value, 10));
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
          />
        </div>

        {/* Timeline Metadata Labels */}
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-zinc-400 px-1">
          <span>00:00 (Start)</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Passed ({analytics.testsPassed})
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Failed ({analytics.testsFailed})
            </span>
            {analytics.deadEnds > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Dead Ends ({analytics.deadEnds})
              </span>
            )}
          </div>
          <span>
            {snapshots.length > 0
              ? formatOffsetMs(snapshots[snapshots.length - 1].timestamp)
              : '00:00'} (Final)
          </span>
        </div>
      </div>

      {/* ── Playback Controls Deck ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-white dark:bg-zinc-950 border-t border-slate-200 dark:border-zinc-800">
        {/* Play/Pause & Step Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={jumpToStart}
            disabled={currentIndex === 0}
            title="Jump to Start (Home)"
            className="p-2 rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={stepBackward}
            disabled={currentIndex === 0}
            title="Step Back 1 Snapshot (Left Arrow)"
            className="p-2 rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsPlaying((p) => !p)}
            title="Play / Pause (Space)"
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-semibold shadow-md transition"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          <button
            onClick={stepForward}
            disabled={currentIndex >= totalSnapshots - 1}
            title="Step Forward 1 Snapshot (Right Arrow)"
            className="p-2 rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={jumpToEnd}
            disabled={currentIndex >= totalSnapshots - 1}
            title="Jump to Submission (End)"
            className="p-2 rounded-lg text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Frame Progress Counter */}
        <div className="flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-zinc-300">
          <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 font-semibold">
            Snapshot {currentIndex + 1} / {totalSnapshots}
          </span>
          <span className="text-slate-400 dark:text-zinc-500">
            ({Math.round(((currentIndex + 1) / totalSnapshots) * 100)}%)
          </span>
        </div>

        {/* Speed Multiplier Pill */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-900 p-1 rounded-xl border border-slate-200 dark:border-zinc-800">
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded-lg transition ${
                speed === s
                  ? 'bg-cyan-500 text-black font-bold shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
