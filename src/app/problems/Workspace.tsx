'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic                                       from 'next/dynamic';
import { getSupabaseClient }                         from '@/lib/supabase';
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

const CodeEditor = dynamic(() => import('@/components/editor/CodeEditor'), { ssr: false });

interface WorkspaceProps {
  problem: Problem;
  user:    User | null;
  onClose: () => void;
  onArenaSubmit?:     (code: string, lang: string) => void;
  onArenaCodeChange?: (code: string, lang: string) => void;
  onSolved?:          (problemId: string) => void;
}

type ToastType = 'ok' | 'err' | 'info' | 'warn';
interface Toast { msg: string; type: ToastType; id: number; }

export default function Workspace({ problem, user, onClose, onArenaSubmit, onArenaCodeChange, onSolved }: WorkspaceProps) {
  const db = getSupabaseClient();

  const [lang,          setLang]          = useState<SupportedLang>('python');
  const [code,          setCode]          = useState(STARTER_CODE['python'](problem));
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
  const toastCounter = useRef(0);

  const arenaCodeChangeTimer = useRef<NodeJS.Timeout | null>(null);

  function handleCodeChange(newCode: string) {
    setCode(newCode);
    if (!onArenaCodeChange) return;
    if (arenaCodeChangeTimer.current) clearTimeout(arenaCodeChangeTimer.current);
    arenaCodeChangeTimer.current = setTimeout(() => {
      onArenaCodeChange(newCode, lang);
    }, 500);
  }

  function showToast(msg: string, type: ToastType = 'info') {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { msg, type, id }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await db
        .from('submissions')
        .select('id, status')
        .eq('problem_id', problem.id)
        .eq('github', user.github)
        .in('status', ['pending', 'approved'])
        .limit(1)
        .returns<{ id: string; status: string }[]>();
      if (data?.length) {
        setSubmitBlocked(true);
        setStatusMsg(data[0].status === 'approved'
          ? '✓ Already approved — no re-submission allowed.'
          : '⏳ Submission pending review — duplicates blocked.');
      }
    })();
  }, [user, problem.id]);

  const handleLangChange = useCallback((l: SupportedLang) => {
    setLang(l);
    setCode(STARTER_CODE[l](problem));
    setTestResult(null);
    setRunError(null);
    setRunStatus('');
    setProgress(null);
    onArenaCodeChange?.(STARTER_CODE[l](problem), l);
  }, [problem]);

  async function runTests() {
    const cases = problem.test_cases || [];
    if (!cases.length) {
      setRunError('No test cases defined for this problem. You can still submit for review.');
      return;
    }

    setRunning(true);
    setTestResult(null);
    setRunError(null);
    setProgress(null);

    const strategy = getStrategy(lang);

    try {
      let result: RunResult;

      if (strategy === 'browser') {
        setRunStatus(lang === 'python' ? 'Loading Python… (first run ~5s)' : 'Running in browser…');
        result = await runInBrowser(code, lang, cases, (done, total) => {
          setRunStatus(`Running test ${done} / ${total}…`);
          setProgress({ done, total });
        });
      } else {
        setRunStatus(`Compiling ${lang}…`);
        result = await runOnServer(code, lang, cases);
      }

      setTestResult(result);
    } catch (e: any) {
      setRunError('Execution error: ' + (e.message || 'Unknown'));
    } finally {
      setRunning(false);
      setRunStatus('');
      setProgress(null);
    }
  }

  async function submitSolution() {
    if (!user) { showToast('Sign in to submit!', 'err'); return; }
    if (!onArenaSubmit && !approach.trim()) { showToast('Please add an approach description or GitHub PR link.', 'warn'); return; }
    if (submitBlocked) return;

    setSubmitting(true);
    setStatusMsg('Uploading…');

    try {
      const passed = testResult?.passed ?? 0;
      const total  = testResult?.total  ?? 0;

      if (onArenaSubmit) {
        onArenaSubmit(code, lang);
        setSubmitBlocked(true);
        setApproach('');
        onSolved?.(problem.id);
        showToast(
          `✅ Submitted "${problem.title}" — ${total > 0 ? `${passed}/${total} tests passed` : 'pending review'}`,
          'ok'
        );
        // Auto-advance to next problem after a short pause so the toast is visible.
        // onClose in arena mode calls handleProblemClose which moves to the next problem
        // (or shows "all done" if this was the last one).
        setTimeout(() => onClose(), 1200);
        return;
      }

      const { data: existing } = await db
        .from('submissions')
        .select('id')
        .eq('problem_id', problem.id)
        .eq('github', user.github)
        .in('status', ['pending', 'approved'])
        .limit(1);

      if (existing?.length) {
        setStatusMsg('⏳ Duplicate blocked.');
        setSubmitBlocked(true);
        showToast('You already have a pending or approved submission.', 'warn');
        return;
      }

      const pointsAwarded = total > 0
        ? Math.floor((problem.points || 100) * (passed / total))
        : (problem.points || 100);

      const { error } = await (db.from('submissions') as any).insert([{
        problem_id:     problem.id,
        problem_title:  problem.title,
        name:           user.name,
        github:         user.github,
        lang, code, approach,
        status:         'pending',
        tests_passed:   passed,
        tests_total:    total,
        points_awarded: pointsAwarded,
      }]);

      if (error) throw error;

      setStatusMsg('⏳ Pending review.');
      setSubmitBlocked(true);
      setApproach('');
      onSolved?.(problem.id);
      showToast(
        `✅ Submitted "${problem.title}" — ${total > 0 ? `${passed}/${total} tests passed, up to ${pointsAwarded} pts` : 'pending review'}`,
        'ok'
      );
    } catch (e: any) {
      setStatusMsg('Error — try again');
      showToast('Submission error: ' + (e.message || 'Unknown'), 'err');
    } finally {
      setSubmitting(false);
    }
  }

  const toastColors: Record<ToastType, string> = {
    ok:   'bg-[#00e87a] text-black',
    err:  'bg-[#ff4d4d] text-white',
    warn: 'bg-[#f0b429] text-black',
    info: 'bg-[#1f1f1f] text-[#e0e0e0] border border-[#2a2a2a]',
  };

  const execBadge = getStrategy(lang) === 'browser'
    ? { label: '⚡ Runs in browser', cls: 'bg-[#00e87a12] text-[#00e87a] border-[#00e87a20]' }
    : { label: '☁ Runs on server',  cls: 'bg-[#a78bfa12] text-[#a78bfa] border-[#a78bfa20]' };

  return (
    <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-screen">

      {/* Toast notifications */}
      <div className="fixed bottom-6 right-4 md:right-6 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className={`${toastColors[t.type]} px-4 py-3 rounded-xl font-mono text-sm shadow-xl
              animate-fade-up pointer-events-auto`}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* Left: Problem description */}
      <div className="card p-5 md:p-6 overflow-y-auto">
        <button onClick={onClose}
          className="mb-5 text-xs text-[#444] hover:text-[#00e87a] font-mono transition-colors flex items-center gap-1.5">
          ← Back to Problems
        </button>

        <div className="flex items-start gap-3 mb-4 flex-wrap">
          <h2 className="text-xl font-display font-bold text-[#e0e0e0] flex-1">{problem.title}</h2>
          <span className={
            problem.difficulty === 'Easy'   ? 'diff-easy'   :
            problem.difficulty === 'Medium' ? 'diff-medium' : 'diff-hard'}>
            {problem.difficulty}
          </span>
          <span className="px-2.5 py-0.5 bg-[#a78bfa15] text-[#a78bfa] rounded-lg text-xs font-mono font-bold shrink-0 border border-[#a78bfa20]">
            {problem.points} pts
          </span>
        </div>

        {(problem.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {problem.tags.map(tag => (
              <span key={tag} className="px-2 py-0.5 bg-[#1a1a1a] text-[#555] rounded-lg text-xs font-mono border border-[#222]">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div
          className="prose prose-invert prose-sm max-w-none text-[#bbb] leading-relaxed mb-5"
          dangerouslySetInnerHTML={{
            __html: (problem.description || '<p>No description provided.</p>')
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/on\w+="[^"]*"/gi, '')
          }}
        />

        {problem.example && (
          <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl p-4 mb-5">
            <div className="text-[10px] text-[#444] font-mono mb-2 uppercase tracking-widest">Example</div>
            <pre className="text-[#00e87a] text-sm font-mono whitespace-pre-wrap">{problem.example}</pre>
          </div>
        )}

        {(problem.test_cases || []).length > 0 && (
          <div>
            <div className="text-[10px] text-[#444] font-mono mb-3 uppercase tracking-widest">🧪 Sample Test Cases</div>
            <div className="space-y-2">
              {problem.test_cases.slice(0, 3).map((tc, i) => (
                <div key={i} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3.5 py-2.5 text-xs font-mono">
                  <span className="text-[#444]">Input: </span>
                  <code className="text-[#888]">{tc.input}</code>
                  <span className="text-[#444] ml-3">→ </span>
                  <code className="text-[#00e87a]">{tc.expected}</code>
                </div>
              ))}
              {problem.test_cases.length > 3 && (
                <div className="text-xs text-[#333] font-mono pl-1">
                  +{problem.test_cases.length - 3} hidden test cases
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right: Editor + controls */}
      <div className="flex flex-col gap-3">

        {/* Language picker header */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono text-[#444] uppercase tracking-widest">Choose Language</span>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border ${execBadge.cls}`}>
              {execBadge.label}
            </span>
          </div>
          <LangTabs current={lang} onChange={handleLangChange} />
        </div>

        <CodeEditor value={code} language={lang} onChange={handleCodeChange} height="380px" />

        {/* Run button */}
        <button
          onClick={runTests}
          disabled={running}
          className="w-full py-2.5 bg-[#0d0d0d] border border-[#1f1f1f] hover:border-[#00e87a30]
            text-[#00e87a] font-mono text-sm rounded-xl transition-all hover:bg-[#00e87a06]
            disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {running ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-[#00e87a] border-t-transparent rounded-full animate-spin" />
              {runStatus || 'Running…'}
              {progress && <span className="text-[#00e87a40] text-xs">{progress.done}/{progress.total}</span>}
            </span>
          ) : '▶ Run Test Cases'}
        </button>

        {runError && (
          <div className="text-xs text-[#f0b429] font-mono bg-[#f0b42908] border border-[#f0b42918] rounded-xl px-3.5 py-2.5">
            ⚠ {runError}
          </div>
        )}

        <TestResults
          results={testResult?.results || []}
          passed={testResult?.passed || 0}
          total={testResult?.total || 0}
          loading={running}
        />

        {/* Approach field — only shown outside the arena */}
        {!onArenaSubmit && (
          <div className="card p-4">
            <label className="block text-[10px] text-[#444] font-mono mb-2 uppercase tracking-widest">
              Your approach or GitHub PR link *
            </label>
            <textarea
              value={approach}
              onChange={e => setApproach(e.target.value)}
              placeholder="Describe your approach or paste a GitHub PR link…"
              rows={3}
              className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3.5 py-2.5
                text-[#e0e0e0] text-sm font-mono placeholder-[#2a2a2a] resize-none
                focus:outline-none focus:border-[#00e87a30] transition-colors"
            />
          </div>
        )}

        {!onArenaSubmit && (
          <div className="text-xs text-[#444] font-mono px-1">{statusMsg}</div>
        )}

        <button
          onClick={submitSolution}
          disabled={submitting || submitBlocked || !user}
          className={`w-full py-3 rounded-xl font-mono font-bold text-sm transition-all
            ${submitBlocked || !user
              ? 'bg-[#1a1a1a] text-[#333] cursor-not-allowed border border-[#1f1f1f]'
              : submitting
                ? 'bg-[#00e87a30] text-[#00e87a60] cursor-not-allowed'
                : 'btn-primary'}`}>
          {!user         ? 'Sign in to submit'  :
           submitBlocked ? 'Already submitted'  :
           submitting    ? 'Submitting…'        :
           onArenaSubmit ? 'Submit & Next Problem →' :
                           'Submit Solution →'}
        </button>
      </div>
    </div>
  );
}