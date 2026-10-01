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
      <div className="text-2xl sm:text-3xl md:text-4xl font-display font-extrabold stat-glow text-[#00e87a] tabular-nums">
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

// Live activity ticker — pulls real recent solves from Supabase and
// updates instantly via Realtime when a new one comes in, instead of
// cycling canned placeholder strings.
function ActivityTicker({ members }: { members: number }) {
  const db = getSupabaseClient();
  const fallback = `👥 ${members} coders active this week`;
  const [items, setItems] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRecent() {
      const [{ data: subs }, { data: weekly }, { data: arena }] = await Promise.all([
        db.from('submissions').select('name, github, problem_id, problem_title, created_at')
          .eq('status', 'approved').order('created_at', { ascending: false }).limit(5),
        // eslint-disable-next-line
        (db.from('weekly_submissions') as any).select('name, github, problem_id, problem_title, submitted_at')
          .eq('status', 'approved').order('submitted_at', { ascending: false }).limit(5),
        // eslint-disable-next-line
        (db.from('arena_submissions') as any).select('name, github, problem_id, problem_title, created_at')
          .eq('status', 'reviewed').order('created_at', { ascending: false }).limit(5),
      ]);

      const combinedRaw = [
        ...(subs || []).map((s: any) => ({ who: s.name || s.github, github: s.github, problemId: s.problem_id, what: s.problem_title, when: s.created_at })),
        ...(weekly || []).map((s: any) => ({ who: s.name || s.github, github: s.github, problemId: s.problem_id, what: s.problem_title, when: s.submitted_at })),
        ...(arena || []).map((s: any) => ({ who: s.name || s.github, github: s.github, problemId: s.problem_id, what: s.problem_title, when: s.created_at })),
      ]
        .filter(r => r.who && r.what)
        .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
        .slice(0, 6);

      // "Blood First" check — for just these 6 recent items, was each
      // one the very first approved solve of that problem anywhere on
      // the platform? Scoped to a tiny set of problem_ids so this stays
      // cheap even as total submissions grow.
      const ids = [...new Set(combinedRaw.map(r => r.problemId).filter(Boolean))];
      const firstSolvers = new Map<string, string>();
      if (ids.length > 0) {
        const [{ data: s2 }, { data: w2 }, { data: a2 }] = await Promise.all([
          db.from('submissions').select('github, problem_id, created_at').eq('status', 'approved').in('problem_id', ids),
          // eslint-disable-next-line
          (db.from('weekly_submissions') as any).select('github, problem_id, submitted_at').eq('status', 'approved').in('problem_id', ids),
          // eslint-disable-next-line
          (db.from('arena_submissions') as any).select('github, problem_id, created_at').eq('status', 'reviewed').in('problem_id', ids),
        ]);
        const all = [
          ...(s2 || []).map((r: any) => ({ github: r.github, pid: r.problem_id, when: r.created_at })),
          ...(w2 || []).map((r: any) => ({ github: r.github, pid: r.problem_id, when: r.submitted_at })),
          ...(a2 || []).map((r: any) => ({ github: r.github, pid: r.problem_id, when: r.created_at })),
        ];
        const earliest = new Map<string, { github: string; when: number }>();
        for (const r of all) {
          const t = new Date(r.when).getTime();
          const cur = earliest.get(r.pid);
          if (!cur || t < cur.when) earliest.set(r.pid, { github: r.github, when: t });
        }
        earliest.forEach((v, k) => firstSolvers.set(k, v.github));
      }

      const combined = combinedRaw.map(r =>
        firstSolvers.get(r.problemId) === r.github
          ? `🩸 ${r.who} got Blood First on ${r.what}`
          : `🔥 ${r.who} just solved ${r.what}`
      );

      if (!cancelled) setItems(combined.length > 0 ? combined : [fallback]);
    }

    loadRecent();

    // Re-pull the moment any new approved solve lands, so the very
    // latest real activity shows up without waiting for a page refresh.
    const channel = db
      .channel('home-activity-ticker')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, loadRecent)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_submissions' }, loadRecent)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'arena_submissions' }, loadRecent)
      .subscribe();

    return () => { cancelled = true; db.removeChannel(channel); };
  }, [db]);

  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % items.length);
        setVisible(true);
      }, 300);
    }, 3500);
    return () => clearInterval(interval);
  }, [items.length]);

  const current = items[idx] || fallback;

  return (
    <div className="flex items-center gap-2.5 bg-[#0f0f0f] border border-[#1c1c1c] px-4 py-2 rounded-full max-w-xs overflow-hidden">
      <span className="live-dot shrink-0" />
      <span
        className="text-[11px] font-mono text-[#666] truncate transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {current}
      </span>
    </div>
  );
}

export default function HomePage({ user, onNavigate }: HomePageProps) {
  const [stats, setStats] = useState<{ problems: string; submissions: string; members: string } | null>(null);
  const [announcement, setAnnouncement] = useState<string>('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const db = getSupabaseClient();
    (async () => {
      try {
        const { data } = await (db.from('app_config') as any)
          .select('*')
          .in('key', ['announcement_text', 'announcement_active']);
        const map = new Map((data || []).map((c: any) => [c.key, c.value]));
        if (map.get('announcement_active') === 'true' && map.get('announcement_text')) {
          setAnnouncement(String(map.get('announcement_text')));
        }
      } catch {}
    })();
    try {
      const stored = sessionStorage.getItem('bb_announcement_dismissed');
      if (stored) setDismissed(true);
    } catch {}
  }, []);

  function dismissAnnouncement() {
    setDismissed(true);
    try { sessionStorage.setItem('bb_announcement_dismissed', '1'); } catch {}
  }

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

  const [dailyProblem, setDailyProblem] = useState<any>(null);
  const [dailySolvedToday, setDailySolvedToday] = useState(false);
  const [dailySolverCount, setDailySolverCount] = useState<number | null>(null);
  // Ticks every minute so the "resets in Xh Ym" countdown stays live
  // without needing a full page refresh.
  const [, tickMinute] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tickMinute(n => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const db = getSupabaseClient();
    (async () => {
      try {
        const { data } = await db.from('problems').select('*')
          .eq('visibility', 'public');
        const pool = ((data || []) as any[]).filter((p: any) => !p.is_contest_problem);
        if (!pool.length) return;

        // Deterministic pick — same problem for everyone, changes once per day
        const dayKey = new Date().toISOString().slice(0, 10);
        let hash = 0;
        for (let i = 0; i < dayKey.length; i++) hash = (hash * 31 + dayKey.charCodeAt(i)) >>> 0;
        const problem = pool[hash % pool.length];
        setDailyProblem(problem);

        if (user?.github) {
          const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
          const { data: subs } = await db.from('submissions').select('id, created_at')
            .eq('github', user.github).eq('problem_id', problem.id).eq('status', 'approved');
          const solvedToday = (subs || []).some((s: any) => new Date(s.created_at) >= startOfDay);
          setDailySolvedToday(solvedToday);
        }

        // Social proof — how many distinct people have solved today's
        // pick so far. Cheap query: only rows for this one problem_id,
        // filtered client-side to today (submissions table is small
        // enough at current scale; revisit with a date filter server-side
        // if this table grows much larger).
        try {
          const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
          const { data: allSubs } = await db.from('submissions')
            .select('github, created_at').eq('problem_id', problem.id).eq('status', 'approved');
          const solvers = new Set(
            (allSubs || [])
              .filter((s: any) => new Date(s.created_at) >= startOfDay)
              .map((s: any) => s.github)
          );
          setDailySolverCount(solvers.size);
        } catch {}
      } catch {}
    })();
  }, [user?.github]);

  function openDailyProblem() {
    if (!dailyProblem) return;
    try { sessionStorage.setItem('bb_open_problem_id', dailyProblem.id); } catch {}
    onNavigate('problems');
  }

  function timeUntilNextDaily(): string {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const ms = midnight.getTime() - now.getTime();
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${h}h ${m}m`;
  }

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
      desc: 'Every test case you pass earns points. Contest winners may receive a prize, arranged and given separately by the organizer.',
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

      {announcement && !dismissed && (
        <div className="flex items-center gap-3 px-4 py-3 mb-4 bg-[#00e87a08] border border-[#00e87a20]
          rounded-2xl text-sm font-mono text-[#00e87a] animate-fade-up">
          <span className="shrink-0">📣</span>
          <span className="flex-1">{announcement}</span>
          <button
            onClick={dismissAnnouncement}
            aria-label="Dismiss announcement"
            className="shrink-0 text-[#00e87a80] hover:text-[#00e87a] transition-colors px-1"
          >
            ✕
          </button>
        </div>
      )}

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
        <h1 className="relative font-display font-extrabold text-[#e2e2e2]
          mb-5 leading-[1.05] tracking-tight px-4 animate-fade-up delay-75"
          style={{ fontSize: 'var(--fs-hero)' }}>
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
        <div className="relative flex items-center justify-center flex-wrap gap-6 sm:gap-10 md:gap-20 px-4">
          <StatCard value={stats?.problems ?? ''} label="Problems" delay={400} />
          <div className="w-px h-10 bg-[#1c1c1c] hidden sm:block" />
          <StatCard value={stats?.submissions ?? ''} label="Submissions" delay={500} />
          <div className="w-px h-10 bg-[#1c1c1c] hidden sm:block" />
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

      {/* ── Daily Problem ─────────────────────────────────────
           Kept on the homepage but not glued to the very top —
           one section further down, still a single click away. */}
      {dailyProblem && (
        <section className="pb-8">
          <button onClick={openDailyProblem}
            className="w-full flex items-center gap-4 px-5 py-4 bg-[#f0b42908] border border-[#f0b42925]
              rounded-2xl text-left hover:border-[#f0b42945] transition-all duration-200 group">
            <div className="w-11 h-11 rounded-xl bg-[#f0b42912] flex items-center justify-center text-xl shrink-0">
              🗓️
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#f0b429] font-bold">Daily Problem</span>
                {dailySolvedToday && (
                  <span className="text-[10px] font-mono text-[#00e87a] bg-[#00e87a12] border border-[#00e87a20] rounded-full px-2 py-0.5">
                    ✓ Solved today
                  </span>
                )}
                <span className="text-[10px] font-mono text-[#666]">· resets in {timeUntilNextDaily()}</span>
              </div>
              <div className="font-display font-bold text-[#e2e2e2] text-sm truncate">{dailyProblem.title}</div>
              {dailySolverCount !== null && dailySolverCount > 0 && (
                <div className="text-[10px] font-mono text-[#888] mt-0.5">
                  🔥 {dailySolverCount} {dailySolverCount === 1 ? 'person has' : 'people have'} solved this today
                </div>
              )}
            </div>
            <span className={`text-xs font-mono font-bold shrink-0 px-2 py-1 rounded-lg
              ${dailyProblem.difficulty === 'Easy' ? 'text-[#00e87a] bg-[#00e87a12]' :
                dailyProblem.difficulty === 'Medium' ? 'text-[#f0b429] bg-[#f0b42912]' :
                'text-[#ff4d4d] bg-[#ff4d4d12]'}`}>
              {dailyProblem.difficulty}
            </span>
            <span className="text-[#666] group-hover:text-[#f0b429] transition-colors shrink-0">→</span>
          </button>
        </section>
      )}

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
            { n: '04', t: 'Climb the ranks', d: 'Points accumulate, top coders may receive a prize', c: '#ff4d4d' },
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
