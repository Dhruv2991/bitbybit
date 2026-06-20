'use client';
import { useEffect, useState, useRef } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { User } from '@/types/database';

interface HomePageProps {
  user:       User | null;
  onNavigate: (page: any) => void;
}

// Animated counter hook
function useCountUp(target: number, duration = 1200) {
  const [val, setVal] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!target || started.current) return;
    started.current = true;
    const start = performance.now();
    function step(now: number) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.floor(eased * target));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [target, duration]);
  return val;
}

function StatCard({ value, label, delay }: { value: string; label: string; delay: number }) {
  const num = parseInt(value) || 0;
  const counted = useCountUp(num, 1400);
  const isLoaded = value !== undefined;
  return (
    <div className="text-center animate-counter-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="text-3xl md:text-4xl font-display font-extrabold stat-glow text-[#00e87a] tabular-nums">
        {isLoaded ? (num > 0 ? counted.toLocaleString() : value) : (
          <span className="inline-block w-14 h-9 bg-[#1a1a1a] rounded-lg animate-pulse" />
        )}
      </div>
      <div className="text-[10px] text-[#555] font-mono mt-2 tracking-[0.2em] uppercase">{label}</div>
    </div>
  );
}

// Floating terminal snippet
function TerminalSnippet() {
  const lines = [
    { text: '$ run solution.py', color: '#00e87a', delay: 0 },
    { text: 'Testing... 5/5 passed ✓', color: '#e2e2e2', delay: 300 },
    { text: 'Points awarded: +187 pts', color: '#a78bfa', delay: 600 },
    { text: 'Rank updated: #3 → #1 🏆', color: '#f0b429', delay: 900 },
  ];
  return (
    <div className="animate-float" style={{ animationDelay: '500ms' }}>
      <div className="bg-[#0a0a0a] border border-[#1c1c1c] rounded-2xl overflow-hidden w-72 shadow-2xl">
        {/* Terminal title bar */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[#1c1c1c]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff4d4d]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#f0b429]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#00e87a]" />
          <span className="ml-2 text-[10px] font-mono text-[#333]">bit-by-bit ~ arena</span>
        </div>
        <div className="p-4 space-y-2 font-mono text-xs">
          {lines.map((l, i) => (
            <div key={i} className="animate-fade-up" style={{ animationDelay: `${800 + l.delay}ms` }}>
              <span style={{ color: l.color }}>{l.text}</span>
            </div>
          ))}
          <div className="flex items-center gap-1 animate-fade-up" style={{ animationDelay: '2000ms' }}>
            <span className="text-[#00e87a]">$</span>
            <span className="w-2 h-3.5 bg-[#00e87a] cursor-blink inline-block ml-0.5" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Live activity ticker
function ActivityTicker({ members }: { members: number }) {
  const activities = [
    '🔥 someone solved Two Sum in Python',
    '⚡ new weekly challenge is LIVE',
    `👥 ${members} coders active this week`,
    '🏆 Arena contest ends in 2h 14m',
    '✓ 47 test cases passed just now',
  ];
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % activities.length);
        setVisible(true);
      }, 300);
    }, 3500);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="flex items-center gap-2.5 bg-[#0f0f0f] border border-[#1c1c1c] px-4 py-2 rounded-full max-w-xs overflow-hidden">
      <span className="live-dot shrink-0" />
      <span
        className="text-[11px] font-mono text-[#666] truncate transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {activities[idx]}
      </span>
    </div>
  );
}

export default function HomePage({ user, onNavigate }: HomePageProps) {
  const [stats, setStats] = useState<{ problems: string; submissions: string; members: string } | null>(null);

  useEffect(() => {
    const db = getSupabaseClient();
    (async () => {
      try {
        const [{ data: pd }, { data: sd }, { data: wd }, { data: md }] = await Promise.all([
          db.from('problems').select('id'),
          db.from('submissions').select('id'),
          (db.from('weekly_submissions') as any).select('id'),
          db.from('members').select('id'),
        ]);
        setStats({
          problems:    String(pd?.length ?? 0),
          submissions: String((sd?.length ?? 0) + (wd?.length ?? 0)),
          members:     String(md?.length ?? 0),
        });
      } catch {
        setStats({ problems: '—', submissions: '—', members: '—' });
      }
    })();
  }, []);

  const features = [
    {
      icon: '⚡',
      label: 'Weekly',
      title: 'Weekly Challenges',
      desc: '3 new problems every week. Solve earlier for a higher time bonus — points decay as the week progresses.',
      color: '#f0b429',
      glow: 'rgba(240,180,41,0.08)',
      page: 'weekly',
    },
    {
      icon: '🏆',
      label: 'Rewards',
      title: 'Points & Prizes',
      desc: 'Every test case you pass earns points. Contest winners get real UPI payouts directly to their account.',
      color: '#00e87a',
      glow: 'rgba(0,232,122,0.08)',
      page: 'leaderboard',
    },
    {
      icon: '🛡️',
      label: 'Arena',
      title: 'Proctored Arena',
      desc: 'Compete in a supervised, fullscreen environment. Tab switches are monitored. 3 strikes = disqualified.',
      color: '#ff4d4d',
      glow: 'rgba(255,77,77,0.08)',
      page: 'arena',
    },
    {
      icon: '💡',
      label: 'Multi-lang',
      title: 'Real Code Execution',
      desc: 'Python, JavaScript, C++, Java, Rust, Go — all run live in your browser or server-side with real test cases.',
      color: '#a78bfa',
      glow: 'rgba(167,139,250,0.08)',
      page: 'problems',
    },
  ];

  return (
    <div className="animate-fade-up">

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative text-center pt-12 pb-16 md:pt-20 md:pb-24 overflow-hidden">

        {/* Grid background */}
        <div className="absolute inset-0 hero-grid opacity-100 pointer-events-none" />

        {/* Radial glow */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(0,232,122,0.06) 0%, transparent 70%)' }} />

        {/* Live badge */}
        <div className="relative inline-flex items-center gap-2 bg-[#0f0f0f] border border-[#1c1c1c]
          px-4 py-1.5 rounded-full text-xs font-mono text-[#555] mb-8 animate-fade-up">
          <span className="live-dot" />
          <span>by <span className="text-[#00e87a]">TeamCodeLocked</span></span>
          <span className="text-[#2a2a2a]">·</span>
          <span>Beta v2.0</span>
        </div>

        {/* Headline */}
        <h1 className="relative font-display font-extrabold text-4xl md:text-6xl lg:text-7xl text-[#e2e2e2]
          mb-5 leading-[1.05] tracking-tight px-4 animate-fade-up delay-75">
          Build Sharper.<br />
          <span className="text-[#00e87a] glow-text">Code Bit By Bit.</span>
        </h1>

        <p className="relative text-[#555] text-sm md:text-base font-mono max-w-lg mx-auto mb-10 px-4
          leading-relaxed animate-fade-up delay-150">
          The private coding arena for TeamCodeLocked — solve daily problems,
          run real tests, and compete in proctored contests.
        </p>

        {/* CTA buttons */}
        <div className="relative flex items-center justify-center gap-3 flex-wrap px-4 mb-10 animate-fade-up delay-225">
          <button onClick={() => onNavigate('problems')} className="btn-primary text-sm px-6 py-3">
            Browse Problems →
          </button>
          <button onClick={() => onNavigate('weekly')} className="btn-ghost text-sm px-6 py-3">
            Weekly Challenge
          </button>
        </div>

        {/* Activity ticker */}
        <div className="relative flex justify-center mb-14 animate-fade-up delay-300">
          <ActivityTicker members={parseInt(stats?.members || '0')} />
        </div>

        {/* Stats row */}
        <div className="relative flex items-center justify-center gap-12 md:gap-20">
          <StatCard value={stats?.problems ?? ''} label="Problems" delay={400} />
          <div className="w-px h-10 bg-[#1c1c1c]" />
          <StatCard value={stats?.submissions ?? ''} label="Submissions" delay={500} />
          <div className="w-px h-10 bg-[#1c1c1c]" />
          <StatCard value={stats?.members ?? ''} label="Members" delay={600} />
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pb-8">
        {features.map((f, i) => (
          <button
            key={f.title}
            onClick={() => onNavigate(f.page as any)}
            className="card-glow p-5 text-left group animate-fade-up cursor-pointer"
            style={{ animationDelay: `${700 + i * 80}ms` }}
          >
            {/* Icon + label row */}
            <div className="flex items-center justify-between mb-4">
              <div className="text-2xl">{f.icon}</div>
              <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-md"
                style={{ color: f.color, background: f.glow }}>
                {f.label}
              </span>
            </div>

            <h3 className="font-display font-bold text-[#e2e2e2] text-sm mb-2
              group-hover:text-[#00e87a] transition-colors duration-200">
              {f.title}
            </h3>
            <p className="text-[#444] text-xs font-mono leading-relaxed">{f.desc}</p>

            {/* Bottom CTA */}
            <div className="mt-4 flex items-center gap-1 text-[10px] font-mono transition-all duration-200"
              style={{ color: f.color, opacity: 0.5 }}>
              <span className="group-hover:opacity-100 transition-opacity">Explore →</span>
            </div>
          </button>
        ))}
      </section>

      {/* ── Terminal snippet + how it works ────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 pb-8">

        {/* Terminal */}
        <div className="flex items-center justify-center p-8 card relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(0,232,122,0.04) 0%, transparent 70%)' }} />
          <TerminalSnippet />
        </div>

        {/* How it works */}
        <div className="card p-6 flex flex-col justify-center gap-4">
          <h2 className="font-display font-bold text-[#e2e2e2] text-base mb-1">How it works</h2>
          {[
            { n: '01', t: 'Pick a problem', d: 'Browse by difficulty or weekly challenge pool', c: '#00e87a' },
            { n: '02', t: 'Write & run', d: 'Code in your language, run against real test cases', c: '#a78bfa' },
            { n: '03', t: 'Submit', d: 'Admin reviews your approach, awards points', c: '#f0b429' },
            { n: '04', t: 'Climb the ranks', d: 'Points accumulate, top coders win real prizes', c: '#ff4d4d' },
          ].map((step, i) => (
            <div key={step.n} className="flex items-start gap-3 animate-fade-up"
              style={{ animationDelay: `${900 + i * 100}ms` }}>
              <span className="font-mono text-xs font-bold shrink-0 mt-0.5 tabular-nums"
                style={{ color: step.c }}>
                {step.n}
              </span>
              <div>
                <div className="font-mono text-sm text-[#e2e2e2] font-bold">{step.t}</div>
                <div className="font-mono text-[11px] text-[#444] mt-0.5">{step.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA banner ─────────────────────────────────────── */}
      {!user && (
        <section className="card animate-border-glow p-8 text-center mb-4 relative overflow-hidden animate-fade-up"
          style={{ animationDelay: '1200ms' }}>
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 100%, rgba(0,232,122,0.05) 0%, transparent 70%)' }} />
          <p className="font-mono text-[#555] text-xs mb-1 uppercase tracking-widest">Ready to compete?</p>
          <h2 className="font-display font-bold text-xl text-[#e2e2e2] mb-4">
            Sign in with GitHub to start solving
          </h2>
          <button onClick={() => onNavigate('arena')} className="btn-primary">
            Get Started →
          </button>
        </section>
      )}

    </div>
  );
}