'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { User } from '@/types/database';

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
  { id: 'home',        label: 'Home',             icon: '⌂',   color: '#8189a0' },
  { id: 'problems',    label: 'Problems',         icon: '{ }', color: '#00e87a' },
  { id: 'leaderboard', label: 'Leaderboard',      icon: '⚡',  color: '#f0b429' },
  { id: 'arena',       label: 'Arena',            icon: '🏆',  color: '#ff5c6c' },
  { id: 'weekly',      label: 'Weekly Challenge', icon: '🏅',  color: '#a78bfa' },
  { id: 'subscribe',   label: 'Subscribe (Pro)',  icon: '⭐',  color: '#00e87a' },
  { id: 'profile',     label: 'My Profile',       icon: '👤',  color: '#33ffb0' },
  { id: 'about',       label: 'About',            icon: 'ℹ️',  color: '#8189a0' },
  { id: 'admin',       label: 'Admin',            icon: '⚙️',  color: '#a78bfa', adminOnly: true },
];

// Wraps the substring of `text` that matches `q` in a highlighted span —
// makes it obvious *why* a result matched instead of just trusting the filter.
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-[#00e87a] bg-[#00e87a1a] rounded-[3px]">{text.slice(idx, idx + q.length)}</span>
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
      color: p.difficulty === 'Easy' ? '#00e87a' : p.difficulty === 'Medium' ? '#f0b429' : '#ff5c6c',
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
    <div className="fixed inset-0 z-[400] flex items-start justify-center pt-[10vh] px-4 bg-black/75 backdrop-blur-md animate-fade-in"
      onClick={close}>
      <div onClick={e => e.stopPropagation()}
        className="glass w-full max-w-xl rounded-2xl overflow-hidden animate-slide-down"
        style={{ boxShadow: '0 0 0 1px rgba(0,232,122,0.08), 0 24px 70px rgba(0,0,0,0.55), 0 0 80px rgba(0,232,122,0.06)' }}>

        {/* Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <span className="text-[#00e87a] text-base leading-none">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search problems, jump to a page…"
            className="flex-1 bg-transparent text-[15px] font-mono text-[#f1f3f8] placeholder-[#4a5268] focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-[#4a5268] hover:text-[#8189a0] text-xs px-1">
              ✕
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2 px-2">
          {results.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <div className="text-2xl mb-2 opacity-30">⌕</div>
              <p className="text-[#666] font-mono text-xs">
                {q ? `No matches for "${query}"` : 'Start typing to search'}
              </p>
            </div>
          ) : (
            <>
              {pageResults.length > 0 && (
                <div className="px-2.5 pt-2 pb-1.5 text-[10px] font-mono font-bold text-[#4a5268] uppercase tracking-wider">
                  Pages
                </div>
              )}
              {pageResults.map((r, i) => (
                <ResultRow key={r.id} result={r} q={q} active={i === activeIdx} idx={i} onHover={setActiveIdx} />
              ))}
              {problemResults.length > 0 && (
                <div className="px-2.5 pt-3 pb-1.5 text-[10px] font-mono font-bold text-[#4a5268] uppercase tracking-wider">
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
        <div className="flex items-center justify-between gap-4 px-5 py-2.5 border-t border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.2)]">
          <div className="flex items-center gap-3 text-[10px] font-mono text-[#4a5268]">
            <span className="flex items-center gap-1">
              <kbd className="bg-[#171b25] border border-[rgba(255,255,255,0.08)] rounded px-1.5 py-0.5">↑↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-[#171b25] border border-[rgba(255,255,255,0.08)] rounded px-1.5 py-0.5">↵</kbd> select
            </span>
          </div>
          <span className="flex items-center gap-1 text-[10px] font-mono text-[#4a5268]">
            <kbd className="bg-[#171b25] border border-[rgba(255,255,255,0.08)] rounded px-1.5 py-0.5">esc</kbd> close
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
      className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-left transition-all duration-100
        ${active ? 'bg-[rgba(0,232,122,0.08)]' : 'hover:bg-[rgba(255,255,255,0.03)]'}`}
    >
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 transition-transform"
        style={{
          background: `${result.color}18`,
          border: `1px solid ${result.color}30`,
          color: result.color,
          transform: active ? 'scale(1.05)' : 'scale(1)',
        }}
      >
        {result.icon}
      </span>
      <span className={`text-sm font-mono flex-1 truncate ${active ? 'text-[#f1f3f8]' : 'text-[#9aa1b5]'}`}>
        <Highlight text={result.title} q={q} />
      </span>
      {result.subtitle && (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md shrink-0"
          style={{ color: result.color, background: `${result.color}14` }}>
          {result.subtitle}
        </span>
      )}
      {active && <span className="text-[11px] font-mono text-[#00e87a] shrink-0">↵</span>}
    </button>
  );
}
