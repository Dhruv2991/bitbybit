'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { getSupabaseClient } from '@/lib/supabase';
import type { Problem, User } from '@/types/database';

const Workspace = dynamic(() => import('@/app/problems/Workspace'), { ssr: false });

const DIFFICULTIES = ['all', 'Easy', 'Medium', 'Hard'] as const;

interface ProblemsPageProps { user: User | null }

export default function ProblemsPage({ user }: ProblemsPageProps) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<string>('all');
  const [selected, setSelected] = useState<Problem | null>(null);
  const [solved,   setSolved]   = useState<string[]>([]);

  useEffect(() => {
    try { setSolved(JSON.parse(localStorage.getItem('bb_solved') || '[]')); } catch {}

    const db = getSupabaseClient();

    async function load() {
      setLoading(true);
      try {
        const { data, error } = await db
          .from('problems')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        const publicProbs = (data || []).filter((p: any) => !p.is_contest_problem);
        setProblems(publicProbs as Problem[]);
      } catch {
        setProblems([]);
      } finally {
        setLoading(false);
      }
    }
    load();

    const channel = db
      .channel('problems-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'problems' }, load)
      .subscribe();

    return () => { db.removeChannel(channel); };
  }, []);

  const filtered = filter === 'all'
    ? problems
    : problems.filter(p => p.difficulty === filter || (p.tags || []).includes(filter));

  function handleSolved(problemId: string) {
    setSolved(prev => {
      if (prev.includes(problemId)) return prev;
      const next = [...prev, problemId];
      try { localStorage.setItem('bb_solved', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  if (selected) {
    return <Workspace problem={selected} user={user} onClose={() => setSelected(null)} onSolved={handleSolved} />;
  }

  return (
    <div className="animate-fade-up">
      {/* Header row */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-xl md:text-2xl mb-0.5">Problems</h1>
          <p className="text-[#444] text-xs font-mono">
            {problems.length > 0 ? `${problems.length} problems available` : 'Loading…'}
          </p>
        </div>

        {/* Difficulty filter */}
        <div className="flex gap-1.5 flex-wrap">
          {DIFFICULTIES.map(d => (
            <button key={d} onClick={() => setFilter(d)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-medium transition-all duration-150
                ${filter === d
                  ? d === 'Easy'   ? 'bg-[#00e87a18] text-[#00e87a] border border-[#00e87a30]'
                  : d === 'Medium' ? 'bg-[#f0b42918] text-[#f0b429] border border-[#f0b42930]'
                  : d === 'Hard'   ? 'bg-[#ff4d4d18] text-[#ff4d4d] border border-[#ff4d4d30]'
                  : 'bg-[#00e87a18] text-[#00e87a] border border-[#00e87a30]'
                  : 'bg-[#111] border border-[#1f1f1f] text-[#555] hover:text-[#e0e0e0] hover:border-[#2a2a2a]'}`}>
              {d === 'all' ? 'All' : d}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="spinner" />
          <span className="text-[#444] text-xs font-mono">Loading problems…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="text-4xl opacity-30">{ '{  }' }</div>
          <div className="text-[#444] font-mono text-sm">
            {problems.length === 0 ? 'No problems yet — check back soon!' : 'Nothing matches this filter.'}
          </div>
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden space-y-2">
            {filtered.map((p, i) => {
              const isSolved = solved.includes(p.id);
              return (
                <div key={p.id} onClick={() => setSelected(p)}
                  className="card-hover px-4 py-3.5 flex items-center gap-3 cursor-pointer active:scale-[0.99]">
                  <div className="text-[#333] text-xs font-mono w-6 shrink-0 text-center">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[#e0e0e0] font-mono text-sm truncate mb-1">{p.title}</div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-lg
                        ${p.difficulty === 'Easy' ? 'text-[#00e87a] bg-[#00e87a12]' :
                          p.difficulty === 'Medium' ? 'text-[#f0b429] bg-[#f0b42912]' :
                          'text-[#ff4d4d] bg-[#ff4d4d12]'}`}>
                        {p.difficulty}
                      </span>
                      <span className="text-[#a78bfa] text-[10px] font-mono">{p.points} pts</span>
                    </div>
                  </div>
                  <span className={`text-sm shrink-0 ${isSolved ? 'text-[#00e87a]' : 'text-[#333]'}`}>
                    {isSolved ? '✓' : '›'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block card overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[2.5rem_1fr_7rem_5rem_6rem_6rem] gap-4 px-5 py-3
              border-b border-[#1a1a1a] text-[10px] text-[#444] font-mono uppercase tracking-widest">
              <div>#</div>
              <div>Title</div>
              <div>Difficulty</div>
              <div>Points</div>
              <div>Attempts</div>
              <div>Status</div>
            </div>

            {filtered.map((p, i) => {
              const isSolved = solved.includes(p.id);
              return (
                <div key={p.id} onClick={() => setSelected(p)}
                  className="grid grid-cols-[2.5rem_1fr_7rem_5rem_6rem_6rem] gap-4 px-5 py-4
                    border-b border-[#161616] last:border-0 hover:bg-[#161616] cursor-pointer
                    transition-all duration-150 group items-center">
                  <div className="text-[#333] text-xs font-mono">{i + 1}</div>

                  <div>
                    <div className="text-[#ddd] font-mono text-sm group-hover:text-[#00e87a] transition-colors mb-1">
                      {p.title}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {(p.tags || []).map(t => (
                        <span key={t} className="text-[10px] text-[#444] bg-[#0f0f0f] px-1.5 py-0.5 rounded font-mono border border-[#1a1a1a]">{t}</span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-lg
                      ${p.difficulty === 'Easy' ? 'text-[#00e87a] bg-[#00e87a12]' :
                        p.difficulty === 'Medium' ? 'text-[#f0b429] bg-[#f0b42912]' :
                        'text-[#ff4d4d] bg-[#ff4d4d12]'}`}>
                      {p.difficulty}
                    </span>
                  </div>

                  <div className="text-[#a78bfa] text-sm font-mono font-bold">{p.points}</div>
                  <div className="text-[#444] text-sm font-mono">{p.submission_count || 0}</div>

                  <div>
                    {isSolved
                      ? <span className="inline-flex items-center gap-1 text-[#00e87a] text-xs font-mono font-bold">
                          <span>✓</span> Solved
                        </span>
                      : <span className="text-[#333] text-xs font-mono group-hover:text-[#555] transition-colors">Solve →</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}