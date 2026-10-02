'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { User } from '@/types/database';
import { Search } from 'lucide-react';

type PageId = string;

interface SearchResult {
  id:          string;
  kind:        'page' | 'problem';
  title:       string;
  subtitle?:   string;
  icon:        string;
  color:       string;
  action:      () => void;
}

interface GlobalSearchProps {
  user:     User | null;
  navigate: (page: PageId) => void;
  open:     boolean;
  onOpenChange: (open: boolean) => void;
}

const PAGES: { id: PageId; label: string; icon: string; color: string; adminOnly?: boolean }[] = [
  { id: 'home',        label: 'Home',             icon: '⌂',   color: '#a1a1aa' },
  { id: 'problems',    label: 'Problems',         icon: '{ }', color: '#00E5FF' },
  { id: 'leaderboard', label: 'Leaderboard',      icon: '⚡',  color: '#f59e0b' },
  { id: 'arena',       label: 'Arena',            icon: '🏆',  color: '#f43f5e' },
  { id: 'weekly',      label: 'Weekly Challenge', icon: '🏅',  color: '#00E5FF' },
  { id: 'subscribe',   label: 'Subscribe (Pro)',  icon: '⭐',  color: '#00E5FF' },
  { id: 'profile',     label: 'My Profile',       icon: '👤',  color: '#00E5FF' },
  { id: 'about',       label: 'About',            icon: 'ℹ️',  color: '#a1a1aa' },
  { id: 'admin',       label: 'Admin',            icon: '⚙️',  color: '#00E5FF', adminOnly: true },
];

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-cyan-400 bg-cyan-500/20 font-medium px-0.5 rounded">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
}

export default function GlobalSearch({ user, navigate, open, onOpenChange }: GlobalSearchProps) {
  const [query, setQuery]         = useState('');
  const [problems, setProblems]   = useState<{ id: string; title: string; difficulty: string; tags: string[] }[]>([]);
  const [loadedProblems, setLoadedProblems] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef  = useRef<HTMLInputElement>(null);
  const listRef   = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    onOpenChange(false);
    setQuery('');
    setActiveIdx(0);
  }, [onOpenChange]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === 'Escape') {
        onOpenChange(false);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open || loadedProblems) return;
    const db = getSupabaseClient();
    (async () => {
      const { data } = await db.from('problems')
        .select('id, title, difficulty, tags')
        .eq('visibility', 'public');
      setProblems((data || []) as any);
      setLoadedProblems(true);
    })();
  }, [open, loadedProblems]);

  const q = query.trim().toLowerCase();

  const pageResults: SearchResult[] = PAGES
    .filter(p => !p.adminOnly || user?.is_admin)
    .filter(p => !q || p.label.toLowerCase().includes(q))
    .map(p => ({
      id: `page-${p.id}`, kind: 'page', title: p.label, icon: p.icon, color: p.color,
      action: () => { navigate(p.id); close(); },
    }));

  const problemResults: SearchResult[] = (!q ? [] : problems
    .filter(p =>
      p.title.toLowerCase().includes(q) ||
      (p.tags || []).some(t => t.toLowerCase().includes(q))
    )
    .slice(0, 8))
    .map(p => ({
      id: `problem-${p.id}`, kind: 'problem', title: p.title, subtitle: p.difficulty, icon: '{ }',
      color: p.difficulty === 'Easy' ? '#10b981' : p.difficulty === 'Medium' ? '#f59e0b' : '#f43f5e',
      action: () => {
        try { sessionStorage.setItem('bb_open_problem_id', p.id); } catch {}
        navigate('problems');
        close();
      },
    }));

  const results = [...pageResults, ...problemResults];

  useEffect(() => { setActiveIdx(0); }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[activeIdx]?.action();
    }
  }

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-start justify-center pt-[12vh] px-4 bg-zinc-950/80 backdrop-blur-sm animate-fade-in"
      onClick={close}>
      <div onClick={e => e.stopPropagation()}
        className="bg-zinc-950 border border-zinc-800 w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl animate-slide-down">

        {/* Input */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-zinc-800">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search problems, jump to a page…"
            className="flex-1 bg-transparent text-sm font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-zinc-500 hover:text-zinc-300 text-xs px-1">
              ✕
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2 px-2">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-zinc-500 font-mono text-xs">
                {q ? `No matches for "${query}"` : 'Start typing to search'}
              </p>
            </div>
          ) : (
            <>
              {pageResults.length > 0 && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-mono font-medium text-zinc-500 uppercase tracking-wider">
                  Pages
                </div>
              )}
              {pageResults.map((r, i) => (
                <ResultRow key={r.id} result={r} q={q} active={i === activeIdx} idx={i} onHover={setActiveIdx} />
              ))}
              {problemResults.length > 0 && (
                <div className="px-3 pt-3 pb-1 text-[10px] font-mono font-medium text-zinc-500 uppercase tracking-wider">
                  Problems
                </div>
              )}
              {problemResults.map((r, i) => (
                <ResultRow key={r.id} result={r} q={q} active={pageResults.length + i === activeIdx} idx={pageResults.length + i} onHover={setActiveIdx} />
              ))}
            </>
          )}
        </div>

        {/* Footer hint bar */}
        <div className="flex items-center justify-between gap-4 px-5 py-2.5 border-t border-zinc-800/80 bg-zinc-900/40">
          <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500">
            <span className="flex items-center gap-1">
              <kbd className="bg-zinc-900 border border-zinc-700/80 rounded px-1.5 py-0.5 text-zinc-400">↑↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-zinc-900 border border-zinc-700/80 rounded px-1.5 py-0.5 text-zinc-400">↵</kbd> select
            </span>
          </div>
          <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
            <kbd className="bg-zinc-900 border border-zinc-700/80 rounded px-1.5 py-0.5 text-zinc-400">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

function ResultRow({ result, q, active, idx, onHover }: { result: SearchResult; q: string; active: boolean; idx: number; onHover: (i: number) => void }) {
  return (
    <button
      data-idx={idx}
      onMouseEnter={() => onHover(idx)}
      onClick={result.action}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors duration-100
        ${active ? 'bg-zinc-800/70 border border-zinc-700/50' : 'hover:bg-zinc-800/40 border border-transparent'}`}
    >
      <span
        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0"
        style={{
          background: `${result.color}15`,
          border: `1px solid ${result.color}30`,
          color: result.color,
        }}
      >
        {result.icon}
      </span>
      <span className={`text-xs font-mono flex-1 truncate ${active ? 'text-zinc-100 font-medium' : 'text-zinc-300'}`}>
        <Highlight text={result.title} q={q} />
      </span>
      {result.subtitle && (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
          style={{ color: result.color, background: `${result.color}15`, border: `1px solid ${result.color}25` }}>
          {result.subtitle}
        </span>
      )}
      {active && <span className="text-[11px] font-mono text-zinc-400 shrink-0">↵</span>}
    </button>
  );
}
