'use client';
import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { User } from '@/types/database';

interface HomePageProps {
  user:       User | null;
  onNavigate: (page: any) => void;
}

export default function HomePage({ user, onNavigate }: HomePageProps) {
  const [stats, setStats] = useState<{ problems: string; submissions: string; members: string } | null>(null);

  useEffect(() => {
    const db = getSupabaseClient();
    (async () => {
      try {
        // Use select('id') instead of head:true — works even with restrictive RLS policies
        const [{ data: pd }, { data: sd }, { data: md }] = await Promise.all([
          db.from('problems').select('id'),
          db.from('submissions').select('id'),
          db.from('members').select('id'),
        ]);
        setStats({
          problems:    String(pd?.length  ?? 0),
          submissions: String(sd?.length  ?? 0),
          members:     String(md?.length  ?? 0),
        });
      } catch {
        setStats({ problems: '—', submissions: '—', members: '—' });
      }
    })();
  }, []);

  const features = [
    { icon: '⚡', title: 'Daily Challenges', desc: 'Admin posts fresh problems. Solve them, push to GitHub, submit the link — all tracked in one place.' },
    { icon: '🏆', title: 'Points & Prizes', desc: 'Earn XP per submission. Points scale with test cases passed. Contest winners get direct UPI payouts.' },
    { icon: '🛡️', title: 'Anti-Cheat Arena', desc: 'Fullscreen proctored environment. Tab switches, fullscreen exits, and copy-paste are all blocked.' },
    { icon: '💡', title: 'Real Execution', desc: 'Code runs on Judge0 — a real sandbox. Python, JavaScript, and C++ all supported with actual test validation.' },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="text-center py-12 md:py-20 relative">
        <div className="inline-block bg-[#111] border border-[#1f1f1f] px-4 py-1.5 rounded-full
          text-xs font-mono text-[#666] mb-6">
          by <span className="text-[#00e87a]">TeamCodeLocked</span> community &nbsp;·&nbsp; Beta v2.0
        </div>
        <h1 className="font-display font-extrabold text-4xl md:text-5xl lg:text-6xl text-[#e0e0e0] mb-4 leading-tight px-4">
          Build Sharper.<br />
          Code <em className="text-[#00e87a] not-italic">Bit By Bit.</em>
        </h1>
        <p className="text-[#666] text-base md:text-lg font-mono max-w-xl mx-auto mb-8 px-4">
          The private arena for TeamCodeLocked — solve daily problems, run real tests, compete in proctored contests.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap px-4">
          <button onClick={() => onNavigate('problems')} className="btn-primary">
            Browse Problems →
          </button>
          {!user && (
            <button onClick={() => onNavigate('arena')} className="btn-ghost">
              Enter Arena
            </button>
          )}
        </div>

        {/* Stats — show spinner until loaded */}
        <div className="flex items-center justify-center gap-8 md:gap-10 mt-10 md:mt-14">
          {[
            { val: stats?.problems,    label: 'Problems'    },
            { val: stats?.submissions, label: 'Submissions' },
            { val: stats?.members,     label: 'Members'     },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-2xl md:text-3xl font-display font-extrabold text-[#00e87a]">
                {s.val ?? <span className="inline-block w-8 h-7 bg-[#1a1a1a] rounded animate-pulse" />}
              </div>
              <div className="text-xs text-[#444] font-mono mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 py-6 md:py-8">
        {features.map(f => (
          <div key={f.title} className="card p-4 md:p-5">
            <div className="text-2xl mb-3">{f.icon}</div>
            <h3 className="font-display font-bold text-[#e0e0e0] mb-2 text-sm md:text-base">{f.title}</h3>
            <p className="text-[#666] text-xs md:text-sm font-mono leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Tech stack */}
      <section className="card p-4 md:p-6 mt-2 md:mt-4">
        <div className="text-xs text-[#444] font-mono uppercase tracking-wider mb-3">Powered by</div>
        <div className="flex flex-wrap gap-2 md:gap-3">
          {['Monaco Editor', 'Judge0', 'Razorpay', 'Supabase', 'Next.js', 'GitHub OAuth'].map(t => (
            <span key={t} className="px-2 md:px-3 py-1 md:py-1.5 bg-[#0a0a0a] border border-[#1f1f1f]
              rounded-lg text-xs font-mono text-[#666]">
              {t}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}