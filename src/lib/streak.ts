// Calendar-day difference between two dates, based on local midnight
// boundaries — NOT a rolling 24-hour window. This matters: solving at
// 11pm one day and 1am the next (2 hours apart, but a new calendar
// day) must count as "the next day" for streak purposes. A naive
// `floor((a - b) / 86_400_000)` gets this wrong because it measures
// elapsed hours, not calendar days crossed.
export function calendarDaysBetween(earlier: Date, later: Date): number {
  const a = new Date(earlier); a.setHours(0, 0, 0, 0);
  const b = new Date(later);   b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// Computes the streak that should actually be *shown*, not just the
// raw number stored in the DB. The stored `streak` column only gets
// corrected the next time someone solves something (see
// syncMemberProgress in Workspace.tsx / awardPoints in AdminPage.tsx),
// so if a user misses a day and just looks at their profile, navbar
// badge, or the leaderboard in the meantime, the raw column would
// still show their old streak as if nothing happened.
//
// This makes every display of streak self-correcting: if more than a
// full calendar day has passed since the last solve, it's treated as
// 0 regardless of what's still sitting in the streak column.
export function effectiveStreak(streak: number | null | undefined, lastSolvedAt: string | null | undefined): number {
  if (!streak || !lastSolvedAt) return 0;
  const daysSinceLast = calendarDaysBetween(new Date(lastSolvedAt), new Date());
  // 0 = solved today, 1 = solved yesterday (streak still alive, just
  // hasn't been extended yet today) — anything beyond that, it's lapsed.
  return daysSinceLast > 1 ? 0 : streak;
}
