'use client';
// ════════════════════════════════════════════════════════════
// src/components/code-editor/LogicVisualizerDrawer.tsx
//
// A full-featured sliding bottom drawer for line-by-line
// Python execution visualisation.
//
// Props:
//   steps     – ExecStep[] from visualizer.ts
//   code      – raw user code (for line highlighting)
//   stdout    – captured stdout of the run
//   error     – optional runtime error string
//   isLoading – show loading skeleton
//   onClose   – close the drawer
// ════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ExecStep } from '@/lib/visualizer';

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

// ── Helpers ───────────────────────────────────────────────────

function classifyValue(repr: string): 'int' | 'float' | 'str' | 'bool' | 'list' | 'dict' | 'tuple' | 'none' | 'other' {
  if (repr === 'None') return 'none';
  if (repr === 'True' || repr === 'False') return 'bool';
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
  none:  'None',
  other: '…',
};

// ── Sub-components ────────────────────────────────────────────

function VariableRow({ name, value, changed }: { name: string; value: string; changed: boolean }) {
  const kind  = classifyValue(value);
  const color = VALUE_COLORS[kind];
  const badge = TYPE_BADGES[kind];

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border transition-all duration-300
      ${changed
        ? 'bg-indigo-500/10 border-indigo-500/30 animate-[highlight_0.4s_ease-out]'
        : 'bg-zinc-900/60 border-zinc-800/50'}`}>
      {changed && <div className="w-1 h-1 rounded-full bg-indigo-400 shrink-0 mt-1.5" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] font-bold text-zinc-200">{name}</span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700/50">{badge}</span>
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
      {[80, 60, 90, 40].map((w, i) => (
        <div key={i} className="h-3 bg-zinc-800 rounded" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export interface LogicVisualizerDrawerProps {
  steps:      ExecStep[];
  code:       string;
  stdout:     string;
  error?:     string;
  isLoading:  boolean;
  /** The test-case input JSON string being traced, e.g. '[[2,7,11,15],9]' */
  testInput?: string | null;
  onClose:    () => void;
}

export default function LogicVisualizerDrawer({
  steps,
  code,
  stdout,
  error,
  isLoading,
  testInput,
  onClose,
}: LogicVisualizerDrawerProps) {
  const [stepIdx,   setStepIdx]   = useState(0);
  const [playing,   setPlaying]   = useState(false);
  const [speed,     setSpeed]     = useState(800);   // ms per step
  const [activeTab, setActiveTab] = useState<'vars' | 'stdout' | 'code'>('vars');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const codeLines = code.split('\n');
  const total     = steps.length;

  const currentStep = steps[stepIdx] ?? null;
  const prevStep    = steps[stepIdx - 1] ?? null;

  // Detect changed variables between current and previous step
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

  // Playback controls
  const goNext  = useCallback(() => setStepIdx(i => Math.min(i + 1, total - 1)), [total]);
  const goPrev  = useCallback(() => setStepIdx(i => Math.max(i - 1, 0)), []);
  const goReset = useCallback(() => { setStepIdx(0); setPlaying(false); }, []);

  useEffect(() => {
    if (!playing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setStepIdx(i => {
        if (i >= total - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, speed);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, speed, total]);

  // Reset when steps change (new trace)
  useEffect(() => {
    setStepIdx(0);
    setPlaying(false);
  }, [steps]);

  // Keyboard controls
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goPrev(); }
      if (e.key === ' ')          { e.preventDefault(); setPlaying(p => !p); }
      if (e.key === 'Escape')     onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, onClose]);

  const progressPct = total > 1 ? (stepIdx / (total - 1)) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-zinc-950/95 border-t border-zinc-800/80 backdrop-blur-xl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Blinking indicator */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={`w-2 h-2 rounded-full ${playing ? 'bg-emerald-400 animate-pulse' : total > 0 ? 'bg-indigo-400' : 'bg-zinc-600'}`} />
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-zinc-300">
              Logic Visualizer
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">
              Python
            </span>
          </div>
          {/* Test input badge */}
          {testInput && (
            <div className="flex items-center gap-1 min-w-0 overflow-hidden">
              <span className="text-[9px] font-mono text-zinc-600 shrink-0">Input:</span>
              <span className="text-[9px] font-mono text-zinc-400 bg-zinc-800/60 border border-zinc-700/40 rounded px-1.5 py-0.5 truncate max-w-[160px]">
                {testInput}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Speed control */}
          {total > 0 && (
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
              <span>Speed:</span>
              {[{ label: '0.5×', ms: 1600 }, { label: '1×', ms: 800 }, { label: '2×', ms: 400 }, { label: '4×', ms: 200 }].map(({ label, ms }) => (
                <button
                  key={ms}
                  onClick={() => setSpeed(ms)}
                  className={`px-1.5 py-0.5 rounded transition-colors
                    ${speed === ms ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-zinc-500 hover:text-zinc-300'}`}
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

      {/* ── Progress bar ── */}
      {total > 0 && (
        <div className="h-0.5 bg-zinc-800/60 shrink-0">
          <div
            className="h-full bg-indigo-500 transition-all duration-200 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Left: Code pane */}
        <div className="hidden md:flex flex-col w-[45%] border-r border-zinc-800/50 overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800/40 shrink-0">
            <IconCode />
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Code Trace</span>
            {currentStep && (
              <span className="ml-auto font-mono text-[10px] text-zinc-500">
                Line <span className="text-indigo-300 font-bold">{currentStep.line}</span>
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2 font-mono text-xs leading-[1.6]">
            {isLoading ? <LoadingSkeleton /> : (
              codeLines.map((lineStr, idx) => {
                const lineNo     = idx + 1;
                const isActive   = currentStep?.line === lineNo;
                const wasStepped = steps.slice(0, stepIdx + 1).some(s => s.line === lineNo);

                return (
                  <div
                    key={idx}
                    className={`flex gap-2 px-2 py-px rounded transition-all duration-150
                      ${isActive ? 'bg-indigo-500/20 border-l-2 border-indigo-400' : 'border-l-2 border-transparent'}
                      ${wasStepped && !isActive ? 'opacity-60' : ''}`}
                  >
                    <span className={`select-none shrink-0 w-6 text-right ${isActive ? 'text-indigo-400 font-bold' : 'text-zinc-700'}`}>
                      {lineNo}
                    </span>
                    <span className={`whitespace-pre ${isActive ? 'text-zinc-100' : 'text-zinc-400'}`}>
                      {lineStr || ' '}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Variable inspector + stdout */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          {/* Tab bar */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-zinc-800/40 shrink-0">
            {([
              { id: 'vars',   label: 'Variables', icon: <IconVar /> },
              { id: 'stdout', label: 'Output',    icon: <IconTerm /> },
              { id: 'code',   label: 'Code',      icon: <IconCode />, mobileOnly: true },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider transition-all
                  ${tab.id === 'code' ? 'md:hidden' : ''}
                  ${activeTab === tab.id
                    ? 'bg-zinc-800/80 text-zinc-100 border border-zinc-700/50'
                    : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}

            {total > 0 && (
              <span className="ml-auto font-mono text-[10px] text-zinc-500">
                {stepIdx + 1} <span className="text-zinc-700">/</span> {total}
              </span>
            )}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-3">
            {isLoading && <LoadingSkeleton />}

            {!isLoading && activeTab === 'code' && (
              <div className="font-mono text-xs leading-[1.6] md:hidden">
                {codeLines.map((lineStr, idx) => {
                  const lineNo   = idx + 1;
                  const isActive = currentStep?.line === lineNo;
                  return (
                    <div key={idx} className={`flex gap-2 px-2 py-px rounded transition-all
                      ${isActive ? 'bg-indigo-500/20 border-l-2 border-indigo-400' : 'border-l-2 border-transparent'}`}>
                      <span className={`select-none shrink-0 w-5 text-right ${isActive ? 'text-indigo-400 font-bold' : 'text-zinc-700'}`}>{lineNo}</span>
                      <span className={`whitespace-pre-wrap break-all ${isActive ? 'text-zinc-100' : 'text-zinc-400'}`}>{lineStr || ' '}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {!isLoading && activeTab === 'vars' && (
              <>
                {!currentStep && total === 0 && !error && (
                  <div className="flex flex-col items-center justify-center h-32 text-center">
                    <span className="text-2xl mb-2">🔬</span>
                    <p className="font-mono text-xs text-zinc-500">Run the visualizer to inspect variable state</p>
                  </div>
                )}

                {error && (
                  <div className="mb-3 bg-red-950/30 border border-red-500/25 rounded-xl px-3 py-2.5">
                    <p className="font-mono text-[10px] font-bold text-red-400 mb-1 uppercase tracking-wider">Runtime Error</p>
                    <pre className="font-mono text-xs text-red-300 whitespace-pre-wrap leading-relaxed">{error}</pre>
                  </div>
                )}

                {currentStep && (
                  <div className="space-y-2">
                    {Object.entries(currentStep.variables).length === 0 ? (
                      <div className="text-center py-6 font-mono text-xs text-zinc-600">
                        No local variables at this step
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
                  <pre className="font-mono text-xs text-emerald-300 leading-relaxed whitespace-pre-wrap bg-zinc-900/60 border border-zinc-800/50 rounded-xl p-3">
                    {currentStep?.stdout || stdout}
                  </pre>
                ) : (
                  <div className="flex flex-col items-center justify-center h-32 text-center">
                    <span className="text-2xl mb-2">📺</span>
                    <p className="font-mono text-xs text-zinc-500">No output yet at this step</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Playback toolbar ── */}
      <div className="shrink-0 border-t border-zinc-800/60 px-4 py-3 flex items-center justify-center gap-3">
        {total === 0 && !isLoading ? (
          <span className="font-mono text-xs text-zinc-600">
            {error ? 'Fix the error above and re-run' : 'No steps captured — add some code and click Visualize'}
          </span>
        ) : (
          <>
            <button
              onClick={goReset}
              disabled={isLoading || stepIdx === 0}
              title="Reset (R)"
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <IconReset />
            </button>

            <button
              onClick={goPrev}
              disabled={isLoading || stepIdx === 0}
              title="Previous step (←)"
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <IconPrev />
            </button>

            <button
              onClick={() => setPlaying(p => !p)}
              disabled={isLoading || total === 0}
              title={playing ? 'Pause (Space)' : 'Play (Space)'}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold transition-all
                disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
            >
              {playing ? <IconPause /> : <IconPlay />}
              {playing ? 'Pause' : 'Play'}
            </button>

            <button
              onClick={goNext}
              disabled={isLoading || stepIdx >= total - 1}
              title="Next step (→)"
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <IconNext />
            </button>

            {/* Step slider */}
            <input
              type="range"
              min={0}
              max={Math.max(total - 1, 0)}
              value={stepIdx}
              onChange={e => { setPlaying(false); setStepIdx(Number(e.target.value)); }}
              disabled={isLoading || total === 0}
              className="hidden sm:block w-32 accent-indigo-500 disabled:opacity-30"
            />

            <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
              Step {stepIdx + 1}/{total}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
