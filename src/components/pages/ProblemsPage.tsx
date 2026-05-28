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

  if (selected) {
    return <Workspace problem={selected} user={user} onClose={() => setSelected(null)} />;
  }

  return (
    <div>
      <div className="mb-4 md:mb-6 flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display font-bold text-xl md:text-2xl">Problems</h1>
        <div className="flex gap-2 flex-wrap">
          {DIFFICULTIES.map(d => (
            <button key={d} onClick={() => setFilter(d)}
              className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-mono transition-all
                ${filter === d
                  ? 'bg-[#00e87a] text-black font-bold'
                  : 'bg-[#111] border border-[#1f1f1f] text-[#666] hover:text-[#e0e0e0]'}`}>
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
          <div className="text-4xl">{ '{  }' }</div>
          <div className="text-[#444] font-mono text-sm">
            {problems.length === 0 ? 'No problems yet. Check back soon!' : 'No problems match this filter.'}
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
                  className="bg-[#111] border border-[#1f1f1f] rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer active:bg-[#161616]">
                  <div className="text-[#333] text-sm font-mono w-6 shrink-0">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[#e0e0e0] font-mono text-sm truncate">{p.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded
                        ${p.difficulty === 'Easy' ? 'text-[#00e87a] bg-[#00e87a15]' :
                          p.difficulty === 'Medium' ? 'text-[#f0b429] bg-[#f0b42915]' :
                          'text-[#ff4d4d] bg-[#ff4d4d15]'}`}>
                        {p.difficulty}
                      </span>
                      <span className="text-[#a78bfa] text-[10px] font-mono">{p.points}pts</span>
                    </div>
                  </div>
                  <span className={`text-xs font-mono shrink-0 ${isSolved ? 'text-[#00e87a]' : 'text-[#333]'}`}>
                    {isSolved ? '✓' : '→'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-[#111] border border-[#1f1f1f] rounded-xl overflow-hidden">
            <div className="grid grid-cols-[2rem_1fr_auto_auto_auto_auto] gap-4 px-5 py-3
              border-b border-[#1a1a1a] text-xs text-[#444] font-mono uppercase tracking-wider">
              <div>#</div><div>Title</div><div>Difficulty</div>
              <div>Points</div><div>Submissions</div><div>Status</div>
            </div>
            {filtered.map((p, i) => {
              const isSolved = solved.includes(p.id);
              return (
                <div key={p.id} onClick={() => setSelected(p)}
                  className="grid grid-cols-[2rem_1fr_auto_auto_auto_auto] gap-4 px-5 py-4
                    border-b border-[#161616] last:border-0 hover:bg-[#161616] cursor-pointer
                    transition-colors group items-center">
                  <div className="text-[#444] text-sm font-mono">{i + 1}</div>
                  <div>
                    <div className="text-[#e0e0e0] font-mono text-sm group-hover:text-[#00e87a] transition-colors">{p.title}</div>
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      {(p.tags || []).map(t => (
                        <span key={t} className="text-[10px] text-[#444] bg-[#0f0f0f] px-1.5 py-0.5 rounded font-mono">{t}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded
                      ${p.difficulty === 'Easy' ? 'text-[#00e87a] bg-[#00e87a15]' :
                        p.difficulty === 'Medium' ? 'text-[#f0b429] bg-[#f0b42915]' :
                        'text-[#ff4d4d] bg-[#ff4d4d15]'}`}>
                      {p.difficulty}
                    </span>
                  </div>
                  <div className="text-[#a78bfa] text-sm font-mono font-bold">{p.points}</div>
                  <div className="text-[#444] text-sm font-mono">{p.submission_count || 0}</div>
                  <div>
                    {isSolved
                      ? <span className="text-[#00e87a] text-xs font-mono font-bold">✓ Solved</span>
                      : <span className="text-[#333] text-xs font-mono">Solve →</span>}
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