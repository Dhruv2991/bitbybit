'use client';
// ════════════════════════════════════════════════════════════
// src/app/problems/Workspace.tsx
// Code execution — zero API, zero auth:
//   Python     → Pyodide WASM (runs in browser)
//   JavaScript → Web Worker (runs in browser)
//   C++/Java/Go/Rust → /api/execute → Wandbox (no auth)
// ════════════════════════════════════════════════════════════

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
}

export default function Workspace({ problem, user, onClose }: WorkspaceProps) {
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
  const [runStatus,     setRunStatus]     = useState('');   // e.g. "Loading Python…"
  const [progress,      setProgress]      = useState<{ done: number; total: number } | null>(null);

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
  }, [problem]);

  async function runTests() {
    const cases = problem.test_cases || [];
    if (!cases.length) {
      setRunError('No test cases defined for this problem. You can still submit for admin review.');
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
        // Python or JS — runs in-browser, no network needed
        if (lang === 'python') {
          setRunStatus('Loading Python runtime… (first run takes ~5s)');
        } else {
          setRunStatus('Running in browser sandbox…');
        }

        result = await runInBrowser(code, lang, cases, (done, total) => {
          setRunStatus(`Running test ${done} / ${total}…`);
          setProgress({ done, total });
        });
      } else {
        // Compiled lang — proxy to Wandbox (no auth)
        setRunStatus(`Compiling ${lang} on Wandbox…`);
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
    if (!user)            { alert('Sign in required to submit!'); return; }
    if (!approach.trim()) { alert('Provide an approach description or GitHub PR link!'); return; }
    if (submitBlocked)    return;

    setSubmitting(true);
    setStatusMsg('Uploading submission...');

    try {
      const { data: existing } = await db
        .from('submissions')
        .select('id')
        .eq('problem_id', problem.id)
        .eq('github', user.github)
        .in('status', ['pending', 'approved'])
        .limit(1);

      if (existing?.length) {
        setStatusMsg('⏳ Duplicate blocked — submission already exists.');
        setSubmitBlocked(true);
        return;
      }

      const passed        = testResult?.passed ?? 0;
      const total         = testResult?.total  ?? 0;
      const pointsAwarded = total > 0
        ? Math.floor((problem.points || 100) * (passed / total))
        : (problem.points || 100);

      const { error } = await (db.from('submissions')as any).insert([{
        problem_id:     problem.id,
        problem_title:  problem.title,
        name:           user.name,
        github:         user.github,
        lang,
        code,
        approach,
        status:         'pending',
        tests_passed:   passed,
        tests_total:    total,
        points_awarded: pointsAwarded,
      }]);

      if (error) throw error;

      setStatusMsg('⏳ Pending review — duplicates blocked.');
      setSubmitBlocked(true);
      setApproach('');
      alert(`Submitted! "${problem.title}" — ${total > 0 ? `${passed}/${total} tests, potential ${pointsAwarded}pts` : 'pending admin review'}`);
    } catch (e: any) {
      setStatusMsg('Error — try again');
      alert('Submission error: ' + (e.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full min-h-screen">

      {/* ── Left: Problem description ───────────────────── */}
      <div className="bg-[#111] border border-[#1f1f1f] rounded-xl p-6 overflow-y-auto">
        <button
          onClick={onClose}
          className="mb-4 text-xs text-[#666] hover:text-[#00e87a] font-mono transition-colors flex items-center gap-1"
        >
          ← Back to Problems
        </button>

        <div className="flex items-start gap-3 mb-4">
          <h2 className="text-xl font-display font-bold text-[#e0e0e0] flex-1">{problem.title}</h2>
          <span className={`shrink-0 font-mono
            ${problem.difficulty === 'Easy'   ? 'diff-easy'   :
              problem.difficulty === 'Medium' ? 'diff-medium' : 'diff-hard'}`}>
            {problem.difficulty}
          </span>
          <span className="px-2 py-0.5 bg-[#a78bfa20] text-[#a78bfa] rounded text-xs font-mono font-bold shrink-0">
            {problem.points} pts
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-5">
          {(problem.tags || []).map(tag => (
            <span key={tag} className="px-2 py-0.5 bg-[#1a1a1a] text-[#666] rounded text-xs font-mono">
              {tag}
            </span>
          ))}
        </div>

        <div
          className="prose prose-invert prose-sm max-w-none text-[#ccc] leading-relaxed mb-5"
          dangerouslySetInnerHTML={{ __html: problem.description || '<p>No description provided.</p>' }}
        />

        {problem.example && (
          <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-4 mb-5">
            <div className="text-xs text-[#666] font-mono mb-2 uppercase tracking-wider">Example</div>
            <pre className="text-[#00e87a] text-sm font-mono whitespace-pre-wrap">{problem.example}</pre>
          </div>
        )}

        {(problem.test_cases || []).length > 0 && (
          <div>
            <div className="text-xs text-[#666] font-mono mb-2 uppercase tracking-wider">🧪 Test Cases</div>
            <div className="space-y-2">
              {problem.test_cases.slice(0, 3).map((tc, i) => (
                <div key={i} className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2 text-xs font-mono">
                  <span className="text-[#444]">In: </span>
                  <code className="text-[#888]">{tc.input}</code>
                  <span className="text-[#444] ml-3">Expected: </span>
                  <code className="text-[#00e87a]">{tc.expected}</code>
                </div>
              ))}
              {problem.test_cases.length > 3 && (
                <div className="text-xs text-[#444] font-mono pl-2">
                  +{problem.test_cases.length - 3} hidden test cases
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Right: Editor + controls ─────────────────────── */}
      <div className="flex flex-col gap-4">

        <div className="flex items-center justify-between">
          <LangTabs current={lang} onChange={handleLangChange} />
          {/* Execution badge */}
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded
            ${getStrategy(lang) === 'browser'
              ? 'bg-[#00e87a15] text-[#00e87a]'
              : 'bg-[#a78bfa15] text-[#a78bfa]'}`}>
            {getStrategy(lang) === 'browser' ? '⚡ In-Browser' : '☁ Wandbox'}
          </span>
        </div>

        <CodeEditor
          value={code}
          language={lang}
          onChange={setCode}
          height="400px"
        />

        <button
          onClick={runTests}
          disabled={running}
          className="w-full py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#00e87a40]
            text-[#00e87a] font-mono text-sm rounded-lg transition-all hover:bg-[#00e87a08]
            disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {running ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-[#00e87a] border-t-transparent rounded-full animate-spin" />
              {runStatus || 'Running…'}
              {progress && (
                <span className="text-[#00e87a60]">{progress.done}/{progress.total}</span>
              )}
            </span>
          ) : '▶ Run Test Cases'}
        </button>

        {runError && (
          <div className="text-xs text-[#f0b429] font-mono bg-[#f0b42910] border border-[#f0b42920] rounded-lg px-3 py-2">
            ⚠ {runError}
          </div>
        )}

        <TestResults
          results={testResult?.results || []}
          passed={testResult?.passed || 0}
          total={testResult?.total || 0}
          loading={running}
        />

        <div>
          <label className="block text-xs text-[#666] font-mono mb-1.5 uppercase tracking-wider">
            Approach / GitHub PR Link *
          </label>
          <textarea
            value={approach}
            onChange={e => setApproach(e.target.value)}
            placeholder="Describe your approach or paste your GitHub PR link..."
            rows={3}
            className="w-full bg-[#0f0f0f] border border-[#1f1f1f] rounded-lg px-3 py-2.5
              text-[#e0e0e0] text-sm font-mono placeholder-[#333] resize-none
              focus:outline-none focus:border-[#00e87a40]"
          />
        </div>

        <div className="text-xs text-[#666] font-mono">{statusMsg}</div>

        <button
          id="ws-submit-btn"
          onClick={submitSolution}
          disabled={submitting || submitBlocked || !user}
          className={`w-full py-3 rounded-lg font-mono font-bold text-sm transition-all
            ${submitBlocked || !user
              ? 'bg-[#1a1a1a] text-[#444] cursor-not-allowed'
              : submitting
                ? 'bg-[#00e87a40] text-[#00e87a60] cursor-not-allowed'
                : 'btn-primary'}`}
        >
          {!user         ? 'Sign In to Submit'     :
           submitBlocked ? 'Already Submitted'     :
           submitting    ? 'Submitting…'           :
                           'Submit Solution →'}
        </button>
      </div>
    </div>
  );
}
