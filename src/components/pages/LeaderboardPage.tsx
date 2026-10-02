"use client";
import { useState, useEffect, useCallback } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import type { Member } from "@/types/database";
import { effectiveStreak } from "@/lib/streak";

type Tab = "overall" | "weekly" | "monthly" | "challenge" | "streak";

interface EnrichedMember extends Member {
  rank_change?: number;
}
interface ChallengeRow {
  github: string;
  name: string;
  total: number;
  solved: number;
  challengeTitle: string;
  firstSolve: string;
}

function ShareLBButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        const url = `${window.location.origin}${window.location.pathname}#leaderboard`;
        navigator.clipboard?.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="flex items-center gap-2 px-3 py-2 bg-zinc-900/60 border border-zinc-800/80
        rounded-xl font-mono text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700
        transition-all duration-150"
    >
      {copied ? (
        <><span className="text-emerald-400">✓</span><span className="text-emerald-400">Link copied</span></>
      ) : (
        <><span>🔗</span><span>Share</span></>
      )}
    </button>
  );
}

export default function LeaderboardPage() {
  const db = getSupabaseClient();
  const [members, setMembers] = useState<EnrichedMember[]>([]);
  const [challengeRows, setChallengeRows] = useState<ChallengeRow[]>([]);
  const [challengeTitle, setChallengeTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overall");
  // 0 = current calendar month, -1 = last month, -2 = the month before
  // that, etc. Only meaningful when tab === "monthly" — lets people
  // browse past months instead of only ever seeing the current one.
  const [monthOffset, setMonthOffset] = useState(0);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "overall") {
        // Aggregate from all three tables for true all-time points (with safe bounds)
        const [{ data: normalSubs }, { data: arenaSubs }, { data: weeklySubs }, { data: membersData }] = await Promise.all([
          db.from("submissions").select("github, name, points_awarded, problem_id").eq("status", "approved").limit(5000),
          db.from("arena_submissions").select("github, name, points_awarded, problem_id").eq("status", "reviewed").limit(5000),
          (db.from("weekly_submissions") as any).select("github, name, points_awarded, problem_id").eq("status", "approved").limit(5000),
          db.from("members").select("github, name, streak, last_solved_at, created_at, problems_solved").limit(1000),
        ]);

        // Deduplicate: per user per problem, keep only the highest points_awarded
        // (prevents double-counting if the same problem was approved in multiple tables)
        const bestPerProblem = new Map<string, { github: string; name: string; points: number }>();
        for (const s of [...(normalSubs || []), ...(arenaSubs || []), ...(weeklySubs || [])]) {
          const key = `${s.github}::${s.problem_id}`;
          const existing = bestPerProblem.get(key);
          if (!existing || (s.points_awarded || 0) > existing.points)
            bestPerProblem.set(key, { github: s.github, name: s.name, points: s.points_awarded || 0 });
        }

        const map: Record<string, { github: string; name: string; total: number; solved: number }> = {};
        for (const v of bestPerProblem.values()) {
          if (!map[v.github]) map[v.github] = { github: v.github, name: v.name, total: 0, solved: 0 };
          map[v.github].total += v.points;
          map[v.github].solved += 1;
        }

        const membersMap = new Map((membersData || []).map((m: any) => [m.github, m]));
        const ranked = Object.values(map)
          .sort((a, b) => b.total - a.total)
          .slice(0, 100)
          .map(m => {
            const member = membersMap.get(m.github) as any;
            return {
              id: m.github,
              github: m.github,
              name: m.name,
              total_points: m.total,
              problems_solved: m.solved,
              streak: effectiveStreak(member?.streak, member?.last_solved_at),
              last_solved_at: member?.last_solved_at || null,
              created_at: member?.created_at || "",
            } as EnrichedMember;
          });
        setMembers(ranked);
      } else if (tab === "streak") {
        // Ranked purely by current streak, not points — a separate
        // competitive axis that rewards consistency over raw skill.
        // effectiveStreak() self-corrects lapsed streaks so this never
        // shows someone as "on fire" days after they actually stopped.
        const { data: membersData } = await db
          .from("members")
          .select("github, name, streak, last_solved_at, created_at, problems_solved, total_points")
          .limit(1000);

        const ranked = (membersData || [])
          .map((m: any) => ({
            id: m.github,
            github: m.github,
            name: m.name,
            total_points: m.total_points || 0,
            problems_solved: m.problems_solved || 0,
            streak: effectiveStreak(m.streak, m.last_solved_at),
            last_solved_at: m.last_solved_at || null,
            created_at: m.created_at || "",
          }))
          .filter((m: EnrichedMember) => m.streak > 0)
          .sort((a: EnrichedMember, b: EnrichedMember) => {
            if (b.streak !== a.streak) return b.streak - a.streak;
            return new Date(b.last_solved_at || 0).getTime() - new Date(a.last_solved_at || 0).getTime();
          })
          .slice(0, 100);
        setMembers(ranked as EnrichedMember[]);
      } else if (tab === "challenge") {
        // Load the most recent active/ended weekly challenge leaderboard
        // eslint-disable-next-line
        const { data: challenges } = await (db.from("weekly_challenges") as any)
          .select("id, title, status")
          .in("status", ["active", "ended"])
          .order("created_at", { ascending: false })
          .limit(1);

        if (!challenges?.length) {
          setChallengeRows([]);
          setChallengeTitle("");
          setLoading(false);
          return;
        }

        const ch = challenges[0];
        setChallengeTitle(ch.title);

        // eslint-disable-next-line
        const { data: subs } = await (db.from("weekly_submissions") as any)
          .select(
            `
 github,
 name,
 points_awarded,
 problem_id,
 submitted_at
`,
          )
          .eq("weekly_challenge_id", ch.id)
          .eq("status", "approved")
          .limit(5000);

        const map = new Map<
          string,
          { name: string; total: number; problems: Set<string>; firstSolve: string }
        >();
        for (const s of subs || []) {
          if (!map.has(s.github))
            map.set(s.github, { name: s.name, total: 0, problems: new Set(), firstSolve: s.submitted_at });
          const e = map.get(s.github)!;
          e.total += s.points_awarded || 0;
          e.problems.add(s.problem_id);
          if (new Date(s.submitted_at).getTime() < new Date(e.firstSolve).getTime())
            e.firstSolve = s.submitted_at;
        }
        const rows = [...map.entries()]
          .map(([github, v]) => ({
            github,
            name: v.name,
            total: v.total,
            solved: v.problems.size,
            challengeTitle: ch.title,
            firstSolve: v.firstSolve,
          }))
          .sort((a, b) => {
            if (b.total !== a.total) return b.total - a.total;
            return new Date(a.firstSolve).getTime() - new Date(b.firstSolve).getTime();
          })
          .slice(0, 100);
        setChallengeRows(rows);
      } else {
        // Calendar-aligned cutoffs, not rolling windows:
        // "weekly" = since this Monday 00:00, "monthly" = the selected
        // calendar month (defaults to current, but monthOffset lets you
        // page back through past months).
        const cutoff = new Date();
        let upperBound: Date | null = null;
        if (tab === "weekly") {
          const day = cutoff.getDay(); // 0 = Sun, 1 = Mon, ...
          const diffToMonday = day === 0 ? 6 : day - 1;
          cutoff.setDate(cutoff.getDate() - diffToMonday);
          cutoff.setHours(0, 0, 0, 0);
        }
        if (tab === "monthly") {
          cutoff.setDate(1);
          cutoff.setHours(0, 0, 0, 0);
          cutoff.setMonth(cutoff.getMonth() + monthOffset);
          upperBound = new Date(cutoff);
          upperBound.setMonth(upperBound.getMonth() + 1);
        }

        let subsQuery = db
          .from("submissions")
          .select("github, name, points_awarded, problem_id")
          .eq("status", "approved")
          .gte("created_at", cutoff.toISOString())
          .limit(5000);
        let arenaQuery = db
          .from("arena_submissions")
          .select("github, name, points_awarded, problem_id")
          .eq("status", "reviewed")
          .gte("created_at", cutoff.toISOString())
          .limit(5000);
        let weeklySubsQuery = db
          .from("weekly_submissions")
          .select("github, name, points_awarded, problem_id")
          .eq("status", "approved")
          .gte("submitted_at", cutoff.toISOString())
          .limit(5000);
        if (upperBound) {
          subsQuery = subsQuery.lt("created_at", upperBound.toISOString());
          arenaQuery = arenaQuery.lt("created_at", upperBound.toISOString());
          weeklySubsQuery = weeklySubsQuery.lt("submitted_at", upperBound.toISOString());
        }

        const [{ data: subs }, { data: arenaSubs }, { data: weeklySubs }] =
          await Promise.all([
            subsQuery.returns<
              {
                github: string;
                name: string;
                points_awarded: number;
                problem_id: string;
              }[]
            >(),
            arenaQuery.returns<
              {
                github: string;
                name: string;
                points_awarded: number;
                problem_id: string;
              }[]
            >(),
            weeklySubsQuery.returns<
              {
                github: string;
                name: string;
                points_awarded: number;
                problem_id: string;
                }[]
              >(),
          ]);

        const map: Record<
          string,
          { github: string; name: string; total: number; problems: Set<string> }
        > = {};
        for (const s of [
          ...(subs || []),
          ...(arenaSubs || []),
          ...(weeklySubs || []),
        ]) {
          if (!map[s.github])
            map[s.github] = {
              github: s.github,
              name: s.name,
              total: 0,
              problems: new Set(),
            };
          map[s.github].total += s.points_awarded || 0;
          const pid = (s as any).problem_id || `pts_${map[s.github].total}`;
          map[s.github].problems.add(pid);
        }

        const ranked = Object.values(map)
          .sort((a, b) => b.total - a.total)
          .slice(0, 100)
          .map(
            (m) =>
              ({
                id: m.github,
                github: m.github,
                name: m.name,
                total_points: m.total,
                problems_solved: m.problems.size,
                streak: 0,
                last_solved_at: null,
                created_at: "",
              }) as EnrichedMember,
          );
        setMembers(ranked);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [tab, monthOffset]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === "overall") {
      const channel = db
        .channel("leaderboard-realtime-overall")
        .on("postgres_changes", { event: "*", schema: "public", table: "submissions" }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "weekly_submissions" }, load)
        .on("postgres_changes", { event: "*", schema: "public", table: "arena_submissions" }, load)
        .subscribe();
      return () => { db.removeChannel(channel); };
    }
    if (tab === "challenge") {
      const channel = db
        .channel("leaderboard-realtime-weekly")
        .on("postgres_changes", { event: "*", schema: "public", table: "weekly_submissions" }, load)
        .subscribe();
      return () => { db.removeChannel(channel); };
    }
  }, [tab, load]);

  const filteredMembers = search.trim()
    ? members.filter(
        (m) =>
          m.name?.toLowerCase().includes(search.toLowerCase()) ||
          m.github?.toLowerCase().includes(search.toLowerCase()),
      )
    : members;

  const filteredChallenge = search.trim()
    ? challengeRows.filter(
        (r) =>
          r.name?.toLowerCase().includes(search.toLowerCase()) ||
          r.github?.toLowerCase().includes(search.toLowerCase()),
      )
    : challengeRows;

  const tabs: { id: Tab; label: string }[] = [
    { id: "overall", label: "All Time" },
    { id: "weekly", label: "This Week" },
    {
      id: "monthly",
      label: monthOffset === 0
        ? "This Month"
        : (() => {
            const d = new Date();
            d.setDate(1);
            d.setMonth(d.getMonth() + monthOffset);
            return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
          })(),
    },
    { id: "streak", label: "🔥 Streaks" },
    { id: "challenge", label: "🏅 Weekly Challenge" },
  ];

  const rankColors = ["text-amber-400", "text-zinc-200", "text-amber-500"];
  const rankBg = [
    "bg-amber-500/10 border-amber-500/25 shadow-xs",
    "bg-zinc-800/40 border-white/[0.08] shadow-xs",
    "bg-amber-600/10 border-amber-600/25 shadow-xs",
  ];
  const medals = ["🥇", "🥈", "🥉"];

  // ── Shared row renderer ──────────────────────────────────────
  function Row({
    github,
    name,
    points,
    solved,
    i,
    isChallenge,
    streak,
    pointsLabel = "pts",
  }: {
    github: string;
    name?: string;
    points: number;
    solved: number;
    i: number;
    isChallenge?: boolean;
    streak?: number;
    pointsLabel?: string;
  }) {
    const isTop3 = i < 3 && !search;
    return (
      <div
        className={`flex items-center gap-3 md:gap-4 px-4 py-3 rounded-2xl border transition-all duration-150 backdrop-blur-xl
        ${isTop3 ? rankBg[i] : "bg-zinc-900/40 border-white/[0.06] hover:bg-zinc-900/60 hover:border-white/[0.12]"}`}
      >
        <div className="w-8 text-center shrink-0">
          {isTop3 ? (
            <span className="text-lg">{medals[i]}</span>
          ) : (
            <span className="font-mono text-xs font-semibold text-zinc-500">
              #{i + 1}
            </span>
          )}
        </div>

        <img
          src={`https://github.com/${github}.png?size=40`}
          alt={name || github}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
            (e.target as HTMLImageElement).nextElementSibling?.removeAttribute(
              "style",
            );
          }}
          className={`w-8 h-8 rounded-full object-cover shrink-0
            ${i === 0 ? "ring-2 ring-amber-500/60" : i === 1 ? "ring-2 ring-zinc-400/60" : i === 2 ? "ring-2 ring-amber-600/60" : "ring-1 ring-white/10"}`}
        />
        <div
          style={{ display: "none" }}
          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0
            ${isTop3 ? `bg-zinc-800 ${rankColors[i]}` : "bg-zinc-800 text-zinc-400"}`}
        >
          {(name || github || "?")[0].toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-mono font-semibold text-zinc-100 text-sm truncate flex items-center gap-1.5">
            {name || github}
            {!!streak && streak > 0 && (
              <span
                title={`${streak}-day streak`}
                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-1.5 py-0.5 shrink-0"
              >
                🔥{streak}
              </span>
            )}
          </div>
          <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
            <a
              href={`https://github.com/${github}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-cyan-400 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              @{github}
            </a>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden sm:flex flex-col items-center">
            <span className="font-mono font-semibold text-zinc-200 text-sm">
              {solved}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              {isChallenge ? "solved" : "solved"}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span
              className={`font-mono font-semibold text-sm ${isTop3 ? rankColors[i] : isChallenge ? "text-amber-400" : "text-zinc-200"}`}
            >
              {points.toLocaleString()}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">{pointsLabel}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display font-medium text-xl md:text-2xl mb-1 text-zinc-100 tracking-tight">
            Leaderboard
          </h1>
          <p className="text-zinc-400 text-xs font-mono">
            Rankings update automatically after each approved submission.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <ShareLBButton />

          {/* Range filter */}
          <div className="relative w-fit">
            <select
              value={tab}
              onChange={(e) => setTab(e.target.value as Tab)}
              className="appearance-none bg-zinc-900/40 backdrop-blur-md border border-white/[0.08] rounded-xl pl-3 pr-8 py-2
                text-xs font-mono font-medium text-zinc-200 hover:border-white/[0.15] focus:outline-none
                focus:border-white/[0.2] cursor-pointer transition-all duration-150 shadow-xs"
            >
              {tabs.map((t) => (
                <option key={t.id} value={t.id} className="bg-zinc-900 text-zinc-200">{t.label}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-[10px]">
              ▾
            </span>
          </div>
        </div>
      </div>

      {/* Month navigator */}
      {tab === "monthly" && (
        <div className="flex items-center justify-center gap-3 mb-5">
          <button
            onClick={() => setMonthOffset(o => o - 1)}
            className="w-7 h-7 flex items-center justify-center rounded-xl border border-white/[0.08]
              text-zinc-400 hover:text-zinc-200 hover:border-white/[0.16] transition-all text-sm font-mono bg-zinc-900/40 backdrop-blur-md shadow-xs"
            title="Previous month"
          >
            ‹
          </button>
          <span className="text-xs font-mono text-zinc-200 font-medium min-w-[9rem] text-center">
            {(() => {
              const d = new Date();
              d.setDate(1);
              d.setMonth(d.getMonth() + monthOffset);
              return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            })()}
          </span>
          <button
            onClick={() => setMonthOffset(o => Math.min(0, o + 1))}
            disabled={monthOffset >= 0}
            className="w-7 h-7 flex items-center justify-center rounded-xl border border-white/[0.08]
              text-zinc-400 hover:text-zinc-200 hover:border-white/[0.16] transition-all text-sm font-mono bg-zinc-900/40 backdrop-blur-md shadow-xs
              disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next month"
          >
            ›
          </button>
          {monthOffset !== 0 && (
            <button
              onClick={() => setMonthOffset(0)}
              className="text-[11px] font-mono text-cyan-400 hover:underline ml-1"
            >
              Jump to current
            </button>
          )}
        </div>
      )}

      {/* Weekly Challenge banner */}
      {tab === "challenge" && challengeTitle && (
        <div className="mb-5 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-2.5 shadow-xs backdrop-blur-md">
          <span className="text-lg">🏅</span>
          <div>
            <p className="text-xs font-mono font-semibold text-amber-400">
              {challengeTitle}
            </p>
            <p className="text-[11px] font-mono text-zinc-400">
              Points include time bonus — earlier submissions earn more.
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-5">
        <div className="relative w-full sm:w-72">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">
            🔍
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or username…"
            className="w-full bg-zinc-950/40 backdrop-blur-md border border-white/[0.08] rounded-xl px-3 py-2 pl-8 text-zinc-200 text-sm font-mono placeholder-zinc-500 focus:outline-none focus:border-white/[0.18] transition-colors shadow-xs"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-zinc-400 text-xs font-mono">
            Loading rankings…
          </span>
        </div>
      ) : tab === "challenge" ? (
        filteredChallenge.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="text-4xl opacity-30">🏅</div>
            <div className="text-zinc-400 font-mono text-sm">
              {search
                ? "No members match your search."
                : "No submissions yet for the current weekly challenge."}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div
              className="hidden sm:grid grid-cols-[3rem_1fr_5rem_5rem] gap-4 px-4 py-2
              text-[10px] text-zinc-500 font-mono uppercase tracking-widest border-b border-white/[0.04] mb-1"
            >
              <div>Rank</div>
              <div>Member</div>
              <div className="text-center">Solved</div>
              <div className="text-right">Points</div>
            </div>
            {filteredChallenge.map((r, i) => (
              <Row
                key={r.github}
                github={r.github}
                name={r.name}
                points={r.total}
                solved={r.solved}
                i={i}
                isChallenge
              />
            ))}
          </div>
        )
      ) : filteredMembers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="text-4xl opacity-30">{tab === "streak" ? "🔥" : "🏆"}</div>
          <div className="text-zinc-400 font-mono text-sm">
            {search
              ? "No members match your search."
              : tab === "streak"
              ? "Nobody has an active streak right now — solve today to start one!"
              : "No members yet — be the first to solve a problem!"}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div
            className="hidden sm:grid grid-cols-[3rem_1fr_5rem_5rem] gap-4 px-4 py-2
              text-[10px] text-zinc-500 font-mono uppercase tracking-widest border-b border-white/[0.04] mb-1"
          >
            <div>Rank</div>
            <div>Member</div>
            <div className="text-center">{tab === "streak" ? "Solved" : "Solved"}</div>
            <div className="text-right">{tab === "streak" ? "Streak" : "Points"}</div>
          </div>
          {filteredMembers.map((m, i) => (
            <Row
              key={m.id}
              github={m.github}
              name={m.name || m.github}
              points={tab === "streak" ? m.streak : m.total_points}
              solved={m.problems_solved}
              i={i}
              streak={tab === "streak" ? undefined : m.streak}
              pointsLabel={tab === "streak" ? (m.streak === 1 ? "day" : "days") : "pts"}
            />
          ))}
        </div>
      )}

      {tab === "streak" && !loading && filteredMembers.length > 0 && (
        <p className="text-[10px] text-zinc-500 font-mono text-center mt-6">
          Ranked by current streak. A streak lapses if a day is missed — check back tomorrow to see who's still on fire.
        </p>
      )}

      {tab !== "overall" &&
        tab !== "challenge" &&
        tab !== "streak" &&
        !loading &&
        filteredMembers.length > 0 && (
          <p className="text-[10px] text-zinc-500 font-mono text-center mt-6">
            {tab === "weekly"
              ? "Showing approved submissions since the start of this week (Monday)."
              : `Showing approved submissions for ${(() => {
                  const d = new Date();
                  d.setDate(1);
                  d.setMonth(d.getMonth() + monthOffset);
                  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
                })()}.`}
          </p>
        )}
    </div>
  );
}
