// ════════════════════════════════════════════════════════════
// src/lib/timelineCapture.ts
// Lightweight, non-blocking timeline capture engine for Monaco
// Tracks the chronological evolution of a problem-solving session:
// keystrokes, refactors, dead ends, test runs, and submissions.
// ════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, useCallback } from 'react';
import type { SupportedLang, TimelineSnapshot, TimelineEventType, User } from '@/types/database';

const STORAGE_PREFIX = 'bb_timeline_v1_';
const DEBOUNCE_ROUTINE_MS = 10000; // 10 seconds for routine minor edits
const DEBOUNCE_MAJOR_MS = 2500;   // 2.5 seconds for major diffs / paste operations
const MAJOR_CHAR_DIFF = 35;
const MAJOR_LINE_DIFF = 3;

export interface TimelineSummary {
  totalSnapshots: number;
  durationSeconds: number;
  refactorIterations: number;
  testAttempts: number;
  testsPassedMilestones: number;
  testsFailedMilestones: number;
  deadEndsEncountered: number;
}

function countLines(str: string): number {
  if (!str) return 0;
  return str.split('\n').length;
}

export class TimelineCaptureEngine {
  private problemId: string;
  private problemTitle: string;
  private lang: SupportedLang;
  private sessionStart: number;
  private snapshots: TimelineSnapshot[] = [];
  private lastCode: string = '';
  private lastCodeChars: number = 0;
  private lastCodeLines: number = 0;
  private pendingTimer: any = null;
  private listeners: Set<(snapshots: TimelineSnapshot[]) => void> = new Set();

  constructor(problemId: string, problemTitle: string, initialLang: SupportedLang, initialCode?: string) {
    this.problemId = problemId;
    this.problemTitle = problemTitle;
    this.lang = initialLang;
    this.sessionStart = Date.now();

    // Try restoring existing session timeline from localStorage
    this.loadFromStorage();

    // If empty and initial code provided, record boilerplate milestone
    if (this.snapshots.length === 0 && initialCode !== undefined) {
      this.captureBoilerplate(initialCode, initialLang);
    } else if (this.snapshots.length > 0) {
      const last = this.snapshots[this.snapshots.length - 1];
      this.lastCode = last.code;
      this.lastCodeChars = last.code.length;
      this.lastCodeLines = countLines(last.code);
    }
  }

  private storageKey(): string {
    return `${STORAGE_PREFIX}${this.problemId}`;
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.snapshots) && parsed.snapshots.length > 0) {
          this.snapshots = parsed.snapshots;
          this.sessionStart = parsed.sessionStart || Date.now();
        }
      }
    } catch {}
  }

  private persistToStorage() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify({
        problemId: this.problemId,
        problemTitle: this.problemTitle,
        sessionStart: this.sessionStart,
        snapshots: this.snapshots,
      }));
    } catch {}
  }

  public subscribe(listener: (snapshots: TimelineSnapshot[]) => void) {
    this.listeners.add(listener);
    listener([...this.snapshots]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const copy = [...this.snapshots];
    for (const l of this.listeners) {
      l(copy);
    }
  }

  public getSnapshots(): TimelineSnapshot[] {
    return [...this.snapshots];
  }

  public getDurationSeconds(): number {
    return Math.max(1, Math.round((Date.now() - this.sessionStart) / 1000));
  }

  public getSummary(): TimelineSummary {
    let refactors = 0;
    let testAttempts = 0;
    let testsPassed = 0;
    let testsFailed = 0;
    let deadEnds = 0;

    for (const snap of this.snapshots) {
      if (snap.eventType === 'edit') refactors++;
      else if (snap.eventType === 'test_run' || snap.eventType === 'test_passed' || snap.eventType === 'test_failed') {
        testAttempts++;
        if (snap.eventType === 'test_passed') testsPassed++;
        if (snap.eventType === 'test_failed') testsFailed++;
      } else if (snap.eventType === 'reset') {
        deadEnds++;
      }
    }

    return {
      totalSnapshots: this.snapshots.length,
      durationSeconds: this.getDurationSeconds(),
      refactorIterations: refactors,
      testAttempts,
      testsPassedMilestones: testsPassed,
      testsFailedMilestones: testsFailed,
      deadEndsEncountered: deadEnds,
    };
  }

  private pushSnapshot(
    eventType: TimelineEventType,
    code: string,
    language: SupportedLang,
    activeTestsPassed?: { passed: number; total: number } | null,
    label?: string
  ): TimelineSnapshot {
    const now = Date.now();
    const elapsed = Math.max(0, now - this.sessionStart);
    const chars = code.length;
    const lines = countLines(code);
    const deltaChars = chars - this.lastCodeChars;

    const snapshot: TimelineSnapshot = {
      id: `snap_${elapsed}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: elapsed,
      wallClock: new Date(now).toISOString(),
      code,
      language,
      eventType,
      activeTestsPassed: activeTestsPassed ?? null,
      stats: {
        lines,
        chars,
        deltaChars,
      },
      label,
    };

    // Cap to 600 snapshots to guarantee zero memory creep during long sessions
    if (this.snapshots.length >= 600) {
      // Keep initial snapshot (index 0) and drop intermediate routine edits
      const pruneIdx = this.snapshots.findIndex((s, i) => i > 0 && s.eventType === 'edit');
      if (pruneIdx > 0) {
        this.snapshots.splice(pruneIdx, 1);
      }
    }

    this.snapshots.push(snapshot);
    this.lastCode = code;
    this.lastCodeChars = chars;
    this.lastCodeLines = lines;

    this.persistToStorage();
    this.notify();
    return snapshot;
  }

  // 1. Initial Boilerplate
  public captureBoilerplate(code: string, language: SupportedLang) {
    if (this.snapshots.length > 0) return;
    this.lang = language;
    this.pushSnapshot('initial', code, language, null, 'Starter Template Loaded');
  }

  // 2. Debounced Code Changes
  public onCodeChange(code: string, language: SupportedLang) {
    this.lang = language;
    if (code === this.lastCode) return;

    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }

    const charDiff = Math.abs(code.length - this.lastCodeChars);
    const lineDiff = Math.abs(countLines(code) - this.lastCodeLines);
    const isMajorDiff = charDiff >= MAJOR_CHAR_DIFF || lineDiff >= MAJOR_LINE_DIFF;
    const debounceDelay = isMajorDiff ? DEBOUNCE_MAJOR_MS : DEBOUNCE_ROUTINE_MS;

    this.pendingTimer = setTimeout(() => {
      this.flushPendingEdit(code, language, isMajorDiff ? 'Major Refactor / Block Edit' : 'Iterative Edit');
    }, debounceDelay);
  }

  public flushPendingEdit(code?: string, language?: SupportedLang, customLabel?: string) {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    const targetCode = code !== undefined ? code : this.lastCode;
    const targetLang = language || this.lang;

    if (this.snapshots.length > 0 && targetCode === this.snapshots[this.snapshots.length - 1].code) {
      return;
    }

    this.pushSnapshot('edit', targetCode, targetLang, null, customLabel || 'Code Modification');
  }

  // 3. Test Run Milestone
  public captureTestRun(code: string, language: SupportedLang, passed: number, total: number) {
    this.flushPendingEdit(code, language);
    const allPassed = total > 0 && passed === total;
    const eventType: TimelineEventType = allPassed ? 'test_passed' : 'test_failed';
    const label = allPassed
      ? `All Tests Passed (${passed}/${total})`
      : `Test Run: ${passed}/${total} Passed`;

    this.pushSnapshot(eventType, code, language, { passed, total }, label);
  }

  // 4. Dead-End / Editor Reset
  public captureReset(starterCode: string, language: SupportedLang) {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.pushSnapshot('reset', starterCode, language, null, 'Dead End: Reverted to Starter Boilerplate');
  }

  // 5. Final Submission Milestone
  public captureSubmission(code: string, language: SupportedLang, passed: number, total: number) {
    this.flushPendingEdit(code, language);
    this.pushSnapshot(
      'submission',
      code,
      language,
      { passed, total },
      `Final Solution Submitted (${passed}/${total} Tests)`
    );
  }

  // Clear local saved timeline after confirmed sync
  public clearStorage() {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(this.storageKey());
    } catch {}
  }
}

// ════════════════════════════════════════════════════════════
// React Hook for Workspace Integration
// ════════════════════════════════════════════════════════════

interface UseTimelineCaptureProps {
  problemId: string;
  problemTitle: string;
  initialCode: string;
  initialLang: SupportedLang;
  user?: User | null;
}

export function useTimelineCapture({
  problemId,
  problemTitle,
  initialCode,
  initialLang,
  user,
}: UseTimelineCaptureProps) {
  const engineRef = useRef<TimelineCaptureEngine | null>(null);
  const [snapshots, setSnapshots] = useState<TimelineSnapshot[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [timelineId, setTimelineId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Initialize or re-initialize when problem changes
  useEffect(() => {
    const engine = new TimelineCaptureEngine(problemId, problemTitle, initialLang, initialCode);
    engineRef.current = engine;

    const unsubscribe = engine.subscribe((snaps) => {
      setSnapshots(snaps);
    });

    return () => {
      unsubscribe();
      engine.flushPendingEdit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId, problemTitle]);

  const recordCodeChange = useCallback((code: string, lang: SupportedLang) => {
    engineRef.current?.onCodeChange(code, lang);
  }, []);

  const recordTestRun = useCallback((code: string, lang: SupportedLang, passed: number, total: number) => {
    engineRef.current?.captureTestRun(code, lang, passed, total);
  }, []);

  const recordReset = useCallback((starterCode: string, lang: SupportedLang) => {
    engineRef.current?.captureReset(starterCode, lang);
  }, []);

  const recordSubmission = useCallback((code: string, lang: SupportedLang, passed: number, total: number) => {
    engineRef.current?.captureSubmission(code, lang, passed, total);
  }, []);

  const syncTimeline = useCallback(
    async (currentCode?: string, currentLang?: SupportedLang): Promise<string | null> => {
      if (!engineRef.current) return null;
      if (currentCode) {
        engineRef.current.flushPendingEdit(currentCode, currentLang);
      }

      const currentSnaps = engineRef.current.getSnapshots();
      if (currentSnaps.length === 0) return null;

      setIsSyncing(true);
      try {
        const payload = {
          problem_id: problemId,
          problem_title: problemTitle,
          user_github: user?.github || null,
          user_name: user?.name || null,
          snapshots: currentSnaps,
          duration_seconds: engineRef.current.getDurationSeconds(),
        };

        const res = await fetch('/api/timeline/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error(`Failed to save timeline: ${res.statusText}`);
        }

        const data = await res.json();
        if (data?.id) {
          setTimelineId(data.id);
          setLastSavedAt(new Date().toISOString());
          return data.id;
        }
        return null;
      } catch (err) {
        console.warn('[TimelineCapture] Failed to sync replay timeline to Supabase:', err);
        return null;
      } finally {
        setIsSyncing(false);
      }
    },
    [problemId, problemTitle, user?.github, user?.name]
  );

  const getSummary = useCallback((): TimelineSummary => {
    if (!engineRef.current) {
      return {
        totalSnapshots: 0,
        durationSeconds: 0,
        refactorIterations: 0,
        testAttempts: 0,
        testsPassedMilestones: 0,
        testsFailedMilestones: 0,
        deadEndsEncountered: 0,
      };
    }
    return engineRef.current.getSummary();
  }, []);

  return {
    snapshots,
    timelineId,
    isSyncing,
    lastSavedAt,
    recordCodeChange,
    recordTestRun,
    recordReset,
    recordSubmission,
    syncTimeline,
    getSummary,
  };
}
