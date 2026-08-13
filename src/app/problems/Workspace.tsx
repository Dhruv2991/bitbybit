'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic                                       from 'next/dynamic';
import { getSupabaseClient }                         from '@/lib/supabase';
import { calendarDaysBetween }                       from '@/lib/streak';
import LangTabs                                      from '@/components/editor/LangTabs';
import TestResults                                   from '@/components/editor/TestResults';
import type { SupportedLang, Problem, User }         from '@/types/database';
import { STARTER_CODE }                              from '@/types/database';
import {
  runInBrowser,
  runOnServer,
  getStrategy,
  type RunResult,
} from '@/lib/browserExecutor';
import { sanitizeHtml } from '@/lib/sanitize';
import { isActiveSubscription } from '@/lib/subscription';
import {
  explainFailure,
  getAiHint,
  reviewCode,
  getUsageStatus,
  setAiUser,
  refreshUsageFromServer,
  validateApproach,
  generateEditorial,
  type FailedCase,
  type ApproachResult,
  type Editorial,
} from '@/lib/gemini';
import ProblemDiscussion from '@/components/discussion/ProblemDiscussion';

const CodeEditor = dynamic(() => import('@/components/editor/CodeEditor'), { ssr: false });

// ── Draft persistence helpers ────────────────────────────────────────────────

function draftKey(problemId: string, lang: SupportedLang) {
  return `bb_draft__${problemId}__${lang}`;
}
function loadDraft(problemId: string, lang: SupportedLang, problem: Problem): string {
  try {
    const saved = localStorage.getItem(draftKey(problemId, lang));
    if (saved !== null) return saved;
  } catch {}
  return STARTER_CODE[lang](problem);
}
function saveDraft(problemId: string, lang: SupportedLang, code: string) {
  try { localStorage.setItem(draftKey(problemId, lang), code); } catch {}
}
function clearDraft(problemId: string, lang: SupportedLang) {
  try { localStorage.removeItem(draftKey(problemId, lang)); } catch {}
}

// ── Arena draft helpers (scoped to contestId so they don't mix with regular drafts) ──

function arenaDraftKey(contestId: string, problemId: string, lang: SupportedLang) {
  return `bb_arena_draft__${contestId}__${problemId}__${lang}`;
}
function loadArenaDraft(contestId: string, problemId: string, lang: SupportedLang, problem: Problem): string {
  try {
    const saved = localStorage.getItem(arenaDraftKey(contestId, problemId, lang));
    if (saved !== null) return saved;
  } catch {}
  return STARTER_CODE[lang](problem);
}
function saveArenaDraft(contestId: string, problemId: string, lang: SupportedLang, code: string) {
  try { localStorage.setItem(arenaDraftKey(contestId, problemId, lang), code); } catch {}
}
function clearArenaDraft(contestId: string, problemId: string, lang: SupportedLang) {
  try { localStorage.removeItem(arenaDraftKey(contestId, problemId, lang)); } catch {}
}

// Formats a keyboard shortcut hint for tooltips — ⌘ on Mac, Ctrl elsewhere,
// matching what Monaco's own keybindings actually respond to.
function shortcutLabel(key: string, withShift = false) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const mod = isMac ? '⌘' : 'Ctrl+';
  const shift = withShift ? (isMac ? '⇧' : 'Shift+') : '';
  return `${mod}${shift}${key}`;
}

// Applies the same streak/points/problems_solved logic as the admin's
// manual awardPoints() used to, but runs automatically at submit time
// now that regular problem submissions are auto-graded from test
// results instead of waiting on manual admin approval.
//   - pointsDelta: how much to ADD to total_points (0 if a resubmission
//     didn't beat the user's previous best score for this problem)
//   - isFirstSolve: whether this is the first time this problem has
//     ever had a submission from this user (controls problems_solved)
// Streak/last_solved_at always update on a genuine submit, even on a
// resubmission of an already-solved problem — that's what makes
// resubmitting today still count toward today's streak.
export async function syncMemberProgress(
  db: ReturnType<typeof getSupabaseClient>,
  github: string,
  name: string,
  pointsDelta: number,
  isFirstSolve: boolean,
) {
  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ex } = await (db.from('members') as any)
    .select('*').eq('github', github).maybeSingle();

  if (ex) {
    const last = ex.last_solved_at ? new Date(ex.last_solved_at) : null;
    const daysSinceLast = last ? calendarDaysBetween(last, now) : 999;
    const newStreak =
      daysSinceLast === 0 ? (ex.streak || 1) :
      daysSinceLast === 1 ? (ex.streak || 0) + 1 : 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('members') as any).update({
      total_points:    (ex.total_points || 0) + pointsDelta,
      problems_solved: (ex.problems_solved || 0) + (isFirstSolve ? 1 : 0),
      streak:          newStreak,
      last_solved_at:  now.toISOString(),
    }).eq('github', github);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from('members') as any).insert([{
      github, name,
      total_points:    pointsDelta,
      problems_solved: isFirstSolve ? 1 : 0,
      streak:          1,
      last_solved_at:  now.toISOString(),
    }]);
  }
}

// ── Tiny markdown parser: bold + inline code ─────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`'))
      return (
        <code key={i} className="bg-[#1a1a2e] text-[var(--purple)] px-1.5 py-px rounded text-[11px] font-mono">
          {part.slice(1, -1)}
        </code>
      );
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="text-[var(--text)] font-medium">{part.slice(2, -2)}</strong>;
    return <span key={i}>{part}</span>;
  });
}

// ── AI output components ─────────────────────────────────────────────────────

// ── 1. AI Hint panel ─────────────────────────────────────────────────────────

interface AIHintPanelProps {
  hintText:  string;
  hintNum:   number;
  loading:   boolean;
  used:      number;
  limit:     number;
  cooldown:  number;
  onGetHint: () => void;
}

function AIHintPanel({ hintText, hintNum, loading, used, limit, cooldown, onGetHint }: AIHintPanelProps) {
  const exhausted = used >= limit;
  const canClick  = !loading && cooldown === 0 && !exhausted;
  const pct       = cooldown > 0 ? (cooldown / 30) * 100 : 0;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden mt-4">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--acc)] text-xs">✦</span>
          <span className="text-[11px] font-bold text-[var(--acc)] tracking-wider uppercase">
            AI Hint
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i}
              className={`w-1.5 h-1.5 rounded-full ${i < used ? 'bg-[var(--border)] border border-[var(--muted2)]' : 'bg-[var(--acc)]'}`}
            />
          ))}
        </div>
      </div>

      <div className="p-3.5 flex flex-col gap-2.5">
        {hintText && !loading && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="bg-[rgba(var(--acc-rgb),0.063)] border border-[rgba(var(--acc-rgb),0.188)] text-[var(--acc)] text-[10px] font-bold px-2.5 py-0.5 rounded-full tracking-wider">
                Hint {hintNum - 1}
              </span>
              <span className="text-[10px] text-[var(--muted2)]">of {limit}</span>
            </div>
            <p className="text-xs text-[var(--text-soft)] leading-relaxed m-0 bg-[rgba(var(--acc-rgb),0.02)] border border-[rgba(var(--acc-rgb),0.082)] rounded-lg px-3 py-2.5">
              {renderInline(hintText)}
            </p>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-[11px] text-[var(--muted)] font-mono">
            <div className="w-[11px] h-[11px] border-[1.5px] border-[var(--acc)] border-t-transparent rounded-full animate-spin" />
            Generating hint based on your code…
          </div>
        )}

        {cooldown > 0 && (
          <div>
            <div className="flex justify-between text-[10px] text-[var(--muted2)] mb-1 font-mono">
              <span>Next hint in</span>
              <span className="text-[var(--warn)] font-semibold">{cooldown}s</span>
            </div>
            <div className="bg-[var(--border)] rounded h-0.5">
              <div className="h-full rounded bg-[var(--warn)] transition-[width] duration-[900ms] ease-linear"
                style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        <button
          onClick={onGetHint}
          disabled={!canClick}
          className={`w-full py-2 rounded-lg text-[11px] font-bold font-mono tracking-wide flex items-center justify-center gap-1.5 transition-all duration-200
            border ${canClick ? 'border-[rgba(var(--acc-rgb),0.188)] bg-[rgba(var(--acc-rgb),0.031)] text-[var(--acc)] cursor-pointer' : 'border-[var(--border)] bg-[var(--bg2)] text-[var(--muted2)] cursor-not-allowed'}`}
        >
          {loading ? '✦ Thinking…'
            : exhausted ? 'No hints remaining'
            : cooldown > 0 ? `Wait ${cooldown}s`
            : hintText ? '✦ Next hint'
            : '✦ Get AI hint'}
        </button>

        <div className="flex justify-between">
          <span className="text-[9px] text-[var(--muted2)] font-mono">
            Hints used: <span className="text-[var(--muted2)]">{used} / {limit}</span>
          </span>
          <span className="text-[9px] text-[var(--muted2)] font-mono">per problem</span>
        </div>
      </div>
    </div>
  );
}

// ── 2. AI Failure Explainer ───────────────────────────────────────────────────

function parseExplanation(text: string): string[] {
  const numbered = text.split(/\n?\s*[1-3][.)]\s+/).filter(Boolean);
  if (numbered.length >= 2) return numbered.slice(0, 3);
  const byPara = text.split(/\n{2,}/).filter(Boolean);
  if (byPara.length >= 2) return byPara.slice(0, 3);
  return [text];
}

const STEP_META = [
  { label: 'Root cause', color: '#f0b429' },
  { label: 'The bug',    color: '#ff6b6b' },
  { label: 'Nudge',      color: '#00e87a' },
];

interface AIFailurePanelProps {
  text:      string;
  loading:   boolean;
  used:      number;
  limit:     number;
  onAnalyze: () => void;
}

function AIFailurePanel({ text, loading, used, limit, onAnalyze }: AIFailurePanelProps) {
  const steps   = text ? parseExplanation(text) : [];
  const isLimit = text.startsWith('⛔') || text.startsWith('⚠️') || text.startsWith('⭐');

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--warn)] text-xs">✦</span>
          <span className="text-[11px] font-bold text-[var(--warn)] tracking-wider uppercase">
            AI Debugger
          </span>
        </div>
        <button
          onClick={onAnalyze}
          disabled={loading || used >= limit}
          className={`text-[10px] font-bold px-2.5 py-1 rounded-md font-mono tracking-wide bg-[rgba(var(--warn-rgb),0.063)] border border-[rgba(var(--warn-rgb),0.145)]
            ${loading || used >= limit ? 'text-[var(--muted)] cursor-not-allowed' : 'text-[var(--warn)] cursor-pointer'}`}
        >
          {loading ? '✦ Analyzing…' : text && !isLimit ? '✦ Re-analyze' : '✦ Why did it fail?'}
        </button>
      </div>

      <div className="p-3.5 flex flex-col gap-2">
        {loading && (
          <div className="flex items-center gap-2 text-[11px] text-[var(--muted)] font-mono">
            <div className="w-[11px] h-[11px] border-[1.5px] border-[var(--warn)] border-t-transparent rounded-full animate-spin" />
            Analyzing your code and test cases…
          </div>
        )}

        {!loading && isLimit && (
          <p className="text-xs text-[var(--warn)] m-0 font-mono">{text}</p>
        )}

        {!loading && text && !isLimit && steps.map((step, i) => {
          const meta = STEP_META[i] ?? STEP_META[0];
          return (
            <div key={i} className="flex gap-2.5 items-start rounded-lg px-3 py-2.5"
              style={{ background: `${meta.color}12`, border: `1px solid ${meta.color}18` }}>
              <div className="shrink-0 w-5 h-5 rounded-full bg-[var(--bg2)] flex items-center justify-center text-[10px] font-bold font-mono mt-px"
                style={{ border: `1px solid ${meta.color}40`, color: meta.color }}>
                {i + 1}
              </div>
              <div className="text-xs text-[var(--text2)] leading-relaxed font-mono">
                <span style={{ color: meta.color, fontWeight: 600 }}>{meta.label} — </span>
                {renderInline(step)}
              </div>
            </div>
          );
        })}

        {!loading && !text && (
          <p className="text-[11px] text-[var(--muted2)] m-0 font-mono">
            Click above to analyze why your code failed the test cases.
          </p>
        )}

        <div className="flex justify-between pt-1 border-t border-[var(--border)] mt-0.5">
          <span className="text-[9px] text-[var(--muted2)] font-mono">
            Today: <span className="text-[var(--muted2)]">{used} / {limit}</span>
          </span>
          <span className="text-[9px] text-[var(--muted2)] font-mono">resets midnight</span>
        </div>
      </div>
    </div>
  );
}

// ── 3. AI Code Review panel ───────────────────────────────────────────────────

function parseReview(text: string) {
  const get = (keys: string[]) => {
    const pat = new RegExp(
      `(?:${keys.map(k => k.replace(/\s/g, '[\\s\\-_]*')).join('|')})[:\\-\\*\\s]+([^\\n*]+(?:\\n(?![\\d\\-*#])[^\\n*]+)*)`,
      'i'
    );
    const m = text.match(pat);
    return m ? m[1].replace(/\*\*/g, '').trim() : '';
  };
  return {
    time:  get(['time complexity', 'time']),
    space: get(['space complexity', 'space']),
    qual:  get(['code quality', 'quality', 'improvement']),
    alt:   get(['alternative approach', 'alternative']),
  };
}

function complexityBadge(t: string) {
  const s = t.toLowerCase();
  if (s.includes('o(1)') || s.includes('optimal'))  return { label: 'Optimal', color: '#00e87a', bg: '#00e87a18' };
  if (s.includes('o(n log') || s.includes('o(log')) return { label: 'Good',    color: '#00e87a', bg: '#00e87a18' };
  if (s.includes('o(n²)') || s.includes('o(n^2)'))  return { label: 'Slow',    color: '#f0b429', bg: '#f0b42918' };
  if (s.includes('o(n)'))                            return { label: 'Linear',  color: '#a78bfa', bg: '#a78bfa18' };
  return { label: 'Review', color: '#a78bfa', bg: '#a78bfa18' };
}

interface AIReviewPanelProps {
  text:     string;
  loading:  boolean;
  used:     number;
  limit:    number;
  onReview: () => void;
}

function AIReviewPanel({ text, loading, used, limit, onReview }: AIReviewPanelProps) {
  const r         = text ? parseReview(text) : { time: '', space: '', qual: '', alt: '' };
  const timeBadge = complexityBadge(r.time);
  const spcBadge  = complexityBadge(r.space);
  const isLimit   = text.startsWith('⛔') || text.startsWith('⚠️') || text.startsWith('⭐');
  const hasData   = !isLimit && (r.time || r.space || r.qual || r.alt);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--purple)] text-xs">✦</span>
          <span className="text-[11px] font-bold text-[var(--purple)] tracking-wider uppercase">
            AI Code Review
          </span>
        </div>
        <button
          onClick={onReview}
          disabled={loading || used >= limit}
          className={`text-[10px] font-bold px-2.5 py-1 rounded-md font-mono tracking-wide flex items-center gap-1 bg-[rgba(var(--purple-rgb),0.063)] border border-[rgba(var(--purple-rgb),0.145)]
            ${loading || used >= limit ? 'text-[var(--muted)] cursor-not-allowed' : 'text-[var(--purple)] cursor-pointer'}`}
        >
          {loading ? '✦ Reviewing…' : text && !isLimit ? '✦ Re-review' : '✦ Review my code'}
        </button>
      </div>

      <div className="p-3.5 flex flex-col gap-2">
        {loading && (
          <div className="flex items-center gap-2 text-[11px] text-[var(--muted)] font-mono">
            <div className="w-[11px] h-[11px] border-[1.5px] border-[var(--purple)] border-t-transparent rounded-full animate-spin" />
            Reviewing your solution…
          </div>
        )}

        {!loading && isLimit && (
          <p className="text-xs text-[var(--purple)] m-0 font-mono">{text}</p>
        )}

        {!loading && hasData && (
          <>
            {(r.time || r.space) && (
              <div className="grid grid-cols-2 gap-2 mb-0.5">
                {[
                  { label: 'Time complexity',  val: r.time,  badge: timeBadge },
                  { label: 'Space complexity', val: r.space, badge: spcBadge  },
                ].map(({ label, val, badge }) => val ? (
                  <div key={label} className="bg-[var(--bg2)] border border-[var(--border)] rounded-lg px-3 py-2.5">
                    <div className="text-[9px] text-[var(--muted)] uppercase tracking-wider mb-1.5 font-mono">
                      {label}
                    </div>
                    <div className="text-xs text-[var(--text-soft)] font-medium font-mono">
                      {val.split(/\s+/).slice(0, 2).join(' ')}
                      <span className="inline-block text-[9px] font-bold px-1.5 py-px rounded ml-1.5"
                        style={{ background: badge.bg, color: badge.color }}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                ) : null)}
              </div>
            )}

            {r.qual && (
              <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-lg px-3 py-2.5 flex gap-2 items-start">
                <span className="text-[var(--purple)] text-sm shrink-0 mt-px">ℹ</span>
                <div className="text-xs text-[var(--text2)] leading-relaxed font-mono">
                  <span className="text-[var(--text-soft)] font-medium">Code quality — </span>
                  {renderInline(r.qual)}
                </div>
              </div>
            )}

            {r.alt && (
              <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-lg px-3 py-2.5 flex gap-2 items-start">
                <span className="text-[var(--blue)] text-sm shrink-0 mt-px">⚡</span>
                <div className="text-xs text-[var(--text2)] leading-relaxed font-mono">
                  <span className="text-[var(--text-soft)] font-medium">Alternative — </span>
                  {renderInline(r.alt)}
                </div>
              </div>
            )}
          </>
        )}

        {!loading && text && !isLimit && !hasData && (
          <p className="text-xs text-[var(--text2)] leading-relaxed m-0 font-mono whitespace-pre-wrap">
            {text}
          </p>
        )}

        {!loading && !text && (
          <p className="text-[11px] text-[var(--muted2)] m-0 font-mono">
            Click above to get a complexity and quality review of your code.
          </p>
        )}

        <div className="flex justify-between pt-1 border-t border-[var(--border)] mt-0.5">
          <span className="text-[9px] text-[var(--muted2)] font-mono">
            Reviews today: <span className="text-[var(--muted2)]">{used} / {limit}</span>
          </span>
          <span className="text-[9px] text-[var(--muted2)] font-mono">resets midnight</span>
        </div>
      </div>
    </div>

  );
}


// ── 4. Approach Validator panel ───────────────────────────────────────────────

interface ApproachPanelProps {
  result:     ApproachResult | null;
  loading:    boolean;
  hasText:    boolean;
  onValidate: () => void;
}

function ApproachPanel({ result, loading, hasText, onValidate }: ApproachPanelProps) {
  const verdictMeta = result ? (
    result.verdict === 'correct' ? { color: '#00e87a', bg: '#00e87a18', border: '#00e87a20', icon: '✓', label: 'Looks correct' } :
    result.verdict === 'partial' ? { color: '#f0b429', bg: '#f0b42918', border: '#f0b42920', icon: '⚠', label: 'Needs refinement' } :
                                   { color: '#ff6b6b', bg: '#ff6b6b18', border: '#ff6b6b20', icon: '✗', label: 'Won\'t work' }
  ) : null;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden mt-4">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-1.5">
          <span className="text-[var(--blue)] text-xs">✦</span>
          <span className="text-[11px] font-bold text-[var(--blue)] tracking-wider uppercase">
            Approach Validator
          </span>
        </div>
        <button
          onClick={onValidate}
          disabled={loading || !hasText}
          className={`text-[10px] font-bold px-2.5 py-1 rounded-md font-mono tracking-wide bg-[rgba(var(--blue-rgb),0.063)] border border-[rgba(var(--blue-rgb),0.145)]
            ${loading || !hasText ? 'text-[var(--muted)] cursor-not-allowed' : 'text-[var(--blue)] cursor-pointer'}`}
        >
          {loading ? '✦ Validating…' : result ? '✦ Re-validate' : '✦ Validate approach'}
        </button>
      </div>

      <div className="p-3.5 flex flex-col gap-2">
        {loading && (
          <div className="flex items-center gap-2 text-[11px] text-[var(--muted)] font-mono">
            <div className="w-[11px] h-[11px] border-[1.5px] border-[var(--blue)] border-t-transparent rounded-full animate-spin" />
            Evaluating your approach…
          </div>
        )}

        {!loading && result && verdictMeta && (
          <>
            {/* Verdict badge */}
            <div className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: verdictMeta.bg, border: `1px solid ${verdictMeta.border}` }}>
              <span className="text-sm font-bold" style={{ color: verdictMeta.color }}>
                {verdictMeta.icon}
              </span>
              <div>
                <div className="text-[11px] font-bold font-mono" style={{ color: verdictMeta.color }}>
                  {verdictMeta.label}
                </div>
                {result.summary && (
                  <div className="text-[11px] text-[var(--text2)] font-mono mt-0.5">
                    {result.summary}
                  </div>
                )}
              </div>
            </div>

            {/* Feedback */}
            {result.feedback && !result.feedback.startsWith('⛔') && !result.feedback.startsWith('⭐') && (
              <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-xs text-[var(--text-soft)] leading-relaxed font-mono">
                {result.feedback}
              </div>
            )}

            {/* Subscriber message */}
            {(result.feedback.startsWith('⛔') || result.feedback.startsWith('⭐')) && (
              <p className="text-xs text-[var(--blue)] m-0 font-mono">{result.feedback}</p>
            )}

            {/* Complexity */}
            {result.complexity && (
              <div className="flex items-center gap-2 bg-[var(--bg2)] border border-[var(--border)] rounded-lg px-3 py-2">
                <span className="text-[10px] text-[var(--muted)] font-mono uppercase tracking-wider">
                  Complexity:
                </span>
                <span className="text-[11px] text-[var(--purple)] font-mono font-semibold">
                  {result.complexity}
                </span>
              </div>
            )}

            {/* Suggestion for wrong/partial */}
            {result.suggestion && result.verdict !== 'correct' && (
              <div className="flex gap-2 items-start bg-[var(--bg2)] border border-[var(--border)] rounded-lg px-3 py-2.5">
                <span className="text-[var(--warn)] text-xs shrink-0 mt-px">💡</span>
                <div className="text-xs text-[var(--text2)] leading-relaxed font-mono">
                  <span className="text-[var(--text-soft)] font-medium">Hint — </span>
                  {result.suggestion}
                </div>
              </div>
            )}
          </>
        )}

        {!loading && !result && (
          <p className="text-[11px] text-[var(--muted2)] m-0 font-mono">
            Describe your approach above, then click validate to check if it's correct before coding.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main Workspace ────────────────────────────────────────────────────────────

interface WorkspaceProps {
  problem: Problem;
  user:    User | null;
  onClose: () => void;
  onArenaSubmit?:     (code: string, lang: string, passed: number, total: number) => void;
  onArenaCodeChange?: (code: string, lang: string) => void;
  onSolved?:          (problemId: string, details?: { code: string; lang: string; passed: number; total: number; pointsAwarded: number }) => void;
  isWeekly?:          boolean;
  practiceMode?:      boolean;
  contestId?:         string;   // passed in arena mode for draft scoping
}

type ToastType = 'ok' | 'err' | 'info' | 'warn';
interface Toast { msg: string; type: ToastType; id: number; }

export default function Workspace({ problem, user, onClose, onArenaSubmit, onArenaCodeChange, onSolved, isWeekly, practiceMode, contestId }: WorkspaceProps) {
  const db = getSupabaseClient();

  const [lang,          setLang]          = useState<SupportedLang>('python');
  const [code,          setCode]          = useState(() => {
    if (onArenaSubmit && contestId)
      return loadArenaDraft(contestId, problem.id, 'python', problem);
    if (!onArenaSubmit)
      return loadDraft(problem.id, 'python', problem);
    return STARTER_CODE['python'](problem);
  });
  const [approach,      setApproach]      = useState('');
  const [running,       setRunning]       = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [testResult,    setTestResult]    = useState<RunResult | null>(null);
  const [statusMsg,     setStatusMsg]     = useState('Ready to submit');
  const [submitBlocked, setSubmitBlocked] = useState(false);
  const [runError,      setRunError]      = useState<string | null>(null);
  const [runStatus,     setRunStatus]     = useState('');
  const [progress,      setProgress]      = useState<{ done: number; total: number } | null>(null);
  const [toasts,        setToasts]        = useState<Toast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; resolve: (v: boolean) => void } | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileTab,     setMobileTab]     = useState<'problem' | 'editor'>('problem');
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [hintCooldown,  setHintCooldown]  = useState(false);
  const [hintTimer,     setHintTimer]     = useState(0);
  const hintTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── AI state ──────────────────────────────────────────────────────────────
  const [aiExplanation,    setAiExplanation]    = useState('');
  const [aiExplaining,     setAiExplaining]     = useState(false);
  const [aiReview,         setAiReview]         = useState('');
  const [aiReviewing,      setAiReviewing]      = useState(false);
  const [aiHint,           setAiHint]           = useState('');
  const [aiHinting,        setAiHinting]        = useState(false);
  const [aiHintNum,        setAiHintNum]        = useState(1);
  const [hintCooldownSecs, setHintCooldownSecs] = useState(0);
  const [usage,            setUsage]            = useState(() => getUsageStatus());
  const [approachResult,   setApproachResult]   = useState<ApproachResult | null>(null);
  const [validatingApproach, setValidatingApproach] = useState(false);
  const [editorial,     setEditorial]     = useState<Editorial | null>(() => {
    try {
      const raw = localStorage.getItem(`bb_editorial_${problem.id}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [editorialLoading, setEditorialLoading] = useState(false);
  const [editorialTab,     setEditorialTab]     = useState<'python' | 'javascript'>('python');
  const [leftTab,          setLeftTab]          = useState<'problem' | 'editorial'>('problem');

  async function handleGenerateEditorial() {
    if (editorial || editorialLoading) return;
    setEditorialLoading(true);
    try {
      const { editorial: result, blocked } = await generateEditorial(problem.title, problem.description || '');
      if (result) {
        setEditorial(result);
        try { localStorage.setItem(`bb_editorial_${problem.id}`, JSON.stringify(result)); } catch {}
      } else {
        showToast(blocked || 'Could not generate editorial — try again in a moment.', 'err');
      }
    } catch {
      showToast('Editorial generation failed.', 'err');
    }
    setUsage(getUsageStatus());
    setEditorialLoading(false);
  }


  // Cooldown ticker for AI hint
  useEffect(() => {
    if (hintCooldownSecs <= 0) return;
    const id = setInterval(() => setHintCooldownSecs(s => s <= 1 ? (clearInterval(id), 0) : s - 1), 1000);
    return () => clearInterval(id);
  }, [hintCooldownSecs]);

  // ── Keyboard shortcuts: Ctrl/Cmd+Enter = run, Ctrl/Cmd+Shift+Enter = submit, ? = shortcuts modal ──
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement | null;
      const inTextInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      if (mod && e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          if (!submitting && !submitBlocked) submitSolution();
        } else {
          if (!running) runTests();
        }
        return;
      }
      if (e.key === '?' && !inTextInput) {
        e.preventDefault();
        setShortcutsOpen(o => !o);
      }
      if (e.key === 'Escape' && shortcutsOpen) {
        setShortcutsOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [running, submitting, submitBlocked, shortcutsOpen]);

  // ── Set AI user + sync limits from Supabase on problem open ──────────────
  useEffect(() => {
    if (!user?.github) return;
    // Check subscriber status then register with AI module
    (db.from('subscribers') as any)
      .select('status, current_period_end').eq('github', user.github).maybeSingle()
      .then(({ data }: any) => {
        const isSub = isActiveSubscription(data?.status, data?.current_period_end);
        setAiUser(user.github, isSub);
        refreshUsageFromServer()
          .then(() => setUsage(getUsageStatus()))
          .catch(() => {});
      })
      .catch(() => { setAiUser(user.github, false); });
  }, [user?.github, problem.id]);

  function confirmAction(message: string): Promise<boolean> {
    return new Promise(resolve => setConfirmDialog({ message, resolve }));
  }
  const toastCounter = useRef(0);
  const arenaCodeChangeTimer = useRef<NodeJS.Timeout | null>(null);

  function handleCodeChange(newCode: string) {
    setCode(newCode);
    if (!onArenaSubmit) saveDraft(problem.id, lang, newCode);
    if (onArenaSubmit && contestId) saveArenaDraft(contestId, problem.id, lang, newCode);
    if (!onArenaCodeChange) return;
    if (arenaCodeChangeTimer.current) clearTimeout(arenaCodeChangeTimer.current);
    arenaCodeChangeTimer.current = setTimeout(() => onArenaCodeChange(newCode, lang), 500);
  }

  function showToast(msg: string, type: ToastType = 'info') {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { msg, type, id }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }

  useEffect(() => {
    if (!user) return;
    if (practiceMode) { setStatusMsg('🏁 Practice mode — no points will be awarded.'); return; }
    if (isWeekly) {
      (async () => {
        const { data } = await (db.from('weekly_submissions') as any)
          .select('id, status').eq('problem_id', problem.id).eq('github', user.github).limit(1);
        if (data?.length)
          setStatusMsg(data[0].status === 'approved' ? '✓ Already approved.' : '⏳ Submission pending review — resubmitting will replace it.');
      })();
      return;
    }
    (async () => {
      const { data } = await db.from('submissions').select('id, status')
        .eq('problem_id', problem.id).eq('github', user.github)
        .in('status', ['pending', 'approved']).limit(1).returns<{ id: string; status: string }[]>();
      if (data?.length)
        setStatusMsg(data[0].status === 'approved'
          ? '✓ Already approved — resubmitting will replace it.'
          : '⏳ Submission pending review — resubmitting will replace it.');
    })();
  }, [user, problem.id, isWeekly]);

  const handleLangChange = useCallback((l: SupportedLang) => {
    setLang(l);
    const nextCode = onArenaSubmit && contestId
      ? loadArenaDraft(contestId, problem.id, l, problem)
      : !onArenaSubmit
        ? loadDraft(problem.id, l, problem)
        : STARTER_CODE[l](problem);
    setCode(nextCode);
    setTestResult(null); setRunError(null); setRunStatus(''); setProgress(null);
    onArenaCodeChange?.(nextCode, l);
  }, [problem, onArenaSubmit]);

  // Wipes whatever's in the editor (and any saved draft for this
  // problem+language) and restores the original starter code — for
  // when someone's gone down a dead end and just wants a clean slate.
  async function resetEditor() {
    const starter = STARTER_CODE[lang](problem);
    if (code === starter) return;
    const proceed = await confirmAction('Reset the editor to the starter code? This clears your current code and any saved draft for this problem — it can\'t be undone.');
    if (!proceed) return;
    if (onArenaSubmit && contestId) clearArenaDraft(contestId, problem.id, lang);
    if (!onArenaSubmit) clearDraft(problem.id, lang);
    setCode(starter);
    setTestResult(null); setRunError(null); setRunStatus(''); setProgress(null);
    setStatusMsg('Editor reset to starter code.');
    onArenaCodeChange?.(starter, lang);
    showToast('↺ Editor reset to starter code', 'info');
  }

  function revealNextHint() {
    const hints = problem.hints || [];
    if (hintsRevealed >= hints.length || hintCooldown) return;
    setHintsRevealed(h => h + 1);
    if (hintsRevealed + 1 < hints.length) {
      setHintCooldown(true); setHintTimer(30);
      const countdown = setInterval(() => {
        setHintTimer(t => { if (t <= 1) { clearInterval(countdown); setHintCooldown(false); return 0; } return t - 1; });
      }, 1000);
      hintTimerRef.current = countdown;
    }
  }
  useEffect(() => () => { if (hintTimerRef.current) clearInterval(hintTimerRef.current); }, []);

  // ── AI handlers ───────────────────────────────────────────────────────────

  async function handleExplainFailure() {
    if (!testResult || aiExplaining) return;
    const failed = testResult.results.filter(r => !r.ok).map(r => ({
      input: r.input || '', expected: r.expected || '', actual: r.actual || '', error: r.error,
    })) as FailedCase[];
    if (!failed.length) return;
    setAiExplanation(''); setAiExplaining(true);
    const result = await explainFailure(problem.title, problem.description || '', lang, code, failed);
    setAiExplanation(result); setAiExplaining(false);
    setUsage(getUsageStatus());
  }

  async function handleAiHint() {
    if (aiHinting) return;
    setAiHint(''); setAiHinting(true);
    // Pass problem.id for accurate per-problem Supabase keying
    const result = await getAiHint(problem.title, problem.description || '', lang, code, aiHintNum, problem.id);
    setAiHint(result); setAiHinting(false);
    if (!result.startsWith('⛔') && !result.startsWith('⏳') && !result.startsWith('⭐')) setAiHintNum(n => n + 1);
    const fresh = getUsageStatus();
    setUsage(fresh);
    // Use problem.id for cooldown tracking (matches Supabase key)
    setHintCooldownSecs(fresh.getHintStatus(problem.id).cooldownSecondsLeft);
  }

  async function handleCodeReview() {
    if (!testResult || aiReviewing) return;
    setAiReview(''); setAiReviewing(true);
    const result = await reviewCode(problem.title, lang, code, testResult.passed, testResult.total);
    setAiReview(result); setAiReviewing(false);
    setUsage(getUsageStatus());
  }

  async function handleValidateApproach() {
    if (!approach.trim() || validatingApproach) return;
    setApproachResult(null); setValidatingApproach(true);
    const result = await validateApproach(problem.title, problem.description || '', approach);
    setApproachResult(result); setValidatingApproach(false);
  }

  async function runTests() {
    const cases = problem.test_cases || [];
    if (!cases.length) { setRunError('No test cases defined for this problem. You can still submit for review.'); return; }
    setRunning(true); setTestResult(null); setRunError(null); setProgress(null);
    const strategy = getStrategy(lang);
    try {
      let result: RunResult;
      if (strategy === 'browser') {
        setRunStatus(lang === 'python' ? 'Loading Python… (first run ~5s)' : 'Running in browser…');
        result = await runInBrowser(code, lang, cases, (done, total) => {
          setRunStatus(`Running test ${done} / ${total}…`); setProgress({ done, total });
        });
      } else {
        setRunStatus(`Compiling ${lang}…`);
        result = await runOnServer(code, lang, cases);
      }
      setTestResult(result);
      if (practiceMode && user) {
        (db.from('practice_attempts') as any).upsert(
          { problem_id: problem.id, github: user.github, name: user.name, lang },
          { onConflict: 'problem_id,github', ignoreDuplicates: true }
        ).then(() => {}).catch(() => {});
      }
    } catch (e: any) {
      setRunError('Execution error: ' + (e.message || 'Unknown'));
    } finally {
      setRunning(false); setRunStatus(''); setProgress(null);
    }
  }

  async function submitSolution() {
    if (!user) { showToast('Sign in to submit!', 'err'); return; }
    if (practiceMode) { showToast('🏁 Practice mode — submissions are not recorded and no points are awarded.', 'info'); return; }
    if (!onArenaSubmit && !isWeekly && !approach.trim()) { showToast('Please add an approach description or GitHub PR link.', 'warn'); return; }
    if (isWeekly && !testResult) { showToast('Please run the tests before submitting.', 'warn'); return; }
    if (submitBlocked) return;

    // ── Arena: if no test result yet, run tests in background first ───────
    let finalTestResult = testResult;
    if (onArenaSubmit && !testResult && (problem.test_cases || []).length > 0) {
      setSubmitting(true);
      setStatusMsg('Running tests before submitting…');
      showToast('⏳ Running tests in background before submitting…', 'info');
      try {
        const strategy = getStrategy(lang);
        if (strategy === 'browser') {
          finalTestResult = await runInBrowser(code, lang, problem.test_cases, () => {});
        } else {
          finalTestResult = await runOnServer(code, lang, problem.test_cases);
        }
        setTestResult(finalTestResult);
      } catch {
        // If tests fail to run, submit with 0/0 — admin can review code
        finalTestResult = null;
      }
    }

    setSubmitting(true); setStatusMsg('Uploading…');
    try {
      const passed = finalTestResult?.passed ?? 0;
      const total  = finalTestResult?.total  ?? 0;
      const pointsAwarded = total > 0 ? Math.floor((problem.points || 100) * (passed / total)) : (problem.points || 100);

      if (onArenaSubmit) {
        if (contestId) clearArenaDraft(contestId, problem.id, lang);
        onArenaSubmit(code, lang, passed, total); setSubmitBlocked(true); setApproach('');
        onSolved?.(problem.id, { code, lang, passed, total, pointsAwarded });
        showToast(`✅ Submitted "${problem.title}" — ${total > 0 ? `${passed}/${total} tests passed` : 'pending review'}`, 'ok');
        setTimeout(() => onClose(), 1200); return;
      }

      if (isWeekly) {
        const { data: existingWeekly } = await (db.from('weekly_submissions') as any)
          .select('id, status').eq('problem_id', problem.id).eq('github', user.github).limit(1);
        if (existingWeekly?.length) {
          const proceed = await confirmAction(existingWeekly[0].status === 'approved'
            ? 'This problem is already approved. Do you want to resubmit? This will replace your approved submission and require admin re-approval.'
            : 'You already have a pending submission for this problem. Do you want to resubmit and replace it?');
          if (!proceed) { setStatusMsg('Resubmission cancelled.'); setSubmitting(false); return; }
        }
        onSolved?.(problem.id, { code, lang, passed, total, pointsAwarded });
        clearDraft(problem.id, lang); setSubmitBlocked(true);
        setStatusMsg(`✅ Submitted — ${passed}/${total} tests, ${pointsAwarded} base pts`);
        showToast(`✅ "${problem.title}" — ${passed}/${total} tests passed, ${pointsAwarded} base pts (×time bonus)`, 'ok');
        return;
      }

      const { data: existing } = await db.from('submissions').select('id, status, points_awarded')
        .eq('problem_id', problem.id).eq('github', user.github)
        .limit(1).returns<{ id: string; status: string; points_awarded: number }[]>();
      const prevRow = existing?.[0];
      if (prevRow && prevRow.status === 'pending') {
        const proceed = await confirmAction('You already have a submission pending manual review for this problem (it has no test cases to auto-grade). Resubmitting will replace it.');
        if (!proceed) { setStatusMsg('Resubmission cancelled.'); setSubmitting(false); return; }
      }

      // Problems with test cases can be graded automatically right now —
      // no more waiting on an admin to manually approve. Problems with
      // no test cases at all can't be auto-verified, so those still go
      // to the admin review queue same as before.
      const canAutoGrade = total > 0;
      // "First solve" means no previously *approved* row for this problem
      // — checking row existence alone would wrongly skip the count for
      // a leftover unapproved row from before auto-grading existed.
      const isFirstSolve = prevRow?.status !== 'approved';
      // Never let a resubmission lower the score already on record —
      // keep whichever attempt scored higher.
      const finalPointsAwarded = canAutoGrade
        ? Math.max(pointsAwarded, prevRow?.points_awarded || 0)
        : pointsAwarded;
      const pointsDelta = canAutoGrade
        ? finalPointsAwarded - (prevRow?.points_awarded || 0)
        : 0;

      const { error } = await (db.from('submissions') as any).upsert([{
        problem_id: problem.id, problem_title: problem.title,
        name: user.name, github: user.github, lang, code, approach,
        status: canAutoGrade ? 'approved' : 'pending',
        tests_passed: passed, tests_total: total, points_awarded: finalPointsAwarded,
      }], { onConflict: 'problem_id,github' });
      if (error) throw error;

      if (canAutoGrade) {
        await syncMemberProgress(db, user.github, user.name, pointsDelta, isFirstSolve);
      }

      clearDraft(problem.id, lang); setApproach('');
      onSolved?.(problem.id, { code, lang, passed, total, pointsAwarded: finalPointsAwarded });
      if (canAutoGrade) {
        setStatusMsg(passed === total
          ? `✅ All tests passed — ${finalPointsAwarded} pts awarded!`
          : `✅ ${passed}/${total} tests passed — ${finalPointsAwarded} pts awarded.`);
        showToast(`✅ "${problem.title}" — ${passed}/${total} tests passed, ${finalPointsAwarded} pts awarded${pointsDelta === 0 && !isFirstSolve ? ' (no change — previous attempt scored the same or higher)' : ''}`, 'ok');
      } else {
        setStatusMsg('⏳ No test cases on this problem — sent for manual review.');
        showToast(`✅ Submitted "${problem.title}" — pending manual review (no test cases to auto-grade)`, 'ok');
      }
    } catch (e: any) {
      setStatusMsg('Error — try again');
      showToast('Submission error: ' + (e.message || 'Unknown'), 'err');
    } finally {
      setSubmitting(false);
    }
  }

  const toastColors: Record<ToastType, string> = {
    ok:   'bg-[var(--acc)] text-black',
    err:  'bg-[var(--danger)] text-white',
    warn: 'bg-[var(--warn)] text-black',
    info: 'bg-[var(--border)] text-[var(--text)] border border-[var(--border2)]',
  };
  const execBadge = getStrategy(lang) === 'browser'
    ? { label: '⚡ Runs in browser', cls: 'bg-[rgba(var(--acc-rgb),0.071)] text-[var(--acc)] border-[rgba(var(--acc-rgb),0.125)]' }
    : { label: '☁ Runs on server',  cls: 'bg-[rgba(var(--purple-rgb),0.071)] text-[var(--purple)] border-[rgba(var(--purple-rgb),0.125)]' };

  // Use problem.id for hint status (matches Supabase key)
  const hintStatus = usage.getHintStatus(problem.id);

  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-screen">

      {/* Toasts */}
      <div className="fixed bottom-6 right-4 md:right-6 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`${toastColors[t.type]} px-4 py-3 rounded-xl font-mono text-sm shadow-xl animate-fade-up pointer-events-auto`}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-2xl animate-fade-up">
            <div className="flex items-start gap-3 mb-4">
              <span className="text-2xl">⚠️</span>
              <p className="text-sm font-mono text-[var(--text)] leading-relaxed">{confirmDialog.message}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { confirmDialog.resolve(false); setConfirmDialog(null); }}
                className="flex-1 py-2.5 bg-[var(--border)] text-[var(--text-soft)] font-mono text-sm font-bold rounded-xl hover:bg-[var(--border2)] hover:text-[var(--text)] transition-all">
                Cancel
              </button>
              <button onClick={() => { confirmDialog.resolve(true); setConfirmDialog(null); }}
                className="flex-1 py-2.5 bg-[var(--acc)] text-black font-mono text-sm font-bold rounded-xl hover:bg-[var(--acc-bright)] transition-all">
                Resubmit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts modal */}
      {shortcutsOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          onClick={() => setShortcutsOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-2xl animate-fade-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-[var(--text)] text-base">⌨ Keyboard Shortcuts</h3>
              <button onClick={() => setShortcutsOpen(false)} className="text-[var(--text3)] hover:text-[var(--text)] transition-colors">✕</button>
            </div>
            <div className="space-y-2.5 font-mono text-sm">
              {[
                { keys: ['Ctrl', 'Enter'], desc: 'Run test cases' },
                { keys: ['Ctrl', 'Shift', 'Enter'], desc: 'Submit solution' },
                { keys: ['?'], desc: 'Toggle this menu' },
                { keys: ['Esc'], desc: 'Close dialogs' },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-[var(--text2)]">{row.desc}</span>
                  <span className="flex gap-1">
                    {row.keys.map((k, j) => (
                      <kbd key={j} className="px-2 py-1 bg-[var(--border)] border border-[var(--border2)] rounded-lg text-[10px] text-[var(--text)]">{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[var(--muted)] font-mono mt-4">On Mac, use ⌘ instead of Ctrl.</p>
          </div>
        </div>
      )}

      {/* Mobile tabs */}
      <div className="lg:hidden col-span-full sticky top-0 z-40 flex bg-[var(--bg)] border-b border-[var(--card)]">
        {(['problem', 'editor'] as const).map(tab => (
          <button key={tab} onClick={() => setMobileTab(tab)}
            className={`flex-1 py-3 text-xs font-mono font-bold uppercase tracking-widest transition-colors
              ${mobileTab === tab ? 'text-[var(--acc)] border-b-2 border-[var(--acc)]' : 'text-[var(--muted)] hover:text-[var(--text2)]'}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── Left: Problem description ── */}
      <div className={`bg-[var(--bg)] border-r border-[var(--card)] p-5 md:p-6 overflow-y-auto
        ${mobileTab === 'editor' ? 'hidden lg:block' : 'block'}`}>
        <button onClick={onClose}
          className="mb-5 text-xs text-[var(--muted)] hover:text-[var(--acc)] font-mono transition-colors flex items-center gap-1.5 group">
          <span className="group-hover:-translate-x-0.5 transition-transform duration-150 inline-block">←</span>
          <span>{isWeekly ? 'Weekly Challenge' : practiceMode ? 'Practice (ended)' : 'Problems'}</span>
        </button>

        <button onClick={() => setShortcutsOpen(true)}
          className="hidden lg:inline-flex items-center gap-1.5 mb-5 ml-3 text-[10px] text-[var(--muted)] hover:text-[var(--text)] font-mono transition-colors">
          <kbd className="px-1.5 py-0.5 bg-[var(--card3)] border border-[var(--border2)] rounded text-[9px]">?</kbd>
          <span>shortcuts</span>
        </button>

        {practiceMode && (
          <div className="mb-4 flex items-center gap-2 bg-[rgba(var(--purple-rgb),0.031)] border border-[rgba(var(--purple-rgb),0.082)] rounded-xl px-3 py-2">
            <span className="text-sm">🏁</span>
            <span className="text-xs font-mono text-[var(--purple)]">Practice mode — no points awarded.</span>
          </div>
        )}

        {practiceMode && (
          <div className="flex gap-1 mb-4 bg-[var(--card2)] border border-[var(--border)] rounded-xl p-1">
            <button onClick={() => setLeftTab('problem')}
              className={`flex-1 py-2 rounded-lg text-xs font-mono font-bold transition-all
                ${leftTab === 'problem' ? 'bg-[var(--card)] text-[var(--text)]' : 'text-[var(--muted)] hover:text-[var(--text2)]'}`}>
              Problem
            </button>
            <button onClick={() => setLeftTab('editorial')}
              className={`flex-1 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center gap-1.5
                ${leftTab === 'editorial' ? 'bg-[rgba(var(--purple-rgb),0.12)] text-[var(--purple)]' : 'text-[var(--muted)] hover:text-[var(--text2)]'}`}>
              ✦ AI Editorial
              {!editorial && (
                <span className="text-[9px] opacity-70">({usage.editorial.remaining}/{usage.editorial.limit} left today)</span>
              )}
            </button>
          </div>
        )}

        {leftTab === 'problem' && (<>
        <div className="flex items-start gap-3 mb-4 flex-wrap">
          <h2 className="text-xl font-display font-bold text-[var(--text)] flex-1">{problem.title}</h2>
          <span className={problem.difficulty === 'Easy' ? 'diff-easy' : problem.difficulty === 'Medium' ? 'diff-medium' : 'diff-hard'}>
            {problem.difficulty}
          </span>
          <span className="px-2.5 py-0.5 bg-[rgba(var(--purple-rgb),0.063)] text-[var(--purple)] rounded-lg text-xs font-mono font-bold shrink-0 border border-[rgba(var(--purple-rgb),0.082)]">
            {problem.points} pts
          </span>
        </div>

        {(problem.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {problem.tags.map(tag => (
              <span key={tag} className="px-2 py-0.5 bg-[var(--info-dim)] text-[var(--info)] rounded-lg text-xs font-mono border border-[var(--info-dim)]">{tag}</span>
            ))}
          </div>
        )}

        <div className="prose prose-invert prose-sm max-w-none text-[var(--text-soft)] leading-relaxed mb-5"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(problem.description || '<p>No description provided.</p>') }} />

        {problem.example && (
          <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-xl p-4 mb-5">
            <div className="text-[10px] text-[var(--text3)] font-mono mb-2 uppercase tracking-widest">Example</div>
            <pre className="text-[var(--acc)] text-sm font-mono whitespace-pre-wrap">{problem.example}</pre>
          </div>
        )}

        {(problem.test_cases || []).length > 0 && (
          <div>
            <div className="text-[10px] text-[var(--text3)] font-mono mb-3 uppercase tracking-widest">🧪 Sample Test Cases</div>
            <div className="space-y-2">
              {problem.test_cases.slice(0, 3).map((tc, i) => (
                <div key={i} className="bg-[var(--bg2)] border border-[var(--card3)] rounded-xl px-3.5 py-2.5 text-xs font-mono hover:border-[var(--border)] transition-colors">
                  <span className="text-[var(--text3)]">Input: </span>
                  <code className="text-[var(--text2)]">{tc.input}</code>
                  <span className="text-[var(--text3)] ml-3">→ </span>
                  <code className="text-[var(--acc)]">{tc.expected}</code>
                </div>
              ))}
              {problem.test_cases.length > 3 && (
                <div className="text-xs text-[var(--text3)] font-mono pl-1">+{problem.test_cases.length - 3} hidden test cases</div>
              )}
            </div>
          </div>
        )}

        {/* ── AI Hint panel — hidden in arena mode ── */}
        {!onArenaSubmit && (
          <AIHintPanel
            hintText={aiHint}
            hintNum={aiHintNum}
            loading={aiHinting}
            used={hintStatus.used}
            limit={hintStatus.limit}
            cooldown={hintCooldownSecs}
            onGetHint={handleAiHint}
          />
        )}

        {/* Static admin hints */}
        {!onArenaSubmit && (problem.hints || []).filter(Boolean).length > 0 && (
          <div className="mt-5 border-t border-[var(--card)] pt-5">
            <div className="text-[10px] text-[var(--text3)] font-mono mb-3 uppercase tracking-widest">💡 Admin Hints</div>
            <div className="space-y-2 mb-3">
              {(problem.hints || []).filter(Boolean).slice(0, hintsRevealed).map((hint, i) => (
                <div key={i} className="flex gap-2.5 bg-[var(--bg2)] border border-[var(--border)] rounded-xl px-3.5 py-2.5 animate-fade-up">
                  <span className="text-[var(--warn)] text-xs font-mono shrink-0 mt-0.5">#{i + 1}</span>
                  <p className="text-[var(--text-soft)] text-xs font-mono leading-relaxed">{hint}</p>
                </div>
              ))}
            </div>
            {hintsRevealed < (problem.hints || []).filter(Boolean).length && (
              <div>
                {hintsRevealed === 0 && <p className="text-[10px] text-[var(--muted)] font-mono mb-2">Stuck? Try on your own first.</p>}
                <button onClick={revealNextHint} disabled={hintCooldown}
                  className={`w-full py-2 rounded-xl text-xs font-mono font-bold border transition-all
                    ${hintCooldown ? 'bg-[var(--bg2)] border-[var(--border)] text-[var(--muted)] cursor-not-allowed'
                    : 'bg-[rgba(var(--warn-rgb),0.031)] border-[rgba(var(--warn-rgb),0.125)] text-[var(--warn)] hover:bg-[rgba(var(--warn-rgb),0.071)]'}`}>
                  {hintCooldown ? `Next hint in ${hintTimer}s…` : hintsRevealed === 0 ? '💡 Show Hint 1' : `💡 Show Hint ${hintsRevealed + 1}`}
                </button>
              </div>
            )}
            {hintsRevealed >= (problem.hints || []).filter(Boolean).length && hintsRevealed > 0 && (
              <p className="text-[10px] text-[var(--muted)] font-mono text-center">All hints revealed</p>
            )}
          </div>
        )}
        </>)}

        {leftTab === 'editorial' && practiceMode && (
          <div className="animate-fade-up">
            {!editorial ? (
              <div className="flex flex-col items-center justify-center text-center py-16 px-4">
                <span className="text-4xl mb-4">✦</span>
                <h3 className="font-display font-bold text-[var(--text)] text-lg mb-2">AI Editorial</h3>
                <p className="text-sm font-mono text-[var(--text2)] max-w-sm mb-1">
                  Get a full walkthrough for "{problem.title}" — approach, complexity, common mistakes,
                  and complete solutions in Python and JavaScript.
                </p>
                <p className="text-xs font-mono text-[var(--muted)] mb-6">
                  {usage.editorial.remaining > 0
                    ? `${usage.editorial.remaining} of ${usage.editorial.limit} generations left today`
                    : `Daily limit reached — ${usage.editorial.limit}/${usage.editorial.limit} used today. Resets at midnight.`}
                </p>
                <button onClick={handleGenerateEditorial} disabled={editorialLoading || usage.editorial.remaining <= 0}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-[rgba(var(--purple-rgb),0.1)] border border-[rgba(var(--purple-rgb),0.25)]
                    text-[var(--purple)] font-mono text-sm font-bold rounded-xl hover:bg-[rgba(var(--purple-rgb),0.18)] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  {editorialLoading ? <><span className="spinner-sm" /> Generating full editorial…</> : <>✦ Generate AI Editorial</>}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✦</span>
                  <h4 className="font-display font-bold text-base text-[var(--text)]">Editorial</h4>
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)] mb-1">Approach</p>
                  <p className="text-sm font-mono text-[var(--text-soft)] leading-relaxed">{editorial.approach}</p>
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)] mb-1">Complexity</p>
                  <p className="text-sm font-mono text-[var(--purple)]">{editorial.complexity}</p>
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)] mb-1">Common Mistakes</p>
                  <p className="text-sm font-mono text-[var(--text-soft)] leading-relaxed">{editorial.commonMistakes}</p>
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted)] mb-2">Full Solution</p>
                  <div className="flex gap-1 mb-2">
                    {(['python', 'javascript'] as const).map(t => (
                      <button key={t} onClick={() => setEditorialTab(t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all
                          ${editorialTab === t ? 'bg-[rgba(var(--purple-rgb),0.18)] text-[var(--purple)] border border-[rgba(var(--purple-rgb),0.3)]' : 'text-[var(--muted)] border border-transparent hover:text-[var(--text)]'}`}>
                        {t === 'python' ? 'Python' : 'JavaScript'}
                      </button>
                    ))}
                  </div>
                  <pre className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-4 overflow-x-auto text-xs font-mono text-[var(--text-soft)] leading-relaxed">
                    {editorialTab === 'python' ? editorial.solutionPython : editorial.solutionJs}
                  </pre>
                </div>
                {usage.editorial.remaining > 0 && (
                  <p className="text-[10px] font-mono text-[var(--muted)] text-center pt-2">
                    {usage.editorial.remaining} of {usage.editorial.limit} editorial generations left today
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Right: Editor + controls ── */}
      <div className={`flex flex-col gap-3 ${mobileTab === 'problem' ? 'hidden lg:flex' : 'flex'}`}>

        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono text-[var(--text3)] uppercase tracking-widest">Choose Language</span>
            <div className="flex items-center gap-2">
              {code !== STARTER_CODE[lang](problem) && (
                <>
                  <span className="text-[10px] font-mono text-[var(--text3)] px-2 py-0.5 rounded-lg border border-[var(--border2)] bg-[var(--card3)]">draft saved</span>
                  <button onClick={resetEditor} title="Reset to starter code"
                    className="text-[10px] font-mono px-2 py-0.5 rounded-lg border border-[var(--border2)] text-[var(--text3)] hover:text-[var(--danger)] hover:border-[rgba(255,92,108,0.3)] transition-colors flex items-center gap-1">
                    ↺ Reset
                  </button>
                </>
              )}
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border ${execBadge.cls}`}>{execBadge.label}</span>
            </div>
          </div>
          <LangTabs current={lang} onChange={handleLangChange} />
        </div>

        <CodeEditor
          value={code}
          language={lang}
          onChange={handleCodeChange}
          height="380px"
          onRun={() => { if (!running) { setMobileTab('editor'); runTests(); } }}
          onSubmit={() => {
            const submitDisabled = submitting || submitBlocked || !user || (!!isWeekly && !testResult && !practiceMode) || (!!practiceMode && !testResult);
            if (!submitDisabled) submitSolution();
          }}
        />

        <button onClick={() => { setMobileTab('editor'); runTests(); }} disabled={running}
          title={`Run tests (${shortcutLabel('Enter')})`}
          className="w-full py-2.5 bg-[var(--bg2)] border border-[var(--card)] hover:border-[rgba(var(--acc-rgb),0.125)]
            text-[var(--acc)] font-mono text-sm font-bold rounded-xl transition-all duration-200 hover:bg-[rgba(var(--acc-rgb),0.02)]
            disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {running ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-[var(--acc)] border-t-transparent rounded-full animate-spin" />
              {runStatus || 'Running…'}
              {progress && <span className="text-[rgba(var(--acc-rgb),0.251)] text-xs">{progress.done}/{progress.total}</span>}
            </span>
          ) : '▶ Run Test Cases'}
        </button>

        {runError && (
          <div className="text-xs text-[var(--warn)] font-mono bg-[rgba(var(--warn-rgb),0.031)] border border-[rgba(var(--warn-rgb),0.094)] rounded-xl px-3.5 py-2.5">
            ⚠ {runError}
          </div>
        )}

        <TestResults
          results={testResult?.results || []}
          passed={testResult?.passed || 0}
          total={testResult?.total || 0}
          loading={running}
        />

        {/* ── AI Failure Explainer ── */}
        {testResult && testResult.passed < testResult.total && !onArenaSubmit && (
          <AIFailurePanel
            text={aiExplanation}
            loading={aiExplaining}
            used={usage.explainFailure.used}
            limit={usage.explainFailure.limit}
            onAnalyze={handleExplainFailure}
          />
        )}

        {/* ── AI Code Review ── */}
        {testResult && !onArenaSubmit && (
          <AIReviewPanel
            text={aiReview}
            loading={aiReviewing}
            used={usage.reviewCode.used}
            limit={usage.reviewCode.limit}
            onReview={handleCodeReview}
          />
        )}

        {/* Approach field + validator */}
        {!onArenaSubmit && !isWeekly && !practiceMode && (
          <div className="card p-4">
            <label className="block text-[10px] text-[var(--text3)] font-mono mb-2 uppercase tracking-widest">
              Your approach or GitHub PR link *
            </label>
            <textarea value={approach} onChange={e => { setApproach(e.target.value); setApproachResult(null); }}
              placeholder="Describe your approach before writing code — e.g. I'll use a hashmap to store each number's complement…" rows={3}
              className="w-full bg-[var(--bg2)] border border-[var(--card)] rounded-xl px-3.5 py-2.5
                text-[var(--text)] text-sm font-mono placeholder-[var(--border2)] resize-none
                focus:outline-none focus:border-[rgba(var(--acc-rgb),0.188)] transition-colors" />
            <ApproachPanel
              result={approachResult}
              loading={validatingApproach}
              hasText={approach.trim().length > 10}
              onValidate={handleValidateApproach}
            />
          </div>
        )}

        {!onArenaSubmit && (
          <div className="text-xs text-[var(--text3)] font-mono px-1 animate-fade-in">{statusMsg}</div>
        )}

        <button onClick={submitSolution}
          title={`Submit (${shortcutLabel('Enter', true)})`}
          disabled={submitting || submitBlocked || !user || (!!isWeekly && !testResult && !practiceMode) || (!!practiceMode && !testResult)}
          className={`w-full py-3 rounded-xl font-mono font-bold text-sm transition-all
            ${submitBlocked || !user ? 'bg-[var(--border)] text-[var(--muted2)] cursor-not-allowed border border-[var(--border)]'
            : (isWeekly || practiceMode) && !testResult ? 'bg-[var(--border)] text-[var(--muted2)] cursor-not-allowed border border-[var(--border)]'
            : submitting ? 'bg-[rgba(var(--acc-rgb),0.188)] text-[rgba(var(--acc-rgb),0.376)] cursor-not-allowed'
            : practiceMode ? 'bg-[rgba(var(--purple-rgb),0.063)] text-[var(--purple)] border border-[rgba(var(--purple-rgb),0.125)] hover:bg-[rgba(var(--purple-rgb),0.094)]'
            : 'btn-primary'}`}>
          {!user                      ? 'Sign in to submit'           :
           submitBlocked              ? 'Already submitted'           :
           (isWeekly || practiceMode) && !testResult ? '▶ Run tests first' :
           submitting                 ? 'Submitting…'                 :
           practiceMode               ? '🏁 Practice Run (no points)' :
           onArenaSubmit              ? 'Submit & Next Problem →'     :
                                        'Submit Solution →'}
        </button>
      </div>

      {/* Discussion — shown for all problems, hidden in arena only */}
      {!onArenaSubmit && <ProblemDiscussion problemId={problem.id} problemTitle={problem.title} user={user} />}
    </div>
  );
}