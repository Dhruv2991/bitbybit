'use client';
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { Member } from '@/types/database';

export default function LeaderboardPage() {
  const db = getSupabaseClient();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await db
          .from('members')
          .select('*')
          .order('total_points', { ascending: false })
          .limit(50);
        setMembers(data || []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <h1 className="font-display font-bold text-xl md:text-2xl mb-1">Leaderboard</h1>
        <p className="text-[#444] text-xs font-mono">Rankings updated in real-time after each approved submission.</p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="spinner" />
          <span className="text-[#444] text-xs font-mono">Loading rankings…</span>
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="text-4xl">🏆</div>
          <div className="text-[#444] font-mono text-sm">No members yet. Be the first to solve a problem!</div>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m, i) => {
            const isTop3 = i < 3;
            return (
              <div key={m.id}
                className={`flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3 md:py-4 rounded-xl border transition-all
                  ${i === 0 ? 'bg-[#00e87a08] border-[#00e87a30]' :
                    i === 1 ? 'bg-[#a78bfa08] border-[#a78bfa20]' :
                    i === 2 ? 'bg-[#f0b42908] border-[#f0b42920]' :
                              'bg-[#111] border-[#1f1f1f]'}`}>

                {/* Rank */}
                <div className="w-8 md:w-10 text-center shrink-0">
                  {isTop3
                    ? <span className="text-lg md:text-xl">{medals[i]}</span>
                    : <span className="text-[#444] font-mono text-sm font-bold">#{i + 1}</span>}
                </div>

                {/* Avatar */}
                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center
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
                  <div className="text-[10px] md:text-xs text-[#444] font-mono truncate">
                    @{m.github}
                    {m.streak > 0 && (
                      <span className="ml-2 text-[#f0b429]">🔥 {m.streak}d streak</span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 md:gap-6 shrink-0">
                  {/* Solved — hidden on very small screens */}
                  <div className="hidden sm:flex flex-col items-center">
                    <span className="font-mono font-bold text-[#e0e0e0] text-sm">{m.problems_solved}</span>
                    <span className="text-[9px] md:text-[10px] text-[#444] font-mono">solved</span>
                  </div>
                  {/* XP — always visible */}
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
    </div>
  );
}