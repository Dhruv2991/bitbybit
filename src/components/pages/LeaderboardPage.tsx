'use client';
import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { Member, Submission } from '@/types/database';

type Tab = 'overall' | 'weekly' | 'monthly';

interface EnrichedMember extends Member {
  rank_change?: number; // +N up, -N down, 0 same
}

export default function LeaderboardPage() {
  const db = getSupabaseClient();
  const [members,   setMembers]   = useState<EnrichedMember[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState<Tab>('overall');
  const [search,    setSearch]    = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'overall') {
        const { data } = await db
          .from('members')
          .select('*')
          .order('total_points', { ascending: false })
          .limit(100);
        setMembers((data || []) as EnrichedMember[]);

      } else {
        // Compute weekly/monthly leaderboard from approved submissions
        const cutoff = new Date();
        if (tab === 'weekly')  cutoff.setDate(cutoff.getDate() - 7);
        if (tab === 'monthly') cutoff.setMonth(cutoff.getMonth() - 1);

        const { data: subs } = await db
          .from('submissions')
          .select('github, name, points_awarded')
          .eq('status', 'approved')
          .gte('created_at', cutoff.toISOString())
          .returns<{ github: string; name: string; points_awarded: number }[]>();

        // Aggregate by github
        const map: Record<string, { github: string; name: string; total: number; count: number }> = {};
        for (const s of subs || []) {
          if (!map[s.github]) map[s.github] = { github: s.github, name: s.name, total: 0, count: 0 };
          map[s.github].total += s.points_awarded || 0;
          map[s.github].count += 1;
        }

        const ranked = Object.values(map)
          .sort((a, b) => b.total - a.total)
          .slice(0, 100)
          .map((m, i) => ({
            id: m.github,
            github: m.github,
            name: m.name,
            total_points: m.total,
            problems_solved: m.count,
            streak: 0,
            last_solved_at: null,
            created_at: '',
          } as EnrichedMember));

        setMembers(ranked);
      }
    } catch {}
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  // Real-time updates for overall tab
  useEffect(() => {
    if (tab !== 'overall') return;
    const channel = db
      .channel('leaderboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, load)
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [tab, load]);

  const medals = ['🥇', '🥈', '🥉'];

  const filtered = search.trim()
    ? members.filter(m =>
        m.name?.toLowerCase().includes(search.toLowerCase()) ||
        m.github?.toLowerCase().includes(search.toLowerCase())
      )
    : members;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overall', label: 'All Time' },
    { id: 'weekly',  label: 'This Week' },
    { id: 'monthly', label: 'This Month' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 md:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-bold text-xl md:text-2xl mb-1">Leaderboard</h1>
          <p className="text-[#444] text-xs font-mono">Rankings updated in real-time after each approved submission.</p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded text-xs font-mono font-bold transition-all
                ${tab === t.id
                  ? 'bg-[#00e87a] text-black'
                  : 'text-[#666] hover:text-[#e0e0e0]'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or @github…"
          className="w-full sm:w-72 bg-[#0f0f0f] border border-[#1f1f1f] rounded-lg px-3 py-2
            text-[#e0e0e0] text-sm font-mono placeholder-[#333]
            focus:outline-none focus:border-[#00e87a40]"
        />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="spinner" />
          <span className="text-[#444] text-xs font-mono">Loading rankings…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="text-4xl">🏆</div>
          <div className="text-[#444] font-mono text-sm">
            {search ? 'No members match your search.' : 'No members yet. Be the first to solve a problem!'}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-[3rem_1fr_6rem_6rem] gap-4 px-4 py-2
            text-[10px] text-[#444] font-mono uppercase tracking-wider border-b border-[#1a1a1a]">
            <div>Rank</div>
            <div>Member</div>
            <div className="text-center">Solved</div>
            <div className="text-right">XP</div>
          </div>

          {filtered.map((m, i) => {
            const isTop3 = i < 3 && !search;
            return (
              <div key={m.id}
                className={`flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3 md:py-4 rounded-xl border transition-all
                  ${i === 0 && !search ? 'bg-[#00e87a08] border-[#00e87a30]' :
                    i === 1 && !search ? 'bg-[#a78bfa08] border-[#a78bfa20]' :
                    i === 2 && !search ? 'bg-[#f0b42908] border-[#f0b42920]' :
                                         'bg-[#111] border-[#1f1f1f]'}`}>

                {/* Rank */}
                <div className="w-8 md:w-10 text-center shrink-0">
                  {isTop3
                    ? <span className="text-lg md:text-xl">{medals[i]}</span>
                    : <span className="text-[#444] font-mono text-sm font-bold">#{i + 1}</span>}
                </div>

                {/* Avatar */}
                <img
                  src={`https://github.com/${m.github}.png?size=40`}
                  alt={m.name || m.github}
                  onError={e => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('style');
                  }}
                  className={`w-8 h-8 md:w-10 md:h-10 rounded-full object-cover shrink-0
                    ${i === 0 ? 'ring-2 ring-[#00e87a]' : i === 1 ? 'ring-2 ring-[#a78bfa]' : i === 2 ? 'ring-2 ring-[#f0b429]' : ''}`}
                />
                <div
                  style={{ display: 'none' }}
                  className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center
                    font-bold text-sm md:text-base shrink-0
                    ${i === 0 ? 'bg-[#00e87a20] text-[#00e87a]' :
                      i === 1 ? 'bg-[#a78bfa20] text-[#a78bfa]' :
                      i === 2 ? 'bg-[#f0b42920] text-[#f0b429]' :
                                'bg-[#1a1a1a] text-[#666]'}`}>
                  {(m.name || m.github || '?')[0].toUpperCase()}
                </div>

                {/* Name + github */}
                <div className="flex-1 min-w-0">
                  <div className="font-mono font-bold text-[#e0e0e0] truncate text-sm md:text-base">
                    {m.name || m.github}
                  </div>
                  <div className="text-[10px] md:text-xs text-[#444] font-mono flex items-center gap-1 flex-wrap">
                    <a
                      href={`https://github.com/${m.github}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[#00e87a] transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      @{m.github}
                    </a>
                    {m.streak > 0 && (
                      <span className="text-[#f0b429]">🔥 {m.streak}d streak</span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 md:gap-6 shrink-0">
                  <div className="hidden sm:flex flex-col items-center">
                    <span className="font-mono font-bold text-[#e0e0e0] text-sm">{m.problems_solved}</span>
                    <span className="text-[9px] md:text-[10px] text-[#444] font-mono">solved</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className={`font-mono font-bold text-sm md:text-base
                      ${i === 0 ? 'text-[#00e87a]' : i === 1 ? 'text-[#a78bfa]' : i === 2 ? 'text-[#f0b429]' : 'text-[#e0e0e0]'}`}>
                      {m.total_points.toLocaleString()}
                    </span>
                    <span className="text-[9px] md:text-[10px] text-[#444] font-mono">XP</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer note for time-based tabs */}
      {tab !== 'overall' && !loading && filtered.length > 0 && (
        <p className="text-[10px] text-[#333] font-mono text-center mt-6">
          Showing approved submissions from the past {tab === 'weekly' ? '7 days' : '30 days'}.
        </p>
      )}
    </div>
  );
}
