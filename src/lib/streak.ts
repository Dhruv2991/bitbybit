// Computes the streak that should actually be *shown*, not just the
// raw number stored in the DB. The stored `streak` column only gets
// corrected the next time someone solves something (see
// syncMemberProgress in Workspace.tsx / awardPoints in AdminPage.tsx),
// so if a user misses a day and just looks at their profile, navbar
// badge, or the leaderboard in the meantime, the raw column would
// still show their old streak as if nothing happened.
//
// This makes every display of streak self-correcting: if more than a
// full day has passed since the last solve, it's treated as 0
// regardless of what's still sitting in the streak column.
export function effectiveStreak(streak: number | null | undefined, lastSolvedAt: string | null | undefined): number {
  if (!streak || !lastSolvedAt) return 0;
  const daysSinceLast = Math.floor((Date.now() - new Date(lastSolvedAt).getTime()) / 86_400_000);
  // 0 = solved today, 1 = solved yesterday (streak still alive, just
  // hasn't been extended yet today) — anything beyond that, it's lapsed.
  return daysSinceLast > 1 ? 0 : streak;
}
