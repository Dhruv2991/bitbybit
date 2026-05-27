'use client';
// src/components/pages/LeaderboardPage.tsx

import { useState, useEffect } from 'react';
import { getSupabaseClient }   from '@/lib/supabase';
import type { Member }         from '@/types/database';

export default function LeaderboardPage() {
  const db = getSupabaseClient();
  const [members, setMembers]  = useState<Member[]>([]);
  const [loading, setLoading]  = useState(true);
  const [tab,     setTab]      = useState<'all' | 'contests'>('all');

  useEffect(() => { loadLeaderboard(); }, [tab]);

  async function loadLeaderboard() {
    setLoading(true);
    try {
      const { data } = await db.from('members').select('*').order('total_points', { ascending: false }).limit(50);
      setMembers(data || []);
    } catch {
      setMembers([
        { id:'1', name:'Nitin Kumar',  github:'nitin-bms',    total_points:700, problems_solved:4, streak:5, last_solved_at:null, created_at:'' },
        { id:'2', name:'Zeeshan Ahmed',github:'zeesh-dev',    total_points:500, problems_solved:3, streak:2, last_solved_at:null, created_at:'' },
        { id:'3', name:'Rohit S',      github:'rohit-singh',  total_points:300, problems_solved:2, streak:0, last_solved_at:null, created_at:'' },
      ]);
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display font-bold text-2xl">Leaderboard</h1>
        <div className="flex gap-2">
          {(['all', 'contests'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-mono capitalize transition-all
                ${tab === t ? 'bg-[#00e87a] text-black font-bold' : 'bg-[#111] border border-[#1f1f1f] text-[#666] hover:text-[#e0e0e0]'}`}
            >
              {t === 'all' ? 'All Time' : 'Contests'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[#666] font-mono"><div className="spinner" /> Loading...</div>
      ) : members.length === 0 ? (
        <div className="text-center py-20 text-[#444] font-mono">No leaderboard records yet.</div>
      ) : (
        <div className="space-y-2">
          {members.map((m, i) => (
            <div key={m.id} className={`card px-5 py-4 flex items-center gap-4
              ${i === 0 ? 'border-[#00e87a40]' : i === 1 ? 'border-[#a78bfa30]' : i === 2 ? 'border-[#f0b42930]' : ''}`}>
              <div className="w-10 text-center font-mono font-bold text-lg shrink-0">
                {i === 0 ? '👑' : `#${i + 1}`}
              </div>
              <div className="w-10 h-10 bg-[#1a1a1a] rounded-full flex items-center justify-center
                font-display font-bold text-[#00e87a] shrink-0">
                {(m.name || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono font-bold text-[#e0e0e0] truncate">{m.name}</div>
                <div className="text-xs text-[#444] font-mono">@{m.github}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono font-bold text-[#00e87a]">{m.total_points} XP</div>
                <div className="text-xs text-[#444] font-mono">{m.problems_solved} solved · {m.streak}d streak</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
