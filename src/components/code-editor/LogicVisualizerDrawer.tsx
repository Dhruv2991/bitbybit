'use client';
// ════════════════════════════════════════════════════════════
// src/components/code-editor/LogicVisualizerDrawer.tsx
// Multi-language step-by-step logic visualizer drawer with
// real-time Monaco editor synchronization and tiered quota badge.
// ════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ExecStep, QuotaStatus } from '@/lib/visualizer';
import type { SupportedLang } from '@/types/database';

// ── Icons ────────────────────────────────────────────────────

function IconPlay()  { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M8 5v14l11-7z"/></svg>; }
function IconPause() { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>; }
function IconPrev()  { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>; }
function IconNext()  { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M6 18l8.5-6L6 6v12zm2.5-6 6-4.25v8.5L8.5 12zM16 6h2v12h-2z"/></svg>; }
function IconReset() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>; }
function IconClose() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M18 6 6 18M6 6l12 12"/></svg>; }
function IconVar()   { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M4 7h16M4 12h10M4 17h6"/></svg>; }
function IconTerm()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>; }
function IconCode()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>; }

// ── Value Type Classification ────────────────────────────────

function classifyValue(repr: string): 'int' | 'float' | 'str' | 'bool' | 'list' | 'dict' | 'tuple' | 'none' | 'other' {
  if (repr === 'None' || repr === 'null' || repr === 'nil' || repr === 'nullptr') return 'none';
  if (repr === 'True' || repr === 'False' || repr === 'true' || repr === 'false') return 'bool';
  if (/^-?\d+$/.test(repr)) return 'int';
  if (/^-?\d+\.\d+/.test(repr)) return 'float';
  if (repr.startsWith("'") || repr.startsWith('"')) return 'str';
  if (repr.startsWith('[')) return 'list';
  if (repr.startsWith('{')) return 'dict';
  if (repr.startsWith('(')) return 'tuple';
  return 'other';
}

const VALUE_COLORS: Record<ReturnType<typeof classifyValue>, string> = {
  int:   'text-sky-400',
  float: 'text-cyan-400',
  str:   'text-amber-400',
  bool:  'text-purple-400',
  list:  'text-emerald-400',
  dict:  'text-indigo-400',
  tuple: 'text-violet-400',
  none:  'text-zinc-500',
  other: 'text-zinc-300',
};

const TYPE_BADGES: Record<ReturnType<typeof classifyValue>, string> = {
  int:   'int',
  float: 'float',
  str:   'str',
  bool:  'bool',
  list:  'list',
  dict:  'dict',
  tuple: 'tuple',
  none:  'null',
  other: '…',
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

function VariableRow({ name, value, changed }: { name: string; value: string; changed: boolean }) {
  const kind  = classifyValue(value);
  const color = VALUE_COLORS[kind];
  const badge = TYPE_BADGES[kind];

  return (
    <div
      className={`flex items-start gap-2.5 px-3 py-2 rounded-xl border transition-all duration-300 ${
        changed
          ? 'bg-indigo-500/15 border-indigo-500/40 shadow-xs shadow-indigo-500/10'
          : 'bg-zinc-900/60 border-zinc-800/50'
      }`}
    >
      {changed && <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 mt-1.5 animate-pulse" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] font-bold text-zinc-100">{name}</span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
            {badge}
          </span>
        </div>
        <div className={`font-mono text-xs mt-0.5 break-all leading-relaxed ${color}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4 animate-pulse">
      {[80, 60, 90, 45].map((w, i) => (
        <div key={i} className="h-3 bg-zinc-800/70 rounded-md" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

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
  const [stepIdx,   setStepIdx]   = useState(0);
  const [playing,   setPlaying]   = useState(false);
  const [speed,     setSpeed]     = useState(800);
  const [activeTab, setActiveTab] = useState<'vars' | 'stdout' | 'code'>('vars');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const codeLines = code.split('\n');
  const total     = steps.length;

  const currentStep = steps[stepIdx] ?? null;
  const prevStep    = steps[stepIdx - 1] ?? null;

  // Sync active line with Monaco Editor
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

  // Changed variables detection
  const changedVars = new Set<string>();
  if (currentStep && prevStep) {
    for (const [k, v] of Object.entries(currentStep.variables)) {
      if (prevStep.variables[k] !== v) changedVars.add(k);
    }
    for (const k of Object.keys(prevStep.variables)) {
      if (!(k in currentStep.variables)) changedVars.add(k);
    }
  } else if (currentStep && stepIdx === 0) {
    for (const k of Object.keys(currentStep.variables)) changedVars.add(k);
  }

  // Playback handlers
  const goNext  = useCallback(() => setStepIdx((i) => Math.min(i + 1, total - 1)), [total]);
  const goPrev  = useCallback(() => setStepIdx((i) => Math.max(i - 1, 0)), []);
  const goReset = useCallback(() => { setStepIdx(0); setPlaying(false); }, []);

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

  // Keyboard shortcut listeners
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goPrev(); }
      if (e.key === ' ')          { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key === 'Escape')     onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, onClose]);

  const progressPct = total > 1 ? (stepIdx / (total - 1)) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-zinc-950/95 border-t border-zinc-800/90 backdrop-blur-xl text-zinc-100 shadow-2xl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/70 shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          {/* Active status & Language */}
          <div className="flex items-center gap-2 shrink-0">
            <div
              className={`w-2 h-2 rounded-full ${
                playing ? 'bg-emerald-400 animate-pulse' : total > 0 ? 'bg-indigo-400' : 'bg-zinc-600'
              }`}
            />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-200">
              Logic Visualizer
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
              {LANG_DISPLAY[language] || language}
            </span>
          </div>

          {/* Test input badge */}
          {testInput && (
            <div className="hidden sm:flex items-center gap-1.5 min-w-0 overflow-hidden">
              <span className="text-[10px] font-mono text-zinc-500 shrink-0">Input:</span>
              <span className="text-[10px] font-mono text-zinc-300 bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 truncate max-w-[180px]">
                {testInput}
              </span>
            </div>
          )}
        </div>

        {/* Right Toolbar: Credits Counter & Controls */}
        <div className="flex items-center gap-3">
          {/* Credit quota badge */}
          {quota && (
            <button
              onClick={onOpenUpgrade}
              title={`Refills in ${quota.resetsIn} at midnight`}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10.5px] font-medium border transition-all ${
                quota.isPro
                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/25 hover:bg-purple-500/15'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-700/60 hover:border-zinc-500'
              }`}
            >
              <span className="text-amber-400">⚡</span>
              <span>
                {quota.remaining} / {quota.limit} {quota.isPro ? 'Pro' : 'free'} left
              </span>
            </button>
          )}

          {/* Speed control */}
          {total > 0 && (
            <div className="hidden md:flex items-center gap-1 font-mono text-[10px] text-zinc-500">
              <span>Speed:</span>
              {[
                { label: '0.5×', ms: 1600 },
                { label: '1×', ms: 800 },
                { label: '2×', ms: 400 },
                { label: '4×', ms: 200 },
              ].map(({ label, ms }) => (
                <button
                  key={ms}
                  onClick={() => setSpeed(ms)}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    speed === ms
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
            title="Close visualizer (Esc)"
          >
            <IconClose />
          </button>
        </div>
      </div>

      {/* ── Step Progress Indicator ── */}
      {total > 0 && (
        <div className="h-0.5 bg-zinc-800/60 shrink-0">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-200 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* ── Main Drawer Body ── */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left: Code Line Stepper Pane */}
        <div className="hidden md:flex flex-col w-[45%] border-r border-zinc-800/60 overflow-hidden bg-zinc-950/40">
          <div className="flex items-center gap-2 px-3.5 py-2 border-b border-zinc-800/50 shrink-0">
            <IconCode />
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
              Execution Flow
            </span>
            {currentStep && (
              <span className="ml-auto font-mono text-[10.5px] text-zinc-400">
                Line <span className="text-indigo-400 font-bold">{currentStep.line}</span>
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2 font-mono text-xs leading-[1.6]">
            {isLoading ? (
              <LoadingSkeleton />
            ) : (
              codeLines.map((lineStr, idx) => {
                const lineNo     = idx + 1;
                const isActive   = currentStep?.line === lineNo;
                const wasStepped = steps.slice(0, stepIdx + 1).some((s) => s.line === lineNo);

                return (
                  <div
                    key={idx}
                    className={`flex gap-2 px-2 py-0.5 rounded transition-all duration-150 ${
                      isActive
                        ? 'bg-indigo-500/20 border-l-2 border-indigo-400 text-zinc-100 shadow-xs'
                        : 'border-l-2 border-transparent'
                    } ${wasStepped && !isActive ? 'opacity-70' : ''}`}
                  >
                    <span
                      className={`select-none shrink-0 w-6 text-right font-mono ${
                        isActive ? 'text-indigo-400 font-bold' : 'text-zinc-700'
                      }`}
                    >
                      {lineNo}
                    </span>
                    <span className={`whitespace-pre ${isActive ? 'text-zinc-100 font-medium' : 'text-zinc-400'}`}>
                      {lineStr || ' '}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Variable Inspector & Output Pane */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          {/* Tab Bar */}
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800/50 shrink-0 bg-zinc-950/40">
            {([
              { id: 'vars',   label: 'Variables', icon: <IconVar /> },
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
                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/60 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}

            {total > 0 && (
              <span className="ml-auto font-mono text-[10.5px] text-zinc-400">
                Step <span className="text-zinc-100 font-bold">{stepIdx + 1}</span> / {total}
              </span>
            )}
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto p-3.5">
            {isLoading && <LoadingSkeleton />}

            {!isLoading && activeTab === 'code' && (
              <div className="font-mono text-xs leading-[1.6] md:hidden">
                {codeLines.map((lineStr, idx) => {
                  const lineNo   = idx + 1;
                  const isActive = currentStep?.line === lineNo;
                  return (
                    <div
                      key={idx}
                      className={`flex gap-2 px-2 py-0.5 rounded transition-all ${
                        isActive ? 'bg-indigo-500/20 border-l-2 border-indigo-400' : 'border-l-2 border-transparent'
                      }`}
                    >
                      <span className={`select-none shrink-0 w-5 text-right ${isActive ? 'text-indigo-400 font-bold' : 'text-zinc-700'}`}>
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

            {!isLoading && activeTab === 'vars' && (
              <>
                {!currentStep && total === 0 && !error && (
                  <div className="flex flex-col items-center justify-center h-36 text-center">
                    <span className="text-3xl mb-2">🔬</span>
                    <p className="font-mono text-xs text-zinc-400">
                      Step through your code to inspect variable states in real-time
                    </p>
                  </div>
                )}

                {error && (
                  <div className="mb-3 bg-red-950/40 border border-red-500/30 rounded-xl p-3.5">
                    <p className="font-mono text-[11px] font-bold text-red-400 mb-1 uppercase tracking-wider">
                      Execution Diagnostic
                    </p>
                    <pre className="font-mono text-xs text-red-300 whitespace-pre-wrap leading-relaxed">{error}</pre>
                  </div>
                )}

                {currentStep && (
                  <div className="space-y-2">
                    {Object.entries(currentStep.variables).length === 0 ? (
                      <div className="text-center py-8 font-mono text-xs text-zinc-500">
                        No active local variables in scope at line {currentStep.line}
                      </div>
                    ) : (
                      Object.entries(currentStep.variables).map(([name, value]) => (
                        <VariableRow
                          key={name}
                          name={name}
                          value={value}
                          changed={changedVars.has(name)}
                        />
                      ))
                    )}
                  </div>
                )}
              </>
            )}

            {!isLoading && activeTab === 'stdout' && (
              <div>
                {stdout ? (
                  <pre className="font-mono text-xs text-emerald-400 leading-relaxed whitespace-pre-wrap bg-zinc-900/70 border border-zinc-800/60 rounded-xl p-3.5">
                    {currentStep?.stdout || stdout}
                  </pre>
                ) : (
                  <div className="flex flex-col items-center justify-center h-36 text-center">
                    <span className="text-2xl mb-2">📺</span>
                    <p className="font-mono text-xs text-zinc-500">No output printed yet at this execution step</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Playback Toolbar ── */}
      <div className="shrink-0 border-t border-zinc-800/70 px-4 py-3 flex items-center justify-center gap-3 bg-zinc-950/70">
        {total === 0 && !isLoading ? (
          <span className="font-mono text-xs text-zinc-500">
            {error ? 'Review the diagnostic above and re-run' : 'Click Visualize to begin tracing'}
          </span>
        ) : (
          <>
            <button
              onClick={goReset}
              disabled={isLoading || stepIdx === 0}
              title="Reset to start (R)"
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <IconReset />
            </button>

            <button
              onClick={goPrev}
              disabled={isLoading || stepIdx === 0}
              title="Previous line (←)"
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <IconPrev />
            </button>

            <button
              onClick={() => setPlaying((p) => !p)}
              disabled={isLoading || total === 0}
              title={playing ? 'Pause (Space)' : 'Play (Space)'}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25"
            >
              {playing ? <IconPause /> : <IconPlay />}
              <span>{playing ? 'Pause' : 'Play'}</span>
            </button>

            <button
              onClick={goNext}
              disabled={isLoading || stepIdx >= total - 1}
              title="Next line (→)"
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <IconNext />
            </button>

            {/* Step Range Slider */}
            <input
              type="range"
              min={0}
              max={Math.max(total - 1, 0)}
              value={stepIdx}
              onChange={(e) => { setPlaying(false); setStepIdx(Number(e.target.value)); }}
              disabled={isLoading || total === 0}
              className="hidden sm:block w-32 accent-indigo-500 disabled:opacity-30 cursor-pointer"
            />

            <span className="font-mono text-[10.5px] text-zinc-400 tabular-nums">
              Step {stepIdx + 1}/{total}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
