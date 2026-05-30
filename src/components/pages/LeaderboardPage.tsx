'use client';
import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { Member } from '@/types/database';

type Tab = 'overall' | 'weekly' | 'monthly';
const db = getSupabaseClient();

interface EnrichedMember extends Member { rank_change?: number; }

export default function LeaderboardPage() {
  const [members, setMembers] = useState<EnrichedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<Tab>('overall');
  const [search,  setSearch]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'overall') {
        const { data } = await db.from('members').select('*').order('total_points', { ascending: false }).limit(100);
        setMembers((data || []) as EnrichedMember[]);
      } else {
        const cutoff = new Date();
        if (tab === 'weekly')  cutoff.setDate(cutoff.getDate() - 7);
        if (tab === 'monthly') cutoff.setMonth(cutoff.getMonth() - 1);

        const [{ data: subs }, { data: arenaSubs }] = await Promise.all([
          db
            .from('submissions')
            .select('github, name, points_awarded')
            .eq('status', 'approved')
            .gte('created_at', cutoff.toISOString())
            .returns<{ github: string; name: string; points_awarded: number }[]>(),
          db
            .from('arena_submissions')
            .select('github, name, points_awarded')
            .eq('status', 'approved')
            .gte('created_at', cutoff.toISOString())
            .returns<{ github: string; name: string; points_awarded: number }[]>(),
        ]);

        const map: Record<string, { github: string; name: string; total: number; count: number }> = {};
        for (const s of [...(subs || []), ...(arenaSubs || [])]) {
          if (!map[s.github]) map[s.github] = { github: s.github, name: s.name, total: 0, count: 0 };
          map[s.github].total += s.points_awarded || 0;
          map[s.github].count += 1;
        }

        const ranked = Object.values(map)
          .sort((a, b) => b.total - a.total)
          .slice(0, 100)
          .map(m => ({
            id: m.github, github: m.github, name: m.name,
            total_points: m.total, problems_solved: m.count,
            streak: 0, last_solved_at: null, created_at: '',
          } as EnrichedMember));

        setMembers(ranked);
      }
    } catch {}
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tab !== 'overall') return;
    const channel = db
      .channel('leaderboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, load)
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [tab, load]);

  const filtered = search.trim()
    ? members.filter(m =>
        m.name?.toLowerCase().includes(search.toLowerCase()) ||
        m.github?.toLowerCase().includes(search.toLowerCase()))
    : members;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overall', label: 'All Time'   },
    { id: 'weekly',  label: 'This Week'  },
    { id: 'monthly', label: 'This Month' },
  ];

  const rankColors = ['text-[#00e87a]', 'text-[#a78bfa]', 'text-[#f0b429]'];
  const rankBg     = ['bg-[#00e87a08] border-[#00e87a25]', 'bg-[#a78bfa08] border-[#a78bfa20]', 'bg-[#f0b42908] border-[#f0b42920]'];
  const medals     = ['🥇', '🥈', '🥉'];

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-xl md:text-2xl mb-1">Leaderboard</h1>
          <p className="text-[#444] text-xs font-mono">Rankings update automatically after each approved submission.</p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-[#0d0d0d] border border-[#1f1f1f] rounded-xl p-1 w-fit">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all duration-150
                ${tab === t.id ? 'bg-[#00e87a] text-black font-bold' : 'text-[#555] hover:text-[#e0e0e0]'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="mb-5">
        <div className="relative w-full sm:w-72">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#333] text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or username…"
            className="w-full input-base pl-8"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="spinner" />
          <span className="text-[#444] text-xs font-mono">Loading rankings…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="text-4xl opacity-30">🏆</div>
          <div className="text-[#444] font-mono text-sm">
            {search ? 'No members match your search.' : 'No members yet — be the first to solve a problem!'}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Column headers — desktop only */}
          <div className="hidden sm:grid grid-cols-[3rem_1fr_5rem_5rem] gap-4 px-4 py-2
            text-[10px] text-[#333] font-mono uppercase tracking-widest border-b border-[#161616] mb-1">
            <div>Rank</div>
            <div>Member</div>
            <div className="text-center">Solved</div>
            <div className="text-right">Points</div>
          </div>

          {filtered.map((m, i) => {
            const isTop3 = i < 3 && !search;
            return (
              <div key={m.id}
                className={`flex items-center gap-3 md:gap-4 px-4 py-3.5 rounded-2xl border transition-all duration-150
                  hover:brightness-110
                  ${isTop3 ? rankBg[i] : 'bg-[#111] border-[#1f1f1f]'}`}>

                {/* Rank */}
                <div className="w-9 text-center shrink-0">
                  {isTop3
                    ? <span className="text-xl">{medals[i]}</span>
                    : <span className={`font-mono text-xs font-bold text-[#333]`}>#{i + 1}</span>}
                </div>

                {/* Avatar */}
                <img
                  src={`https://github.com/${m.github}.png?size=40`}
                  alt={m.name || m.github}
                  onError={e => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('style');
                  }}
                  className={`w-9 h-9 rounded-full object-cover shrink-0
                    ${i === 0 ? 'ring-2 ring-[#00e87a]' : i === 1 ? 'ring-2 ring-[#a78bfa]' : i === 2 ? 'ring-2 ring-[#f0b429]' : 'ring-1 ring-[#222]'}`}
                />
                <div style={{ display: 'none' }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0
                    ${isTop3 ? `bg-[#1a1a1a] ${rankColors[i]}` : 'bg-[#1a1a1a] text-[#555]'}`}>
                  {(m.name || m.github || '?')[0].toUpperCase()}
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div className="font-mono font-bold text-[#e0e0e0] text-sm truncate">
                    {m.name || m.github}
                  </div>
                  <div className="text-[10px] text-[#444] font-mono flex items-center gap-1.5 mt-0.5">
                    <a href={`https://github.com/${m.github}`} target="_blank" rel="noopener noreferrer"
                      className="hover:text-[#00e87a] transition-colors" onClick={e => e.stopPropagation()}>
                      @{m.github}
                    </a>
                    {m.streak > 0 && <span className="text-[#f0b429]">🔥 {m.streak}d</span>}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 shrink-0">
                  <div className="hidden sm:flex flex-col items-center">
                    <span className="font-mono font-bold text-[#e0e0e0] text-sm">{m.problems_solved}</span>
                    <span className="text-[9px] text-[#333] font-mono">solved</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className={`font-mono font-bold text-sm ${isTop3 ? rankColors[i] : 'text-[#e0e0e0]'}`}>
                      {m.total_points.toLocaleString()}
                    </span>
                    <span className="text-[9px] text-[#333] font-mono">pts</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab !== 'overall' && !loading && filtered.length > 0 && (
        <p className="text-[10px] text-[#333] font-mono text-center mt-6">
          Showing approved submissions from the past {tab === 'weekly' ? '7' : '30'} days.
        </p>
      )}
    </div>
  );
}