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
    {
      icon: '⚡',
      title: 'Daily Challenges',
      desc: 'Fresh problems posted every day. Solve them in your browser, then submit your GitHub link — everything tracked in one place.',
    },
    {
      icon: '🏆',
      title: 'Points & Prizes',
      desc: 'Earn points for every problem you solve. The more test cases you pass, the more you earn. Contest winners get real UPI payouts.',
    },
    {
      icon: '🛡️',
      title: 'Proctored Arena',
      desc: 'Compete in a supervised, fullscreen environment. Switching tabs or exiting fullscreen counts as a violation.',
    },
    {
      icon: '💡',
      title: 'Real Code Execution',
      desc: 'Your code actually runs — Python, JavaScript, C++, Java, Rust, and Go all supported with live test case validation.',
    },
  ];

  return (
    <div className="animate-fade-up">
      {/* Hero */}
      <section className="text-center py-12 md:py-20">
        <div className="inline-flex items-center gap-2 bg-[#111] border border-[#1f1f1f] px-4 py-1.5 rounded-full
          text-xs font-mono text-[#555] mb-7">
          <span className="live-dot" />
          <span>by <span className="text-[#00e87a]">TeamCodeLocked</span> &nbsp;·&nbsp; Beta v2.0</span>
        </div>

        <h1 className="font-display font-extrabold text-4xl md:text-5xl lg:text-6xl text-[#e0e0e0] mb-5 leading-tight px-4">
          Build Sharper.<br />
          Code <em className="text-[#00e87a] not-italic">Bit By Bit.</em>
        </h1>
        <p className="text-[#555] text-base md:text-lg font-mono max-w-xl mx-auto mb-8 px-4 leading-relaxed">
          The private arena for TeamCodeLocked — solve daily problems, run real tests, and compete in proctored contests.
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

        {/* Stats */}
        <div className="flex items-center justify-center gap-10 md:gap-16 mt-12 md:mt-16">
          {[
            { val: stats?.problems,    label: 'Problems'    },
            { val: stats?.submissions, label: 'Submissions' },
            { val: stats?.members,     label: 'Members'     },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-2xl md:text-3xl font-display font-extrabold text-[#00e87a]">
                {s.val ?? <span className="inline-block w-10 h-7 bg-[#1a1a1a] rounded-lg animate-pulse" />}
              </div>
              <div className="text-[11px] text-[#444] font-mono mt-1.5 tracking-wider uppercase">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 py-4">
        {features.map((f, i) => (
          <div key={f.title}
            className="card p-5 hover:border-[#2a2a2a] transition-all duration-300 group"
            style={{ animationDelay: `${i * 60}ms` }}>
            <div className="text-2xl mb-4">{f.icon}</div>
            <h3 className="font-display font-bold text-[#e0e0e0] mb-2 text-sm group-hover:text-[#00e87a] transition-colors">{f.title}</h3>
            <p className="text-[#555] text-xs font-mono leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
