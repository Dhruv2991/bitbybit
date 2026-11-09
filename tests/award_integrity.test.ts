import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";

describe("Tenth Pass: Counter Integrity & Anti-Double-Awarding Verification", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();

    // 1. Establish baseline mock auth & tables
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY,
        raw_user_meta_data JSONB DEFAULT '{}'::jsonb
      );
      CREATE TABLE IF NOT EXISTS auth.identities (
        id TEXT PRIMARY KEY,
        user_id UUID NOT NULL,
        provider TEXT NOT NULL,
        identity_data JSONB NOT NULL DEFAULT '{}'::jsonb
      );
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
      $$;

      CREATE TABLE IF NOT EXISTS public.members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        github TEXT NOT NULL UNIQUE,
        name TEXT,
        avatar_url TEXT,
        total_points INTEGER NOT NULL DEFAULT 0,
        karma_points INTEGER NOT NULL DEFAULT 0,
        duels_won INTEGER NOT NULL DEFAULT 0,
        duels_lost INTEGER NOT NULL DEFAULT 0,
        problems_solved INTEGER NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        last_solved_at TIMESTAMPTZ,
        email TEXT,
        email_subscribed BOOLEAN DEFAULT true,
        squad_id UUID,
        badges TEXT[] DEFAULT '{}'::TEXT[],
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public.submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        problem_id TEXT NOT NULL,
        github TEXT NOT NULL,
        lang TEXT NOT NULL DEFAULT 'javascript',
        code TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        points_awarded INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public.weekly_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        problem_id TEXT NOT NULL,
        github TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        points_awarded INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public.arena_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contest_id TEXT NOT NULL,
        problem_id TEXT NOT NULL,
        github TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'submitted',
        points_awarded INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Load and execute the community features migration
    const migrationPath = path.resolve(__dirname, "../supabase/migrations/20261102_community_features.sql");
    const migrationSql = fs.readFileSync(migrationPath, "utf-8");
    await db.exec(migrationSql);

    // 3. Load and execute the new 20261109_members_lockdown.sql migration
    const lockdownPath = path.resolve(__dirname, "../supabase/migrations/20261109_members_lockdown.sql");
    const lockdownSql = fs.readFileSync(lockdownPath, "utf-8");
    await db.exec(lockdownSql);
  });

  afterAll(async () => {
    if (db) await db.close();
  });

  it("discussion upvote increments karma_points by exactly 15 and leaves total_points unchanged", async () => {
    // Seed author and voter
    await db.exec(`
      INSERT INTO public.members (github, name, total_points, karma_points)
      VALUES ('mentor_author', 'Mentor Author', 100, 0)
      ON CONFLICT (github) DO UPDATE SET total_points = 100, karma_points = 0;

      INSERT INTO public.members (github, name, total_points, karma_points)
      VALUES ('learner_voter', 'Learner Voter', 50, 0)
      ON CONFLICT (github) DO UPDATE SET total_points = 50, karma_points = 0;
    `);

    // Create discussion post
    const discRes: any = await db.query(`
      INSERT INTO public.problem_discussions (problem_id, github, author_name, title, content)
      VALUES ('two-sum', 'mentor_author', 'Mentor Author', 'Intuitive Hash Map Guide', 'Here is the O(N) approach')
      RETURNING id;
    `);
    const discId = discRes.rows[0].id;

    // Upvote the discussion
    await db.query(`
      INSERT INTO public.problem_discussion_votes (discussion_id, github)
      VALUES ($1, 'learner_voter');
    `, [discId]);

    // Check author counters
    const authorRes: any = await db.query(`
      SELECT total_points, karma_points FROM public.members WHERE github = 'mentor_author';
    `);
    const author = authorRes.rows[0];

    // Karma counter must increment by exactly 15
    expect(author.karma_points).toBe(15);
    // Total points counter MUST NOT CHANGE (karma never goes to total_points, avoiding double award)
    expect(author.total_points).toBe(100);

    // Upvotes counter on discussion post must be 1
    const postRes: any = await db.query(`
      SELECT upvotes FROM public.problem_discussions WHERE id = $1;
    `, [discId]);
    expect(postRes.rows[0].upvotes).toBe(1);
  });

  it("discussion unvote decrements karma_points by exactly 15 and leaves total_points unchanged", async () => {
    // Find the discussion created previously
    const discRes: any = await db.query(`
      SELECT id FROM public.problem_discussions WHERE github = 'mentor_author' LIMIT 1;
    `);
    const discId = discRes.rows[0].id;

    // Remove the upvote
    await db.query(`
      DELETE FROM public.problem_discussion_votes
      WHERE discussion_id = $1 AND github = 'learner_voter';
    `, [discId]);

    // Check author counters
    const authorRes: any = await db.query(`
      SELECT total_points, karma_points FROM public.members WHERE github = 'mentor_author';
    `);
    const author = authorRes.rows[0];

    // Karma counter must decrement back to 0
    expect(author.karma_points).toBe(0);
    // Total points counter remains 100
    expect(author.total_points).toBe(100);

    // Post upvotes count decrements back to 0
    const postRes: any = await db.query(`
      SELECT upvotes FROM public.problem_discussions WHERE id = $1;
    `, [discId]);
    expect(postRes.rows[0].upvotes).toBe(0);
  });

  it("one ghost win increments duels_won by 1 and total_points by 100 exactly once", async () => {
    // Seed challenger
    await db.query(`
      INSERT INTO public.members (github, name, total_points, duels_won, karma_points)
      VALUES ('ghost_duelist', 'Ghost Duelist', 250, 2, 30)
      ON CONFLICT (github) DO UPDATE SET total_points = 250, duels_won = 2, karma_points = 30;
    `);

    // Create a target ghost run
    const ghostRes: any = await db.query(`
      INSERT INTO public.ghost_runs (problem_id, problem_title, github, user_name, time_seconds)
      VALUES ('two-sum', 'Two Sum', 'benchmark_ghost', 'Benchmark', 120)
      RETURNING id;
    `);
    const ghostId = ghostRes.rows[0].id;

    // Challenger claims win via atomic claim_ghost_duel_win procedure
    const claimRes: any = await db.query(`
      SELECT public.claim_ghost_duel_win(
        $1::uuid,
        'ghost_duelist',
        'Ghost Duelist',
        'two-sum',
        'Two Sum',
        95
      ) AS result;
    `, [ghostId]);

    const claimResult = claimRes.rows[0].result;
    expect(claimResult.success).toBe(true);
    expect(claimResult.points_awarded).toBe(100);
    expect(claimResult.already_claimed).toBe(false);

    // Verify challenger counters
    const challengerRes: any = await db.query(`
      SELECT total_points, duels_won, karma_points FROM public.members WHERE github = 'ghost_duelist';
    `);
    const challenger = challengerRes.rows[0];

    // Exactly 1 win awarded: +100 total_points, +1 duels_won, 0 karma_points change
    expect(challenger.total_points).toBe(350);
    expect(challenger.duels_won).toBe(3);
    expect(challenger.karma_points).toBe(30);

    // Attempting a second claim on the SAME ghost run must NOT double award
    const dupRes: any = await db.query(`
      SELECT public.claim_ghost_duel_win(
        $1::uuid,
        'ghost_duelist',
        'Ghost Duelist',
        'two-sum',
        'Two Sum',
        90
      ) AS result;
    `, [ghostId]);

    const dupResult = dupRes.rows[0].result;
    expect(dupResult.already_claimed).toBe(true);
    expect(dupResult.points_awarded).toBe(0);

    // Challenger counters must remain untouched
    const afterDupRes: any = await db.query(`
      SELECT total_points, duels_won, karma_points FROM public.members WHERE github = 'ghost_duelist';
    `);
    const afterDup = afterDupRes.rows[0];
    expect(afterDup.total_points).toBe(350);
    expect(afterDup.duels_won).toBe(3);
  });
});
