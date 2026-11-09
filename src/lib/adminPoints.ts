function calendarDaysBetween(d1: Date, d2: Date) {
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.floor(Math.abs(utc2 - utc1) / (1000 * 60 * 60 * 24));
}

export async function internalAwardPoints(
  db: any,
  github: string,
  points: number,
  isContest = false,
  contestId?: string,
  countAsSolved = true
) {
  const cleanGithub = github?.trim();
  if (!cleanGithub) return;

  let effectivePoints = points;
  if (isContest && contestId) {
    const { data: contest } = await (db.from("contests") as any)
      .select("leaderboard_discount")
      .eq("id", contestId)
      .maybeSingle();
    const discount = contest?.leaderboard_discount ?? 0;
    if (discount > 0) {
      const { data: memberCheck } = await (db.from("members") as any)
        .select("total_points")
        .eq("github", cleanGithub)
        .maybeSingle();
      if (memberCheck && (memberCheck.total_points || 0) > 0) {
        effectivePoints = Math.floor(points * (1 - discount / 100));
      }
    }
  }

  const now = new Date();
  const { data: ex } = await (db.from("members") as any)
    .select("*")
    .eq("github", cleanGithub)
    .maybeSingle();

  if (ex) {
    const last = ex.last_solved_at ? new Date(ex.last_solved_at) : null;
    const daysSinceLast = last ? calendarDaysBetween(last, now) : 999;
    const newStreak = countAsSolved
      ? daysSinceLast === 0
        ? ex.streak || 1
        : daysSinceLast === 1
          ? (ex.streak || 0) + 1
          : 1
      : ex.streak || 0;

    await (db.from("members") as any)
      .update({
        total_points: Math.max(0, (ex.total_points || 0) + effectivePoints),
        problems_solved: (ex.problems_solved || 0) + (countAsSolved ? 1 : 0),
        streak: newStreak,
        last_solved_at: countAsSolved ? now.toISOString() : ex.last_solved_at,
        updated_at: now.toISOString(),
      })
      .eq("github", cleanGithub);
  } else {
    await (db.from("members") as any).insert([
      {
        github: cleanGithub,
        name: cleanGithub,
        total_points: effectivePoints,
        problems_solved: countAsSolved ? 1 : 0,
        streak: countAsSolved ? 1 : 0,
        last_solved_at: countAsSolved ? now.toISOString() : null,
      },
    ]);
  }
}

