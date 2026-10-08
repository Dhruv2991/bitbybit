'use client';
// ════════════════════════════════════════════════════════════
// src/components/code-editor/LogicVisualizerDrawer.tsx
// Advanced Time-Travel Debugger & Code Execution Visualizer.
//
// Features:
//   - Intelligent State Diffing & Element-Level Array/Object Mutations
//   - Execution Heatmap Highlighting & Hotspot Frequency Indicators
//   - Event-Driven / Conditional Jump-To Scrubbing & Watchpoints
//   - Visual Call Stack Inspector for Recursive & Nested Functions
//   - Micro-Heatmap Scrubber with Hover Previews & Keyboard Controls
// ════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ExecStep, QuotaStatus } from '@/lib/visualizer';
import type { SupportedLang } from '@/types/database';
import {
  computeStateDiff,
  buildTraceIndex,
  findNextMutationStep,
  findPrevMutationStep,
  findNextLineStep,
  findPrevLineStep,
  resolveCallStack,
  classifyVariableValue,
  type VariableDiffItem,
  type ResolvedStackFrame,
} from '@/lib/visualizerAnalytics';

// ── Icons ────────────────────────────────────────────────────

function IconPlay()   { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M8 5v14l11-7z"/></svg>; }
function IconPause()  { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>; }
function IconPrev()   { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>; }
function IconNext()   { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M6 18l8.5-6L6 6v12zm2.5-6 6-4.25v8.5L8.5 12zM16 6h2v12h-2z"/></svg>; }
function IconFirst()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5"><path d="M19 20L9 12l10-8v16zM5 19V5"/></svg>; }
function IconLast()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5"><path d="M5 4l10 8-10 8V4zM19 5v14"/></svg>; }
function IconReset()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>; }
function IconClose()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M18 6 6 18M6 6l12 12"/></svg>; }
function IconVar()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M4 7h16M4 12h10M4 17h6"/></svg>; }
function IconStack()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="m12 2 10 5-10 5L2 7l10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>; }
function IconTerm()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>; }
function IconCode()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>; }
function IconFlame()  { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M12 2c-.5 2.5-3 4.5-3 7 0 2 1.5 3.5 3 3.5s3-1.5 3-3.5c0-2.5-2.5-4.5-3-7zm-4 7C5 11.5 4 14 4 16.5 4 20.6 7.4 24 11.5 24s8.5-3.4 8.5-7.5c0-3.5-2.5-6.5-5.5-8-1 2.5-3 4-5.5 4-2 0-3.5-1-4-2.5z"/></svg>; }
function IconJump()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="m13 3 7 7-7 7"/><path d="M4 10h16"/><path d="M4 14h6"/></svg>; }
function IconBug()    { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect width="8" height="14" x="8" y="6" rx="4"/><path d="m19 7-3 2"/><path d="m5 7 3 2"/><path d="m19 19-3-2"/><path d="m5 19 3-2"/><path d="M20 13h-4"/><path d="M4 13h4"/><path d="m10 4 1 2"/><path d="m14 4-1 2"/></svg>; }
function IconSearch() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>; }
function IconZap()    { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>; }

// ── Color Schemes ────────────────────────────────────────────

const VALUE_COLORS: Record<ReturnType<typeof classifyVariableValue>, string> = {
  int:   'text-sky-400',
  float: 'text-cyan-400',
  str:   'text-amber-400',
  bool:  'text-purple-400',
  list:  'text-emerald-400',
  dict:  'text-cyan-300',
  tuple: 'text-violet-400',
  none:  'text-zinc-500',
  other: 'text-zinc-300',
};

const TYPE_BADGES: Record<ReturnType<typeof classifyVariableValue>, string> = {
  int:   'int',
  float: 'float',
  str:   'str',
  bool:  'bool',
  list:  'array',
  dict:  'dict',
  tuple: 'tuple',
  none:  'null',
  other: 'val',
};

const LANG_DISPLAY: Record<SupportedLang, string> = {
  python:     'Python',
  javascript: 'JavaScript',
  cpp:        'C++',
  java:       'Java',
  go:         'Go',
  rust:       'Rust',
};

// ── Sub-components ────────────────────────────────────────────

interface VariableDiffCardProps {
  item: VariableDiffItem;
  onJumpToPrevChange?: () => void;
  onJumpToNextChange?: () => void;
  hasPrevMutation?: boolean;
  hasNextMutation?: boolean;
}

function VariableDiffCard({
  item,
  onJumpToPrevChange,
  onJumpToNextChange,
  hasPrevMutation,
  hasNextMutation,
}: VariableDiffCardProps) {
  const [expanded, setExpanded] = useState(true);
  const color = VALUE_COLORS[item.kind];
  const badge = TYPE_BADGES[item.kind];

  const isMutated = item.status === 'modified' || item.status === 'added';
  const isRemoved = item.status === 'removed';

  return (
    <div
      className={`flex flex-col rounded-xl border transition-all duration-300 overflow-hidden ${
        item.status === 'modified'
          ? 'bg-cyan-950/20 border-cyan-500/40 shadow-xs shadow-cyan-500/10'
          : item.status === 'added'
          ? 'bg-emerald-950/20 border-emerald-500/40 shadow-xs shadow-emerald-500/10'
          : isRemoved
          ? 'bg-red-950/20 border-red-500/30 opacity-70'
          : 'bg-zinc-900/60 border-zinc-800/60 hover:border-zinc-700/80'
      }`}
    >
      {/* Variable Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-950/40 border-b border-zinc-800/40">
        <div className="flex items-center gap-2 min-w-0">
          {/* Mutation Status Dot / Badge */}
          {item.status === 'modified' && (
            <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold animate-pulse">
              <IconZap /> MODIFIED
            </span>
          )}
          {item.status === 'added' && (
            <span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
              + NEW IN SCOPE
            </span>
          )}
          {item.status === 'removed' && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 font-bold">
              − OUT OF SCOPE
            </span>
          )}

          <span className="font-mono text-xs font-bold text-zinc-100 truncate">{item.name}</span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
            {badge}
          </span>
        </div>

        {/* Watchpoint Jump Buttons */}
        <div className="flex items-center gap-1">
          {onJumpToPrevChange && (
            <button
              onClick={onJumpToPrevChange}
              disabled={!hasPrevMutation}
              title={`Jump to previous mutation of ${item.name}`}
              className="p-1 rounded text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800/80 disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          )}
          {onJumpToNextChange && (
            <button
              onClick={onJumpToNextChange}
              disabled={!hasNextMutation}
              title={`Jump to next mutation of ${item.name}`}
              className="p-1 rounded text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800/80 disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          )}
          {(item.isArray || item.isObject) && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 ml-1 px-1.5 py-0.5 rounded hover:bg-zinc-800"
            >
              {expanded ? 'Fold' : 'Inspect'}
            </button>
          )}
        </div>
      </div>

      {/* Main Variable Body & Diffing */}
      <div className="p-3">
        {/* Scalar Value Diff Display */}
        {item.status === 'modified' && item.prevValue !== undefined && !item.isArray && !item.isObject && (
          <div className="flex items-center gap-2 font-mono text-xs mb-1.5 bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/80 flex-wrap">
            <span className="text-zinc-500 line-through opacity-75">{item.prevValue}</span>
            <span className="text-cyan-400 font-bold">→</span>
            <span className={`font-bold ${color} px-1.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30`}>
              {item.value}
            </span>
          </div>
        )}

        {/* Normal / Default Value Display */}
        {(!item.status || item.status === 'unchanged' || item.status === 'added' || item.status === 'removed' || item.isArray || item.isObject) && (
          <div className={`font-mono text-xs break-all leading-relaxed ${color}`}>
            {item.value || '<empty>'}
          </div>
        )}

        {/* Array Element-Level Breakdown & Highlighting */}
        {expanded && item.isArray && item.arrayElements && item.arrayElements.length > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-zinc-800/60">
            <div className="flex items-center justify-between mb-1.5 text-[10px] font-mono text-zinc-400">
              <span>Elements ({item.arrayElements.length}):</span>
              {item.arrayElements.some((e) => e.changed) && (
                <span className="text-cyan-300 font-bold">★ Mutated indices highlighted</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
              {item.arrayElements.map((el) => (
                <div
                  key={el.index}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border font-mono text-[11px] transition-all ${
                    el.changed
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-xs shadow-cyan-500/20 font-bold animate-pulse'
                      : 'bg-zinc-950/70 border-zinc-800/80 text-zinc-300'
                  }`}
                >
                  <span className="text-[9px] text-zinc-500 font-medium">[{el.index}]</span>
                  {el.changed && el.prevValue !== undefined && (
                    <span className="text-zinc-500 line-through text-[10px] mr-0.5">{el.prevValue}→</span>
                  )}
                  <span>{el.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Object Property Breakdown */}
        {expanded && item.isObject && item.objectProperties && item.objectProperties.length > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-zinc-800/60 space-y-1">
            <div className="text-[10px] font-mono text-zinc-400 mb-1">Properties:</div>
            {item.objectProperties.map((prop) => (
              <div
                key={prop.key}
                className={`flex items-center justify-between px-2 py-1 rounded border font-mono text-xs ${
                  prop.status === 'modified'
                    ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-200'
                    : prop.status === 'added'
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                    : 'bg-zinc-950/50 border-zinc-800/60 text-zinc-300'
                }`}
              >
                <span className="text-zinc-400">{prop.key}:</span>
                <span className="font-bold text-zinc-100">{prop.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4 animate-pulse">
      {[85, 65, 90, 45, 70].map((w, i) => (
        <div key={i} className="h-3.5 bg-zinc-800/70 rounded-md" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

// ── Main Visualizer Drawer Component ──────────────────────────

export interface LogicVisualizerDrawerProps {
  steps:              ExecStep[];
  code:               string;
  language:           SupportedLang;
  stdout:             string;
  error?:             string;
  isLoading:          boolean;
  testInput?:         string | null;
  quota?:             QuotaStatus | null;
  onActiveLineChange?: (line: number | null) => void;
  onClose:            () => void;
  onOpenUpgrade?:     () => void;
}

export default function LogicVisualizerDrawer({
  steps,
  code,
  language,
  stdout,
  error,
  isLoading,
  testInput,
  quota,
  onActiveLineChange,
  onClose,
  onOpenUpgrade,
}: LogicVisualizerDrawerProps) {
  const [stepIdx,      setStepIdx]      = useState(0);
  const [playing,      setPlaying]      = useState(false);
  const [speed,        setSpeed]        = useState(800);
  const [activeTab,    setActiveTab]    = useState<'vars' | 'stack' | 'stdout' | 'events' | 'code'>('vars');
  const [showHeatmap,  setShowHeatmap]  = useState(true);
  const [filterQuery,  setFilterQuery]  = useState('');
  const [varFilter,    setVarFilter]    = useState<'all' | 'changed' | 'arrays'>('all');
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);

  // Scrubber hover preview state
  const [hoverStepIdx, setHoverStepIdx] = useState<number | null>(null);
  const [hoverPos,     setHoverPos]     = useState<number>(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrubberTrackRef = useRef<HTMLDivElement | null>(null);

  const codeLines = useMemo(() => code.split('\n'), [code]);
  const total = steps.length;

  const currentStep = steps[stepIdx] ?? null;
  const prevStep    = steps[stepIdx - 1] ?? null;

  // ── Precompute Trace Indices, Heatmaps & Mutations ──────────
  const traceIndex = useMemo(() => buildTraceIndex(steps, error), [steps, error]);

  // ── Intelligent State Diffing ────────────────────────────────
  const diffItems = useMemo(() => {
    return computeStateDiff(prevStep?.variables, currentStep?.variables);
  }, [prevStep, currentStep]);

  // Filtered diff items based on user search & category
  const visibleDiffItems = useMemo(() => {
    return diffItems.filter((item) => {
      if (filterQuery) {
        const q = filterQuery.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesVal = item.value.toLowerCase().includes(q);
        if (!matchesName && !matchesVal) return false;
      }
      if (varFilter === 'changed') return item.status === 'modified' || item.status === 'added';
      if (varFilter === 'arrays')  return item.isArray;
      return true;
    });
  }, [diffItems, filterQuery, varFilter]);

  // ── Call Stack Frame Resolution ──────────────────────────────
  const stackInfo = useMemo(() => {
    return resolveCallStack(currentStep, prevStep);
  }, [currentStep, prevStep]);

  // Active frame selection (defaults to top of stack)
  const activeFrame = useMemo(() => {
    if (selectedFrameId) {
      const found = stackInfo.frames.find((f) => f.id === selectedFrameId);
      if (found) return found;
    }
    return stackInfo.frames[0] || null;
  }, [stackInfo.frames, selectedFrameId]);

  // Reset selected frame when stepping
  useEffect(() => {
    setSelectedFrameId(null);
  }, [stepIdx]);

  // ── Sync Active Line with Monaco Editor ──────────────────────
  useEffect(() => {
    if (currentStep && currentStep.line > 0) {
      onActiveLineChange?.(currentStep.line);
    } else {
      onActiveLineChange?.(null);
    }
  }, [currentStep, onActiveLineChange]);

  // Clean up line highlight when drawer closes
  useEffect(() => {
    return () => {
      onActiveLineChange?.(null);
    };
  }, [onActiveLineChange]);

  // ── Playback Navigation Callbacks ────────────────────────────
  const goNext  = useCallback(() => setStepIdx((i) => Math.min(i + 1, total - 1)), [total]);
  const goPrev  = useCallback(() => setStepIdx((i) => Math.max(i - 1, 0)), []);
  const goFirst = useCallback(() => { setStepIdx(0); setPlaying(false); }, []);
  const goLast  = useCallback(() => { setStepIdx(Math.max(total - 1, 0)); setPlaying(false); }, [total]);

  // Event Jump Handlers
  const jumpNextMutation = useCallback((varName?: string) => {
    const nextIdx = findNextMutationStep(traceIndex.mutationMap, stepIdx, varName);
    if (nextIdx !== null) setStepIdx(nextIdx);
  }, [traceIndex.mutationMap, stepIdx]);

  const jumpPrevMutation = useCallback((varName?: string) => {
    const prevIdx = findPrevMutationStep(traceIndex.mutationMap, stepIdx, varName);
    if (prevIdx !== null) setStepIdx(prevIdx);
  }, [traceIndex.mutationMap, stepIdx]);

  const jumpToLine = useCallback((targetLine: number) => {
    const nextIdx = findNextLineStep(traceIndex.lineMap, stepIdx, targetLine) ?? traceIndex.lineMap[targetLine]?.[0];
    if (nextIdx !== undefined && nextIdx !== null) setStepIdx(nextIdx);
  }, [traceIndex.lineMap, stepIdx]);

  const jumpToCrash = useCallback(() => {
    if (traceIndex.errorStepIndex !== null) {
      setStepIdx(traceIndex.errorStepIndex);
    }
  }, [traceIndex.errorStepIndex]);

  // ── Playback Timer ───────────────────────────────────────────
  useEffect(() => {
    if (!playing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setStepIdx((i) => {
        if (i >= total - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, speed);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, speed, total]);

  useEffect(() => {
    setStepIdx(0);
    setPlaying(false);
  }, [steps]);

  // ── Keyboard Shortcuts ───────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goPrev(); }
      if (e.key === 'Home')       { e.preventDefault(); goFirst(); }
      if (e.key === 'End')        { e.preventDefault(); goLast(); }
      if (e.key === ' ')          { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === 'j' || e.key === 'J') { e.preventDefault(); jumpPrevMutation(); }
      if (e.key === 'k' || e.key === 'K') { e.preventDefault(); jumpNextMutation(); }
      if (e.key === 'Escape')     onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, goFirst, goLast, jumpPrevMutation, jumpNextMutation, onClose]);

  // ── Interactive Scrubber Mouse Handlers ──────────────────────
  const handleScrubberMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubberTrackRef.current || total <= 1) return;
    const rect = scrubberTrackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetIdx = Math.round(ratio * (total - 1));
    setHoverStepIdx(targetIdx);
    setHoverPos(e.clientX - rect.left);
  };

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubberTrackRef.current || total <= 1) return;
    const rect = scrubberTrackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetIdx = Math.round(ratio * (total - 1));
    setPlaying(false);
    setStepIdx(targetIdx);
  };

  const progressPct = total > 1 ? (stepIdx / (total - 1)) * 100 : 0;
  const mutatedCount = diffItems.filter((d) => d.status === 'modified' || d.status === 'added').length;

  return (
    <div className="flex flex-col h-full bg-white/95 dark:bg-zinc-950/95 border-t border-slate-200 dark:border-zinc-800/90 backdrop-blur-xl text-slate-900 dark:text-zinc-100 shadow-2xl select-none">
      {/* ── Header Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-zinc-800/70 shrink-0 bg-slate-50/90 dark:bg-zinc-950/90">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          {/* Active status & Language */}
          <div className="flex items-center gap-2 shrink-0">
            <div
              className={`w-2.5 h-2.5 rounded-full shadow-xs ${
                playing
                  ? 'bg-emerald-500 animate-pulse'
                  : total > 0
                  ? 'bg-cyan-500'
                  : 'bg-slate-400 dark:bg-zinc-600'
              }`}
            />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-zinc-200">
              Logic Visualizer
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/25 font-semibold">
              {LANG_DISPLAY[language] || language}
            </span>
          </div>

          {/* Heatmap Toggle */}
          {total > 0 && (
            <button
              onClick={() => setShowHeatmap((h) => !h)}
              title="Toggle code execution heatmap frequency bars"
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg font-mono text-[10.5px] border transition-all ${
                showHeatmap
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-semibold'
                  : 'bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-800 hover:text-slate-900 dark:hover:text-zinc-300'
              }`}
            >
              <IconFlame />
              <span className="hidden sm:inline">Heatmap</span>
            </button>
          )}

          {/* Error Jump Button if trace has crash */}
          {error && traceIndex.errorStepIndex !== null && (
            <button
              onClick={jumpToCrash}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/40 font-mono text-[10.5px] font-bold hover:bg-red-500/30 transition-all animate-bounce"
            >
              <IconBug />
              <span>Jump to Crash (Step {traceIndex.errorStepIndex + 1})</span>
            </button>
          )}

          {/* Test input badge */}
          {testInput && (
            <div className="hidden lg:flex items-center gap-1.5 min-w-0 overflow-hidden">
              <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-500 shrink-0">Input:</span>
              <span className="text-[10px] font-mono text-slate-800 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded px-2 py-0.5 truncate max-w-[160px]">
                {testInput}
              </span>
            </div>
          )}
        </div>

        {/* Right Toolbar: Speed & Quota & Close */}
        <div className="flex items-center gap-3">
          {/* Credit quota badge */}
          {quota && (
            <button
              onClick={onOpenUpgrade}
              title={`Refills in ${quota.resetsIn} at midnight`}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10.5px] font-medium border transition-all ${
                quota.isPro
                  ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/25 hover:bg-cyan-500/15'
                  : 'bg-slate-100 dark:bg-zinc-900/80 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700/60 hover:border-cyan-500/40 hover:text-cyan-600 dark:hover:text-cyan-300'
              }`}
            >
              <span className="text-cyan-600 dark:text-cyan-400 font-bold">⚡</span>
              <span>
                {quota.remaining} / {quota.limit} {quota.isPro ? 'Pro' : 'free'}
              </span>
            </button>
          )}

          {/* Speed preset buttons */}
          {total > 0 && (
            <div className="hidden md:flex items-center gap-1 font-mono text-[10px] text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-900/80 p-1 rounded-lg border border-slate-200 dark:border-zinc-800">
              <span className="text-slate-500 dark:text-zinc-500 px-1">Speed:</span>
              {[
                { label: '0.25×', ms: 1600 },
                { label: '0.5×',  ms: 1000 },
                { label: '1×',    ms: 600 },
                { label: '2×',    ms: 300 },
                { label: '4×',    ms: 120 },
              ].map(({ label, ms }) => (
                <button
                  key={ms}
                  onClick={() => setSpeed(ms)}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    speed === ms
                      ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 font-bold'
                      : 'text-slate-500 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-zinc-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-zinc-800/60 transition-colors"
            title="Close visualizer (Esc)"
          >
            <IconClose />
          </button>
        </div>
      </div>

      {/* ── Main Workspace Body (Split Pane) ── */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left Pane: Execution Flow with Heatmaps & Click-to-Jump */}
        <div className="hidden md:flex flex-col w-[46%] border-r border-slate-200 dark:border-zinc-800/60 overflow-hidden bg-slate-50/50 dark:bg-zinc-950/40">
          <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-200 dark:border-zinc-800/50 shrink-0 bg-slate-100/60 dark:bg-zinc-950/60">
            <div className="flex items-center gap-2">
              <IconCode />
              <span className="font-mono text-[10px] uppercase tracking-wider text-slate-700 dark:text-zinc-300 font-bold">
                Execution Flow
              </span>
            </div>

            <div className="flex items-center gap-2">
              {showHeatmap && traceIndex.hotspotLines.length > 0 && (
                <span className="text-[9.5px] font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                  🔥 {traceIndex.hotspotLines.length} Hotspot lines
                </span>
              )}
              {currentStep && (
                <span className="font-mono text-[10.5px] text-slate-600 dark:text-zinc-400">
                  Line <span className="text-cyan-600 dark:text-cyan-400 font-bold">{currentStep.line}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 font-mono text-xs leading-[1.6]">
            {isLoading ? (
              <LoadingSkeleton />
            ) : (
              codeLines.map((lineStr, idx) => {
                const lineNo     = idx + 1;
                const isActive   = currentStep?.line === lineNo;
                const wasStepped = steps.slice(0, stepIdx + 1).some((s) => s.line === lineNo);
                const heat       = traceIndex.lineHeatmap[lineNo];

                return (
                  <div
                    key={idx}
                    onClick={() => heat?.count && jumpToLine(lineNo)}
                    title={heat?.count ? `Line executed ${heat.count} times. Click to jump next.` : undefined}
                    className={`group flex items-center gap-2 px-2 py-0.5 rounded transition-all duration-150 cursor-pointer ${
                      isActive
                        ? 'bg-cyan-500/15 border-l-3 border-cyan-500 dark:border-cyan-400 text-slate-900 dark:text-zinc-100 shadow-xs'
                        : 'border-l-3 border-transparent hover:bg-slate-100/70 dark:hover:bg-zinc-900/60'
                    } ${wasStepped && !isActive ? 'opacity-85' : !wasStepped && total > 0 ? 'opacity-40' : ''}`}
                  >
                    {/* Line number */}
                    <span
                      className={`select-none shrink-0 w-6 text-right font-mono text-[11px] ${
                        isActive ? 'text-cyan-600 dark:text-cyan-400 font-bold' : 'text-slate-400 group-hover:text-slate-600 dark:text-zinc-600 dark:group-hover:text-zinc-400'
                      }`}
                    >
                      {lineNo}
                    </span>

                    {/* Heatmap frequency badge / bar */}
                    {showHeatmap && heat && (
                      <span
                        className={`select-none shrink-0 text-[9px] font-mono px-1 py-0.2 rounded border font-semibold ${
                          heat.isHotspot
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : heat.intensity > 0.4
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                        }`}
                      >
                        {heat.isHotspot ? `🔥${heat.count}x` : `${heat.count}x`}
                      </span>
                    )}

                    {/* Code content */}
                    <span className={`whitespace-pre flex-1 ${isActive ? 'text-zinc-100 font-medium' : 'text-zinc-300'}`}>
                      {lineStr || ' '}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Multi-Tab Debugger Workspace */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          {/* Tab Navigation */}
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800/50 shrink-0 bg-zinc-950/60">
            {([
              { id: 'vars',   label: `Variables (${diffItems.length})`, icon: <IconVar /> },
              { id: 'stack',  label: `Call Stack (${stackInfo.frames.length})`, icon: <IconStack /> },
              { id: 'events', label: 'Timeline Jumps', icon: <IconJump /> },
              { id: 'stdout', label: 'Terminal',  icon: <IconTerm /> },
              { id: 'code',   label: 'Code',      icon: <IconCode />, mobileOnly: true },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider transition-all ${
                  tab.id === 'code' ? 'md:hidden' : ''
                } ${
                  activeTab === tab.id
                    ? 'bg-zinc-800 text-cyan-300 border border-cyan-500/30 shadow-xs'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}

            {/* Quick Step Indicator */}
            {total > 0 && (
              <div className="ml-auto flex items-center gap-2">
                {mutatedCount > 0 && (
                  <span className="hidden sm:inline text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold">
                    ⚡ {mutatedCount} changed
                  </span>
                )}
                <span className="font-mono text-[10.5px] text-zinc-400 tabular-nums">
                  Step <span className="text-cyan-300 font-bold">{stepIdx + 1}</span> / {total}
                </span>
              </div>
            )}
          </div>

          {/* Tab 1: Intelligent Variable State Diffing Panel */}
          {activeTab === 'vars' && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Variable Filter Bar */}
              <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-zinc-800/40 bg-zinc-950/30 shrink-0 flex-wrap">
                {/* Search input */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900/90 border border-zinc-800 flex-1 max-w-[220px]">
                  <IconSearch />
                  <input
                    type="text"
                    placeholder="Filter variables..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="bg-transparent border-none text-xs font-mono text-zinc-200 placeholder-zinc-500 focus:outline-hidden w-full"
                  />
                </div>

                {/* Filter chips */}
                <div className="flex items-center gap-1">
                  {(['all', 'changed', 'arrays'] as const).map((filterType) => (
                    <button
                      key={filterType}
                      onClick={() => setVarFilter(filterType)}
                      className={`px-2 py-0.5 rounded-md font-mono text-[10px] uppercase font-bold transition-colors ${
                        varFilter === filterType
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {filterType}
                    </button>
                  ))}
                </div>
              </div>

              {/* Variable List Body */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
                {isLoading && <LoadingSkeleton />}

                {!isLoading && total === 0 && !error && (
                  <div className="flex flex-col items-center justify-center h-44 text-center">
                    <span className="text-3xl mb-2">🔬</span>
                    <p className="font-mono text-xs text-zinc-400 font-medium">
                      Step through your code to inspect intelligent variable state diffs
                    </p>
                  </div>
                )}

                {error && (
                  <div className="mb-3 bg-red-950/40 border border-red-500/30 rounded-xl p-3.5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-mono text-[11px] font-bold text-red-400 uppercase tracking-wider">
                        Execution Diagnostic
                      </p>
                      {traceIndex.errorStepIndex !== null && (
                        <button
                          onClick={jumpToCrash}
                          className="text-[10px] font-mono px-2 py-0.5 bg-red-500/20 text-red-300 rounded border border-red-500/40 hover:bg-red-500/30"
                        >
                          Jump to error step
                        </button>
                      )}
                    </div>
                    <pre className="font-mono text-xs text-red-300 whitespace-pre-wrap leading-relaxed">{error}</pre>
                  </div>
                )}

                {!isLoading && currentStep && visibleDiffItems.length === 0 && (
                  <div className="text-center py-10 font-mono text-xs text-zinc-500">
                    {filterQuery ? 'No variables match your filter query' : `No active variables in scope at line ${currentStep.line}`}
                  </div>
                )}

                {!isLoading && currentStep && visibleDiffItems.length > 0 && (
                  <div className="space-y-2.5">
                    {visibleDiffItems.map((item) => {
                      const mutations = traceIndex.mutationMap[item.name] || [];
                      const hasPrev = mutations.some((m) => m < stepIdx);
                      const hasNext = mutations.some((m) => m > stepIdx);

                      return (
                        <VariableDiffCard
                          key={item.name}
                          item={item}
                          hasPrevMutation={hasPrev}
                          hasNextMutation={hasNext}
                          onJumpToPrevChange={() => jumpPrevMutation(item.name)}
                          onJumpToNextChange={() => jumpNextMutation(item.name)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Visual Call Stack Inspector */}
          {activeTab === 'stack' && (
            <div className="flex flex-col flex-1 overflow-hidden p-3.5">
              {/* Stack Push / Pop Indicator Banner */}
              {stackInfo.isPushed && (
                <div className="mb-3 px-3 py-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 font-mono text-xs flex items-center gap-2 animate-fadeIn">
                  <span>📥</span>
                  <span><strong>Stack Frame Pushed:</strong> New execution frame placed on memory stack.</span>
                </div>
              )}
              {stackInfo.isPopped && (
                <div className="mb-3 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-xs flex items-center gap-2 animate-fadeIn">
                  <span>📤</span>
                  <span><strong>Stack Frame Popped:</strong> Function execution completed and returned.</span>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-2.5">
                {stackInfo.frames.map((frame, idx) => {
                  const isSelected = activeFrame?.id === frame.id;

                  return (
                    <div
                      key={frame.id}
                      onClick={() => setSelectedFrameId(frame.id)}
                      className={`flex flex-col rounded-xl border p-3 cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-purple-950/20 border-purple-500/40 shadow-xs shadow-purple-500/10'
                          : 'bg-zinc-900/60 border-zinc-800/60 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-zinc-100">
                            {frame.functionName}
                            {frame.argsString ? `(${frame.argsString})` : '()'}
                          </span>
                          {frame.isTop && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                              ACTIVE FRAME
                            </span>
                          )}
                        </div>

                        <span className="text-[10px] font-mono text-zinc-500">
                          Line <strong className="text-zinc-300">{frame.line}</strong> • Depth {frame.depth}
                        </span>
                      </div>

                      {/* Frame local variables preview */}
                      <div className="mt-1.5 pt-1.5 border-t border-zinc-800/50">
                        <span className="text-[10px] font-mono text-zinc-400 block mb-1">Local Scope:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(frame.variables).length === 0 ? (
                            <span className="text-[10px] font-mono text-zinc-600">No local variables</span>
                          ) : (
                            Object.entries(frame.variables).map(([k, v]) => (
                              <span
                                key={k}
                                className="text-[10.5px] font-mono px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300"
                              >
                                <strong className="text-zinc-100">{k}</strong> = {v}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 3: Timeline Jumps & Watchpoints Navigator */}
          {activeTab === 'events' && (
            <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
              {/* Quick Jump Buttons */}
              <div>
                <h4 className="font-mono text-xs uppercase tracking-wider text-zinc-400 font-bold mb-2">
                  Event Milestones
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={goFirst}
                    disabled={stepIdx === 0}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 hover:border-cyan-500/40 text-left font-mono text-xs disabled:opacity-30"
                  >
                    <IconFirst />
                    <div>
                      <div className="font-bold">Initial State</div>
                      <div className="text-[10px] text-zinc-500">Step 1 (Start)</div>
                    </div>
                  </button>

                  <button
                    onClick={goLast}
                    disabled={stepIdx >= total - 1}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 hover:border-cyan-500/40 text-left font-mono text-xs disabled:opacity-30"
                  >
                    <IconLast />
                    <div>
                      <div className="font-bold">Final State</div>
                      <div className="text-[10px] text-zinc-500">Step {total} (End)</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Variable Mutation Timelines */}
              <div>
                <h4 className="font-mono text-xs uppercase tracking-wider text-zinc-400 font-bold mb-2">
                  Watched Variables Timeline
                </h4>
                <div className="space-y-2">
                  {traceIndex.allVariableNames.length === 0 ? (
                    <div className="text-xs font-mono text-zinc-500 py-4 text-center">No variables recorded</div>
                  ) : (
                    traceIndex.allVariableNames.map((varName) => {
                      const mutationSteps = traceIndex.mutationMap[varName] || [];

                      return (
                        <div key={varName} className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-xs font-bold text-cyan-300">{varName}</span>
                            <span className="text-[10px] font-mono text-zinc-400">
                              {mutationSteps.length} mutations
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {mutationSteps.map((mIdx) => (
                              <button
                                key={mIdx}
                                onClick={() => setStepIdx(mIdx)}
                                className={`px-2 py-0.5 rounded font-mono text-[10px] transition-all ${
                                  stepIdx === mIdx
                                    ? 'bg-cyan-500 text-zinc-950 font-bold shadow-xs'
                                    : 'bg-zinc-950 border border-zinc-800 text-zinc-300 hover:border-cyan-500/40 hover:text-cyan-300'
                                }`}
                              >
                                Step {mIdx + 1}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Terminal / Output */}
          {activeTab === 'stdout' && (
            <div className="flex-1 overflow-y-auto p-3.5">
              {stdout || currentStep?.stdout ? (
                <pre className="font-mono text-xs text-cyan-300 leading-relaxed whitespace-pre-wrap bg-zinc-900/70 border border-zinc-800/60 rounded-xl p-3.5">
                  {currentStep?.stdout || stdout}
                </pre>
              ) : (
                <div className="flex flex-col items-center justify-center h-44 text-center">
                  <span className="text-2xl mb-2">📺</span>
                  <p className="font-mono text-xs text-zinc-500">No output printed yet at this execution step</p>
                </div>
              )}
            </div>
          )}

          {/* Tab 5: Mobile Code View */}
          {activeTab === 'code' && (
            <div className="font-mono text-xs leading-[1.6] md:hidden p-3 overflow-y-auto flex-1">
              {codeLines.map((lineStr, idx) => {
                const lineNo   = idx + 1;
                const isActive = currentStep?.line === lineNo;
                return (
                  <div
                    key={idx}
                    className={`flex gap-2 px-2 py-0.5 rounded transition-all ${
                      isActive ? 'bg-cyan-500/15 border-l-2 border-cyan-400' : 'border-l-2 border-transparent'
                    }`}
                  >
                    <span className={`select-none shrink-0 w-5 text-right ${isActive ? 'text-cyan-400 font-bold' : 'text-zinc-700'}`}>
                      {lineNo}
                    </span>
                    <span className={`whitespace-pre-wrap break-all ${isActive ? 'text-zinc-100' : 'text-zinc-400'}`}>
                      {lineStr || ' '}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Interactive Micro-Heatmap Scrubber & Playback Controller ── */}
      <div className="shrink-0 border-t border-zinc-800/80 bg-zinc-950/90 px-4 py-3 flex flex-col gap-2 relative">
        {/* Floating Scrubber Hover Tooltip */}
        {hoverStepIdx !== null && steps[hoverStepIdx] && (
          <div
            className="absolute -top-14 transform -translate-x-1/2 bg-zinc-900 border border-cyan-500/40 text-zinc-100 px-2.5 py-1.5 rounded-lg shadow-xl font-mono text-[11px] pointer-events-none z-50 flex flex-col gap-0.5"
            style={{ left: `${hoverPos + 16}px` }}
          >
            <div className="flex items-center gap-2">
              <span className="text-cyan-300 font-bold">Step {hoverStepIdx + 1}</span>
              <span className="text-zinc-500">•</span>
              <span className="text-zinc-400">Line {steps[hoverStepIdx].line}</span>
            </div>
            {codeLines[steps[hoverStepIdx].line - 1] && (
              <span className="text-[10px] text-zinc-300 truncate max-w-[200px]">
                {codeLines[steps[hoverStepIdx].line - 1].trim()}
              </span>
            )}
          </div>
        )}

        {/* Micro-Heatmap Scrubber Track */}
        {total > 0 && (
          <div
            ref={scrubberTrackRef}
            onClick={handleScrubberClick}
            onMouseMove={handleScrubberMouseMove}
            onMouseLeave={() => setHoverStepIdx(null)}
            className="h-3 bg-zinc-900 rounded-full border border-zinc-800 relative cursor-pointer group flex items-center overflow-hidden"
          >
            {/* Heatmap execution density background */}
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-100"
              style={{ width: `${progressPct}%` }}
            />

            {/* Mutation event ticks on timeline */}
            {steps.map((step, sIdx) => {
              const prev = sIdx > 0 ? steps[sIdx - 1] : null;
              const hasMutation = prev && Object.keys(step.variables).some((k) => prev.variables[k] !== step.variables[k]);
              if (!hasMutation) return null;

              const pct = (sIdx / (total - 1)) * 100;
              return (
                <div
                  key={sIdx}
                  className="absolute top-0 bottom-0 w-0.5 bg-cyan-300/80 pointer-events-none"
                  style={{ left: `${pct}%` }}
                />
              );
            })}

            {/* Error Marker */}
            {traceIndex.errorStepIndex !== null && (
              <div
                className="absolute top-0 bottom-0 w-1 bg-red-400 animate-pulse pointer-events-none"
                style={{ left: `${(traceIndex.errorStepIndex / (total - 1)) * 100}%` }}
              />
            )}
          </div>
        )}

        {/* Playback Controls Toolbar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {total === 0 && !isLoading ? (
            <span className="font-mono text-xs text-zinc-500 mx-auto">
              {error ? 'Review the diagnostic above and re-run' : 'Click Visualize to begin step tracing'}
            </span>
          ) : (
            <>
              {/* Left Controls: Jump Start, Prev, Play/Pause, Next, Jump End */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={goFirst}
                  disabled={isLoading || stepIdx === 0}
                  title="First Step (Home)"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 disabled:opacity-25 transition-all"
                >
                  <IconFirst />
                </button>

                <button
                  onClick={() => jumpPrevMutation()}
                  disabled={isLoading || stepIdx === 0}
                  title="Previous Mutation (J)"
                  className="px-2 py-1 rounded-lg text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800/80 disabled:opacity-25 font-mono text-[10px] flex items-center gap-1 transition-all"
                >
                  <IconPrev />
                  <span className="hidden sm:inline">Prev Mut</span>
                </button>

                <button
                  onClick={goPrev}
                  disabled={isLoading || stepIdx === 0}
                  title="Previous Line (←)"
                  className="p-1.5 rounded-lg text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-25 transition-all"
                >
                  <IconPrev />
                </button>

                <button
                  onClick={() => setPlaying((p) => !p)}
                  disabled={isLoading || total === 0}
                  title={playing ? 'Pause (Space)' : 'Play (Space)'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500 text-zinc-950 font-mono text-xs font-bold transition-all disabled:opacity-25 shadow-md shadow-cyan-500/20"
                >
                  {playing ? <IconPause /> : <IconPlay />}
                  <span>{playing ? 'Pause' : 'Play'}</span>
                </button>

                <button
                  onClick={goNext}
                  disabled={isLoading || stepIdx >= total - 1}
                  title="Next Line (→)"
                  className="p-1.5 rounded-lg text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-25 transition-all"
                >
                  <IconNext />
                </button>

                <button
                  onClick={() => jumpNextMutation()}
                  disabled={isLoading || stepIdx >= total - 1}
                  title="Next Mutation (K)"
                  className="px-2 py-1 rounded-lg text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800/80 disabled:opacity-25 font-mono text-[10px] flex items-center gap-1 transition-all"
                >
                  <span className="hidden sm:inline">Next Mut</span>
                  <IconNext />
                </button>

                <button
                  onClick={goLast}
                  disabled={isLoading || stepIdx >= total - 1}
                  title="Last Step (End)"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 disabled:opacity-25 transition-all"
                >
                  <IconLast />
                </button>
              </div>

              {/* Right Indicator: Step Number & Direct Step Input */}
              <div className="flex items-center gap-2 font-mono text-xs text-zinc-400 tabular-nums ml-auto">
                <span>
                  Step <strong className="text-cyan-300 font-bold">{stepIdx + 1}</strong> / {total}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
