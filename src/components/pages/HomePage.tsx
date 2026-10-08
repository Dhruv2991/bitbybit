'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { User, Problem } from '@/types/database';
import { effectiveStreak } from '@/lib/streak';

import WelcomeHero from '@/components/home/WelcomeHero';
import DashboardMetrics from '@/components/home/DashboardMetrics';
import ProblemOfTheDay from '@/components/home/ProblemOfTheDay';
import ProgressOverview from '@/components/home/ProgressOverview';
import RecentActivity from '@/components/home/RecentActivity';
import LeaderboardPreview from '@/components/home/LeaderboardPreview';
import QuickActions from '@/components/home/QuickActions';
import ProShowcase from '@/components/home/ProShowcase';

interface HomePageProps {
  user: User | null;
  onNavigate: (page: any) => void;
}

export default function HomePage({ user, onNavigate }: HomePageProps) {
  const [loading, setLoading] = useState(true);

  // Announcement state
  const [announcement, setAnnouncement] = useState<string>('');
  const [dismissed, setDismissed] = useState(false);

  // User metrics
  const [problemsSolvedCount, setProblemsSolvedCount] = useState(0);
  const [totalProblemsCount, setTotalProblemsCount] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [userStreak, setUserStreak] = useState(0);

  // Problem of the Day
  const [dailyProblem, setDailyProblem] = useState<Problem | null>(null);
  const [dailySolvedToday, setDailySolvedToday] = useState(false);
  const [dailySolverCount, setDailySolverCount] = useState<number | null>(null);

  // Progress stats (Easy/Medium/Hard)
  const [difficultyStats, setDifficultyStats] = useState({
    easy: { solved: 0, total: 0 },
    medium: { solved: 0, total: 0 },
    hard: { solved: 0, total: 0 },
  });

  // Recent Activity
  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  // Leaderboard Preview
  const [topUsers, setTopUsers] = useState<any[]>([]);

  // Announcement check
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

  function handleDismissAnnouncement() {
    setDismissed(true);
    try { sessionStorage.setItem('bb_announcement_dismissed', '1'); } catch {}
  }

  // Main Dashboard Data Loader
  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    const db = getSupabaseClient();

    try {
      // 1. Fetch all public problems
      const { data: problemsData } = await db
        .from('problems')
        .select('*')
        .eq('visibility', 'public');

      const allProblems: Problem[] = (problemsData || []) as Problem[];
      const regularProblems = allProblems.filter((p) => !p.is_contest_problem);
      setTotalProblemsCount(regularProblems.length);

      // Breakdown by difficulty
      const easyTotal = regularProblems.filter((p) => p.difficulty === 'Easy').length;
      const medTotal = regularProblems.filter((p) => p.difficulty === 'Medium').length;
      const hardTotal = regularProblems.filter((p) => p.difficulty === 'Hard').length;

      // 2. Deterministic Daily Problem calculation
      if (regularProblems.length > 0) {
        const dayKey = new Date().toISOString().slice(0, 10);
        let hash = 0;
        for (let i = 0; i < dayKey.length; i++) {
          hash = (hash * 31 + dayKey.charCodeAt(i)) >>> 0;
        }
        const pickedDaily = regularProblems[hash % regularProblems.length];
        setDailyProblem(pickedDaily);

        // Daily solver count for today
        try {
          const startOfDay = new Date();
          startOfDay.setHours(0, 0, 0, 0);
          const { data: dailySubs } = await db
            .from('submissions')
            .select('github, created_at')
            .eq('problem_id', pickedDaily.id)
            .eq('status', 'approved');

          const solversToday = new Set(
            (dailySubs || [])
              .filter((s: any) => new Date(s.created_at) >= startOfDay)
              .map((s: any) => s.github)
          );
          setDailySolverCount(solversToday.size);

          if (user?.github) {
            setDailySolvedToday(solversToday.has(user.github));
          }
        } catch {}
      }

      // 3. User Solved Submissions & Points
      let solvedProblemIds = new Set<string>();
      let userPointsSum = 0;
      let userEasySolved = 0;
      let userMedSolved = 0;
      let userHardSolved = 0;
      const userActivities: any[] = [];

      if (user?.github) {
        const [{ data: normalSubs }, { data: weeklySubs }, { data: arenaSubs }, { data: memberRow }, { data: certsData }] =
          await Promise.all([
            db
              .from('submissions')
              .select('problem_id, problem_title, points_awarded, tests_passed, tests_total, created_at')
              .eq('github', user.github)
              .eq('status', 'approved')
              .order('created_at', { ascending: false }),
            (db.from('weekly_submissions') as any)
              .select('problem_id, problem_title, points_awarded, tests_passed, tests_total, submitted_at')
              .eq('github', user.github)
              .eq('status', 'approved')
              .order('submitted_at', { ascending: false }),
            (db.from('arena_submissions') as any)
              .select('problem_id, problem_title, points_awarded, tests_passed, tests_total, created_at')
              .eq('github', user.github)
              .eq('status', 'reviewed')
              .order('created_at', { ascending: false }),
            (db.from('members') as any)
              .select('streak, last_solved_at, total_points, problems_solved')
              .eq('github', user.github)
              .maybeSingle(),
            (db.from('certificates') as any)
              .select('id, title, issue_date')
              .eq('recipient_github', user.github)
              .order('issue_date', { ascending: false })
              .limit(3),
          ]);

        // Deduplicate best score per problem
        const bestScores = new Map<string, { title: string; points: number; date: string }>();
        for (const s of (normalSubs as any[] || [])) {
          solvedProblemIds.add(s.problem_id);
          const cur = bestScores.get(s.problem_id);
          if (!cur || (s.points_awarded || 0) > cur.points) {
            bestScores.set(s.problem_id, { title: s.problem_title, points: s.points_awarded || 0, date: s.created_at });
          }
          userActivities.push({
            id: s.problem_id,
            type: 'solve',
            title: s.problem_title,
            points: s.points_awarded,
            date: s.created_at,
          });
        }

        for (const w of (weeklySubs as any[] || [])) {
          solvedProblemIds.add(w.problem_id);
          const cur = bestScores.get(w.problem_id);
          if (!cur || (w.points_awarded || 0) > cur.points) {
            bestScores.set(w.problem_id, { title: w.problem_title, points: w.points_awarded || 0, date: w.submitted_at });
          }
          userActivities.push({
            id: w.problem_id,
            type: 'weekly',
            title: w.problem_title,
            points: w.points_awarded,
            date: w.submitted_at,
          });
        }

        for (const a of (arenaSubs as any[] || [])) {
          solvedProblemIds.add(a.problem_id);
          userActivities.push({
            id: a.problem_id,
            type: 'arena',
            title: a.problem_title,
            points: a.points_awarded,
            date: a.created_at,
          });
        }

        for (const c of (certsData as any[] || [])) {
          userActivities.push({
            id: c.id,
            type: 'certificate',
            title: c.title,
            date: c.issue_date,
          });
        }

        // Sort activities by date descending
        userActivities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setRecentActivities(userActivities);

        // Sum points
        userPointsSum = Array.from(bestScores.values()).reduce((sum, item) => sum + item.points, 0);
        setTotalPoints(userPointsSum);
        setProblemsSolvedCount(solvedProblemIds.size);

        // Effective streak
        if (memberRow) {
          setUserStreak(effectiveStreak(memberRow.streak, memberRow.last_solved_at));
        }

        // Breakdown solved counts by difficulty
        const problemsMap = new Map(regularProblems.map((p) => [p.id, p]));
        for (const pid of solvedProblemIds) {
          const p = problemsMap.get(pid);
          if (p?.difficulty === 'Easy') userEasySolved++;
          else if (p?.difficulty === 'Medium') userMedSolved++;
          else if (p?.difficulty === 'Hard') userHardSolved++;
        }
      }

      setDifficultyStats({
        easy: { solved: userEasySolved, total: easyTotal },
        medium: { solved: userMedSolved, total: medTotal },
        hard: { solved: userHardSolved, total: hardTotal },
      });

      // 4. Leaderboard Top 5 & User Rank
      const [{ data: normalAll }, { data: arenaAll }, { data: weeklyAll }, { data: membersAll }] =
        await Promise.all([
          db.from('submissions').select('github, name, points_awarded, problem_id').eq('status', 'approved').limit(4000),
          db.from('arena_submissions').select('github, name, points_awarded, problem_id').eq('status', 'reviewed').limit(4000),
          (db.from('weekly_submissions') as any).select('github, name, points_awarded, problem_id').eq('status', 'approved').limit(4000),
          db.from('members').select('github, name, streak, last_solved_at, problems_solved').limit(1000),
        ]);

      const bestOverall = new Map<string, { github: string; name: string; points: number }>();
      for (const s of [...(normalAll || []), ...(arenaAll || []), ...(weeklyAll || [])]) {
        const key = `${s.github}::${s.problem_id}`;
        const existing = bestOverall.get(key);
        if (!existing || (s.points_awarded || 0) > existing.points) {
          bestOverall.set(key, { github: s.github, name: s.name, points: s.points_awarded || 0 });
        }
      }

      const scoreMap: Record<string, { github: string; name: string; total: number; solved: number }> = {};
      for (const v of bestOverall.values()) {
        if (!scoreMap[v.github]) scoreMap[v.github] = { github: v.github, name: v.name, total: 0, solved: 0 };
        scoreMap[v.github].total += v.points;
        scoreMap[v.github].solved += 1;
      }

      const sortedLeaderboard = Object.values(scoreMap).sort((a, b) => b.total - a.total);

      const top5List = sortedLeaderboard.slice(0, 5).map((m, idx) => ({
        rank: idx + 1,
        github: m.github,
        name: m.name || m.github,
        points: m.total,
        solved: m.solved,
      }));

      setTopUsers(top5List);

      if (user?.github) {
        const userIndex = sortedLeaderboard.findIndex((m) => m.github === user.github);
        if (userIndex !== -1) {
          setUserRank(userIndex + 1);
        } else {
          setUserRank(null);
        }
      }
    } catch {
      // Graceful fallback for non-blocking UI
    } finally {
      setLoading(false);
    }
  }, [user?.github]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Handle direct solve from Problem of the Day
  function handleSolveDaily(problemId: string) {
    try {
      sessionStorage.setItem('bb_open_problem_id', problemId);
    } catch {}
    onNavigate('problems');
  }

  return (
    <div className="space-y-8 animate-fade-up">
      {/* 1. Welcome & Personalized Hero */}
      <WelcomeHero
        user={user}
        userStreak={userStreak}
        onNavigate={onNavigate}
        announcement={announcement}
        onDismissAnnouncement={handleDismissAnnouncement}
        dismissedAnnouncement={dismissed}
      />

      {/* 2. Top-Level Metric Cards */}
      <DashboardMetrics
        problemsSolved={problemsSolvedCount}
        totalProblems={totalProblemsCount}
        totalPoints={totalPoints}
        rank={userRank}
        streak={userStreak}
        loading={loading}
      />

      {/* 3. Problem of the Day & Personal Progress Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <ProblemOfTheDay
            problem={dailyProblem}
            solvedToday={dailySolvedToday}
            solverCount={dailySolverCount}
            loading={loading}
            onSolve={handleSolveDaily}
          />
        </div>
        <div className="lg:col-span-5">
          <ProgressOverview
            easy={difficultyStats.easy}
            medium={difficultyStats.medium}
            hard={difficultyStats.hard}
            loading={loading}
            onExplore={() => onNavigate('problems')}
          />
        </div>
      </div>

      {/* 4. BitByBit Pro Showcase & Comparison */}
      <ProShowcase
        onNavigate={onNavigate}
        isSubscriber={user?.is_subscriber}
      />

      {/* 6. Recent Activity & Leaderboard Top 5 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <RecentActivity
            activities={recentActivities}
            loading={loading}
            onExploreProblems={() => onNavigate('problems')}
          />
        </div>
        <div className="lg:col-span-5">
          <LeaderboardPreview
            topUsers={topUsers}
            currentUserGithub={user?.github}
            currentUserRank={userRank}
            loading={loading}
            onViewFullLeaderboard={() => onNavigate('leaderboard')}
          />
        </div>
      </div>

      {/* 7. Quick Action Product Tiles */}
      <QuickActions onNavigate={onNavigate} />
    </div>
  );
}
