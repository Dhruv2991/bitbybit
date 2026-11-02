// Badge definitions shared wherever achievements need to be computed/shown.
//
// Design note: most badges here are based on values that only ever grow
// (problems solved, total points, "ever solved a weekly/arena problem") —
// once earned, always earned. The two streak badges and the monthly-rank
// badge are the exception: they reflect *current* state, not a permanent
// milestone, since this app doesn't track a separate "longest streak
// ever" or "best rank ever" value. They're labeled accordingly in the UI
// so it's clear those can be lost again, unlike the rest.

export interface BadgeInput {
  problemsSolved: number;
  totalPoints:    number;
  everSolvedArena:  boolean;
  everSolvedWeekly: boolean;
  currentStreak:  number;
  monthlyRank:    number | null;
  duelsWon?:      number;
  isNightOwl?:    boolean;
  mentorUpvotes?: number;
}

export interface Badge {
  id:          string;
  icon:        string;
  label:       string;
  description: string;
  /** false = this can be lost again if the underlying stat drops (streak, rank) */
  permanent:   boolean;
  unlocked:    (s: BadgeInput) => boolean;
}

export const BADGES: Badge[] = [
  {
    id: 'first-blood', icon: '🎯', label: 'First Blood',
    description: 'Solve your first problem',
    permanent: true, unlocked: s => s.problemsSolved >= 1,
  },
  {
    id: 'warmed-up', icon: '🔥', label: 'Getting Warmed Up',
    description: 'Solve 10 problems',
    permanent: true, unlocked: s => s.problemsSolved >= 10,
  },
  {
    id: 'half-century', icon: '💪', label: 'Half Century',
    description: 'Solve 25 problems',
    permanent: true, unlocked: s => s.problemsSolved >= 25,
  },
  {
    id: 'century-club', icon: '🏔️', label: 'Century Club',
    description: 'Solve 50 problems',
    permanent: true, unlocked: s => s.problemsSolved >= 50,
  },
  {
    id: 'problem-hoarder', icon: '👑', label: 'Problem Hoarder',
    description: 'Solve 100 problems',
    permanent: true, unlocked: s => s.problemsSolved >= 100,
  },
  {
    id: 'first-thousand', icon: '💰', label: 'First 1000',
    description: 'Earn 1000 total points',
    permanent: true, unlocked: s => s.totalPoints >= 1000,
  },
  {
    id: 'point-collector', icon: '💎', label: 'Point Collector',
    description: 'Earn 10,000 total points',
    permanent: true, unlocked: s => s.totalPoints >= 10000,
  },
  {
    id: 'point-master', icon: '🏆', label: 'Point Master',
    description: 'Earn 20,000 total points',
    permanent: true, unlocked: s => s.totalPoints >= 20000,
  },
  {
    id: 'point-grandmaster', icon: '👑', label: 'Point Grandmaster',
    description: 'Earn 50,000 total points',
    permanent: true, unlocked: s => s.totalPoints >= 50000,
  },
  {
    id: 'arena-veteran', icon: '⚔️', label: 'Arena Veteran',
    description: 'Complete a proctored Arena contest problem',
    permanent: true, unlocked: s => s.everSolvedArena,
  },
  {
    id: 'weekly-warrior', icon: '📅', label: 'Weekly Warrior',
    description: 'Solve a Weekly Challenge problem',
    permanent: true, unlocked: s => s.everSolvedWeekly,
  },
  {
    id: 'on-fire', icon: '🔥', label: 'On Fire',
    description: 'Reach a 3-day streak',
    permanent: false, unlocked: s => s.currentStreak >= 3,
  },
  {
    id: 'unstoppable', icon: '⚡', label: 'Unstoppable',
    description: 'Reach a 7-day streak',
    permanent: false, unlocked: s => s.currentStreak >= 7,
  },
  {
    id: 'duelist', icon: '⚔️', label: 'Duelist',
    description: 'Win a live 1v1 Code Duel',
    permanent: true, unlocked: s => (s.duelsWon || 0) >= 1,
  },
  {
    id: 'night-owl', icon: '🦉', label: 'Night Owl',
    description: 'Solve a problem between 12:00 AM and 4:00 AM',
    permanent: true, unlocked: s => !!s.isNightOwl,
  },
  {
    id: 'top-mentor', icon: '🤝', label: 'Top Mentor',
    description: 'Earn 10+ upvotes on community explanations',
    permanent: true, unlocked: s => (s.mentorUpvotes || 0) >= 10,
  },
  {
    id: 'top-10-month', icon: '🥇', label: 'Top 10 This Month',
    description: 'Rank in the top 10 on the monthly leaderboard',
    permanent: false, unlocked: s => s.monthlyRank !== null && s.monthlyRank <= 10,
  },
];

export function computeUnlockedBadges(input: BadgeInput): Badge[] {
  return BADGES.filter(b => b.unlocked(input));
}
