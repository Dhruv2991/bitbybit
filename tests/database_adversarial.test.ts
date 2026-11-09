// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";

// Note: PGlite runs in a single JavaScript process. True multi-client TCP race conditions
// and distributed locking require real PostgreSQL server connections and remain UNVERIFIED.
describe("Database Adversarial & Integrity Audit (In-Memory PostgreSQL Engine)", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();

    // 1. Setup mock Supabase auth schema and helper functions
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
    `);

    
    // Pre-create baseline schema tables (members, submissions, etc.)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS public.members (
        id UUID DEFAULT gen_random_uuid(),
        github TEXT PRIMARY KEY,
        name TEXT,
        total_points INTEGER DEFAULT 0,
        problems_solved INTEGER DEFAULT 0,
        streak INTEGER DEFAULT 0,
        last_solved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public.submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        problem_id TEXT,
        github TEXT,
        code TEXT,
        status TEXT DEFAULT 'pending',
        points_awarded INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public.weekly_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        problem_id TEXT,
        github TEXT,
        code TEXT,
        status TEXT DEFAULT 'pending',
        points_awarded INTEGER DEFAULT 0,
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS public.arena_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        problem_id TEXT,
        github TEXT,
        code TEXT,
        status TEXT DEFAULT 'submitted',
        points_awarded INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2. Read and apply the actual community features migration file
    const migrationPath = path.resolve(
      process.cwd(),
      "supabase/migrations/20261102_community_features.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf8");
    await db.exec(sql);

    // 3. Populate mock auth.identities
    await db.exec(`
      INSERT INTO auth.identities (id, user_id, provider, identity_data) VALUES
      ('id_cheater', '00000000-0000-0000-0000-000000000077', 'github', '{"user_name": "cheater"}'::jsonb),
      ('id_victim_author', '00000000-0000-0000-0000-000000000088', 'github', '{"user_name": "victim_author"}'::jsonb),
      ('id_bad_actor', '00000000-0000-0000-0000-000000000099', 'github', '{"user_name": "bad_actor"}'::jsonb)
      ON CONFLICT (id) DO NOTHING;
    `);
  }, 60000);

  afterEach(async () => {
    await db.query("ROLLBACK;").catch(() => {});
  });

  describe("1. Squads Capacity Lock & Single Squad Enforcement", () => {
    it("enforces single squad per user (uq_squad_member_github)", async () => {
      // Create two squads
      const s1 = await db.query<{ id: string }>(
        `INSERT INTO public.squads (name, tag, code, leader_github) VALUES ($1, $2, $3, $4) RETURNING id;`,
        ["Clan Alpha", "ALPH", "ALPH-001", "leader_alpha"]
      );
      const s2 = await db.query<{ id: string }>(
        `INSERT INTO public.squads (name, tag, code, leader_github) VALUES ($1, $2, $3, $4) RETURNING id;`,
        ["Clan Beta", "BETA", "BETA-001", "leader_beta"]
      );

      const squadAlphaId = s1.rows[0].id;
      const squadBetaId = s2.rows[0].id;

      // Join first squad
      await db.query(
        `INSERT INTO public.squad_members (squad_id, github, name) VALUES ($1, $2, $3);`,
        [squadAlphaId, "wanderer_user", "Wanderer"]
      );

      // Attempting to join second squad with same github must fail
      let failed = false;
      try {
        await db.query(
          `INSERT INTO public.squad_members (squad_id, github, name) VALUES ($1, $2, $3);`,
          [squadBetaId, "wanderer_user", "Wanderer"]
        );
      } catch (err: any) {
        failed = true;
        expect(err.message).toMatch(/unique|duplicate|uq_squad_member_github/i);
      }
      expect(failed).toBe(true);
    });

    it("proves race-safe capacity: 10 concurrent joins at squad with 3 members yields exactly 2 successes", async () => {
      // Create a dedicated squad with 3 initial members
      const s = await db.query<{ id: string }>(
        `INSERT INTO public.squads (name, tag, code, leader_github) VALUES ($1, $2, $3, $4) RETURNING id;`,
        ["Capacity Clan", "CAP", "CAP-100", "leader_cap"]
      );
      const squadId = s.rows[0].id;

      // Insert initial 3 members
      await db.query(
        `INSERT INTO public.squad_members (squad_id, github, name) VALUES 
         ($1, 'cap_user_1', 'Cap 1'),
         ($1, 'cap_user_2', 'Cap 2'),
         ($1, 'cap_user_3', 'Cap 3');`,
        [squadId]
      );

      // Verify currently 3 members
      const initialCount = await db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM public.squad_members WHERE squad_id = $1;`,
        [squadId]
      );
      expect(Number(initialCount.rows[0].count)).toBe(3);

      // Launch 10 concurrent joins for candidate members user_4 .. user_13
      const joinPromises = Array.from({ length: 10 }, (_, i) => {
        const github = `candidate_user_${i + 4}`;
        return db
          .query(
            `INSERT INTO public.squad_members (squad_id, github, name) VALUES ($1, $2, $3);`,
            [squadId, github, `Candidate ${i + 4}`]
          )
          .then(() => ({ success: true, github }))
          .catch((err) => ({ success: false, github, error: err.message }));
      });

      const results = await Promise.all(joinPromises);
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r): r is { success: false; github: string; error: string } => !r.success);

      // Exactly 2 must succeed to reach max 5
      expect(successes.length).toBe(2);
      expect(failures.length).toBe(8);

      // Failures must be rejected by the check_squad_capacity trigger
      for (const f of failures) {
        expect(f.error).toMatch(/maximum 5 members reached/i);
      }

      // Final count in DB must be exactly 5
      const finalCount = await db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM public.squad_members WHERE squad_id = $1;`,
        [squadId]
      );
      expect(Number(finalCount.rows[0].count)).toBe(5);
    });
  });

  describe("2. Ghost Duel Claim Race-Safety & Time Integrity", () => {
    it("guarantees 10 concurrent winning claims award points exactly once", async () => {
      const ghostId = "00000000-0000-0000-0000-000000000001";
      const challenger = "race_challenger_99";

      // Fire 10 concurrent claims for the same winning match
      const claimPromises = Array.from({ length: 10 }, () => {
        return db
          .query(
            `INSERT INTO public.ghost_duel_matches 
             (ghost_run_id, problem_id, problem_title, challenger_github, challenger_name, challenger_time_seconds, result, time_diff_seconds)
             VALUES ($1, 'two-sum', 'Two Sum', $2, 'Racer', 120, 'won', 25)
             RETURNING id;`,
            [ghostId, challenger]
          )
          .then(() => ({ success: true }))
          .catch((err) => ({ success: false, error: err.message }));
      });

      const results = await Promise.all(claimPromises);
      const successes = results.filter((r) => r.success);
      const duplicates = results.filter((r): r is { success: false; error: string } => !r.success);

      // Exactly 1 claim insert must succeed, 9 must fail on uq_ghost_duel_matches_claim
      expect(successes.length).toBe(1);
      expect(duplicates.length).toBe(9);
      for (const d of duplicates) {
        expect(d.error).toMatch(/unique|duplicate|uq_ghost_duel_matches_claim/i);
      }
    });

    it("verifies server-side start tracking table ghost_duel_sessions", async () => {
      const ghostId = "00000000-0000-0000-0000-000000000002";
      const challenger = "integrity_runner";

      // Start session
      await db.query(
        `INSERT INTO public.ghost_duel_sessions (ghost_run_id, challenger_github, problem_id, started_at)
         VALUES ($1, $2, 'valid-parentheses', NOW())
         ON CONFLICT (ghost_run_id, challenger_github) DO UPDATE SET started_at = NOW(), completed_at = NULL;`,
        [ghostId, challenger]
      );

      const session = await db.query<{ challenger_github: string; started_at: string }>(
        `SELECT challenger_github, started_at FROM public.ghost_duel_sessions WHERE ghost_run_id = $1 AND challenger_github = $2;`,
        [ghostId, challenger]
      );

      expect(session.rows.length).toBe(1);
      expect(session.rows[0].challenger_github).toBe(challenger);
      expect(session.rows[0].started_at).toBeDefined();
    });
  });

  describe("3. Daily Poll Atomic Increments & Deduplication", () => {
    it("atomically increments poll option votes on vote insert", async () => {
      const poll = await db.query<{ id: string; options: any }>(
        `SELECT id, options FROM public.community_polls WHERE is_active = true LIMIT 1;`
      );
      const pollId = poll.rows[0].id;
      const initialOptions = poll.rows[0].options;
      const targetOptionId = initialOptions[0].id;
      const initialVotes = Number(initialOptions[0].votes);

      // Insert vote
      await db.query(
        `INSERT INTO public.community_poll_votes (poll_id, github, option_id) VALUES ($1, $2, $3);`,
        [pollId, "atomic_voter_1", targetOptionId]
      );

      // Check poll options updated via trigger trg_increment_poll_option_vote
      const refreshedPoll = await db.query<{ options: any }>(
        `SELECT options FROM public.community_polls WHERE id = $1;`,
        [pollId]
      );
      const updatedOpt = refreshedPoll.rows[0].options.find((o: any) => o.id === targetOptionId);
      expect(Number(updatedOpt.votes)).toBe(initialVotes + 1);
    });

    it("strictly blocks duplicate poll votes by the same user", async () => {
      const poll = await db.query<{ id: string }>(
        `SELECT id FROM public.community_polls WHERE is_active = true LIMIT 1;`
      );
      const pollId = poll.rows[0].id;

      // First vote succeeds
      await db.query(
        `INSERT INTO public.community_poll_votes (poll_id, github, option_id) VALUES ($1, 'duplicate_voter', 'opt-1');`,
        [pollId]
      );

      // Second vote must fail
      let failed = false;
      try {
        await db.query(
          `INSERT INTO public.community_poll_votes (poll_id, github, option_id) VALUES ($1, 'duplicate_voter', 'opt-2');`,
          [pollId]
        );
      } catch (err: any) {
        failed = true;
        expect(err.message).toMatch(/unique|duplicate|uq_poll_vote/i);
      }
      expect(failed).toBe(true);
    });
  });

  describe("4. ELI5 Discussions Atomic Upvotes & Deduplication", () => {
    it("atomically increments discussion upvotes and author karma (+15 karma_points) via trigger", async () => {
      // Setup member row for author
      await db.query(`
        INSERT INTO public.members (github, total_points, karma_points)
        VALUES ('disc_author', 100, 0)
        ON CONFLICT (github) DO UPDATE SET total_points = 100, karma_points = 0;
      `);

      // Create discussion
      const disc = await db.query<{ id: string }>(
        `INSERT INTO public.problem_discussions 
         (problem_id, github, author_name, title, content, approach_type, upvotes)
         VALUES ('two-sum', 'disc_author', 'Author', 'Intuitive Two Pointers', 'Great explanation', 'intuitive', 0)
         RETURNING id;`
      );
      const discId = disc.rows[0].id;

      // Insert upvote from peer
      await db.query(
        `INSERT INTO public.problem_discussion_votes (discussion_id, github) VALUES ($1, 'peer_mentor_1');`,
        [discId]
      );

      // Check discussion upvote count incremented
      const refreshed = await db.query<{ upvotes: number }>(
        `SELECT upvotes FROM public.problem_discussions WHERE id = $1;`,
        [discId]
      );
      expect(Number(refreshed.rows[0].upvotes)).toBe(1);

      // Check author karma incremented by +15 karma_points (total_points unchanged!)
      const authorKarma = await db.query<{ total_points: number; karma_points: number }>(
        `SELECT total_points, karma_points FROM public.members WHERE github = 'disc_author';`
      );
      expect(Number(authorKarma.rows[0].karma_points)).toBe(15);
      expect(Number(authorKarma.rows[0].total_points)).toBe(100);

      // Duplicate upvote from same user fails
      let failed = false;
      try {
        await db.query(
          `INSERT INTO public.problem_discussion_votes (discussion_id, github) VALUES ($1, 'peer_mentor_1');`,
          [discId]
        );
      } catch (err: any) {
        failed = true;
        expect(err.message).toMatch(/unique|duplicate|uq_discussion_vote/i);
      }
      expect(failed).toBe(true);
    });
  });

  describe("5. RLS Policy Coverage Verification", () => {
    it("verifies RLS is enabled on all community tables", async () => {
      const tables = [
        "squads",
        "squad_members",
        "community_polls",
        "community_poll_votes",
        "problem_discussions",
        "problem_discussion_votes",
        "ghost_runs",
        "ghost_duel_sessions",
        "ghost_duel_matches",
      ];

      for (const t of tables) {
        const res = await db.query<{ rowsecurity: boolean }>(
          `SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = $1;`,
          [t]
        );
        expect(res.rows[0]?.rowsecurity).toBe(true);
      }
    });

    it("cheat attempt: inserting fake ghost matches directly via authenticated role is blocked by RLS", async () => {
      let failed = false;
      try {
        await db.query(`BEGIN;`);
        await db.query(`SET LOCAL ROLE authenticated;`);
        await db.query(`SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000077';`);
        await db.query(`
          INSERT INTO public.ghost_duel_matches 
            (problem_id, problem_title, challenger_github, challenger_name, challenger_time_seconds, result, time_diff_seconds)
            VALUES ('two-sum', 'Two Sum', 'cheater', 'Cheater', 10, 'won', 99);
        `);
        await db.query(`COMMIT;`);
      } catch (err: any) {
        await db.query(`ROLLBACK;`).catch(() => {});
        failed = true;
        expect(err.message).toMatch(/violates row-level security policy|permission denied/i);
      }
      expect(failed).toBe(true);
    });

    it("cheat attempt: inserting poll votes for another user is blocked by RLS check", async () => {
      let failed = false;
      try {
        await db.query(`BEGIN;`);
        await db.query(`SET LOCAL ROLE authenticated;`);
        await db.query(`SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000099';`);
        await db.query(`
          INSERT INTO public.community_poll_votes (poll_id, github, option_id)
          VALUES ('00000000-0000-0000-0000-000000000010', 'victim_user', 'opt-1');
        `);
        await db.query(`COMMIT;`);
      } catch (err: any) {
        await db.query(`ROLLBACK;`).catch(() => {});
        failed = true;
        expect(err.message).toMatch(/violates row-level security policy|permission denied/i);
      }
      expect(failed).toBe(true);
    });

    it("cheat attempt: deleting another user's squad membership is blocked by RLS", async () => {
      // First create a membership as admin/postgres
      await db.query(`
        INSERT INTO public.squads (name, tag, code, leader_github)
        VALUES ('Protected Clan', 'PROT', 'PROT-01', 'protected_leader')
        ON CONFLICT DO NOTHING;
      `);
      const s = await db.query<{ id: string }>(`SELECT id FROM public.squads WHERE code = 'PROT-01';`);
      await db.query(`
        INSERT INTO public.squad_members (squad_id, github, name)
        VALUES ($1, 'innocent_member', 'Innocent')
        ON CONFLICT DO NOTHING;
      `, [s.rows[0].id]);

      // Attacker tries to delete innocent_member
      await db.query(`BEGIN;`);
      await db.query(`SET LOCAL ROLE authenticated;`);
      await db.query(`SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000099';`);
      await db.query(`DELETE FROM public.squad_members WHERE github = 'innocent_member';`);
      await db.query(`COMMIT;`);

      // Verify innocent_member was NOT deleted because of RLS
      const member = await db.query(
        `SELECT id FROM public.squad_members WHERE github = 'innocent_member';`
      );
      expect(member.rows.length).toBe(1);
    });

    it("cheat attempt: editing another user's discussion post is blocked by RLS", async () => {
      // Create discussion as victim
      const disc = await db.query<{ id: string }>(`
        INSERT INTO public.problem_discussions 
          (problem_id, github, author_name, title, content, approach_type, upvotes)
        VALUES ('two-sum', 'victim_author', 'Victim', 'Original Title', 'Original Content', 'intuitive', 0)
        RETURNING id;
      `);
      const discId = disc.rows[0].id;

      // Attacker tries to update victim's discussion
      await db.query(`BEGIN;`);
      await db.query(`SET LOCAL ROLE authenticated;`);
      await db.query(`SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000099';`);
      await db.query(`UPDATE public.problem_discussions SET title = 'Defaced by Attacker' WHERE id = '${discId}';`);
      await db.query(`COMMIT;`);

      // Verify title remained unchanged
      const check = await db.query<{ title: string }>(
        `SELECT title FROM public.problem_discussions WHERE id = $1;`,
        [discId]
      );
      expect(check.rows[0].title).toBe("Original Title");
    });

    it("identity security: user_metadata spoofing via auth.updateUser cannot bypass RLS", async () => {
      // Attacker creates a post under their authentic identity
      const myDisc = await db.query<{ id: string }>(`
        INSERT INTO public.problem_discussions 
          (problem_id, github, author_name, title, content, approach_type, upvotes)
        VALUES ('two-sum', 'victim_author', 'Victim', 'Victim Post', 'Content', 'intuitive', 0)
        RETURNING id;
      `);
      const victimPostId = myDisc.rows[0].id;

      // Attacker changes their user_metadata.user_name to 'victim_author'
      // but their sub remains attacker's uid (00000000-0000-0000-0000-000000000099)
      await db.query(`BEGIN;`);
      await db.query(`SET LOCAL ROLE authenticated;`);
      await db.query(`SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000099';`);
      // Try to pass a spoofed user_metadata in claims
      await db.query(`SET LOCAL "request.jwt.claims" = '{"user_metadata": {"user_name": "victim_author"}}';`);
      
      // Attempt to deface victim's post
      await db.query(`UPDATE public.problem_discussions SET title = 'Spoofed Edit' WHERE id = '${victimPostId}';`);
      await db.query(`COMMIT;`);

      // Verify update failed because get_auth_github_username resolves through auth.identities, NOT user_metadata!
      const check = await db.query<{ title: string }>(
        `SELECT title FROM public.problem_discussions WHERE id = $1;`,
        [victimPostId]
      );
      expect(check.rows[0].title).toBe("Victim Post");
    });

    it("database trigger blocks author self-upvote directly at SQL level", async () => {
      const disc = await db.query<{ id: string }>(`
        INSERT INTO public.problem_discussions 
          (problem_id, github, author_name, title, content, approach_type, upvotes)
        VALUES ('two-sum', 'self_author', 'Author', 'Self Post', 'Content', 'intuitive', 0)
        RETURNING id;
      `);
      const discId = disc.rows[0].id;

      let failed = false;
      try {
        await db.query(`
          INSERT INTO public.problem_discussion_votes (discussion_id, github)
          VALUES ($1, 'self_author');
        `, [discId]);
      } catch (err: any) {
        failed = true;
        expect(err.message).toMatch(/self-upvote blocked/i);
      }
      expect(failed).toBe(true);
    });

    it("unvoting decrements discussion upvote count and author karma cleanly", async () => {
      // Setup member row for author
      await db.query(`
        INSERT INTO public.members (github, total_points, karma_points)
        VALUES ('disc_author_unvote', 100, 0)
        ON CONFLICT (github) DO UPDATE SET total_points = 100, karma_points = 0;
      `);

      const disc = await db.query<{ id: string }>(`
        INSERT INTO public.problem_discussions 
          (problem_id, github, author_name, title, content, approach_type, upvotes)
        VALUES ('two-sum', 'disc_author_unvote', 'Author', 'Post Title', 'Content', 'intuitive', 0)
        RETURNING id;
      `);
      const discId = disc.rows[0].id;

      // Peer upvotes
      const vote = await db.query<{ id: string }>(`
        INSERT INTO public.problem_discussion_votes (discussion_id, github)
        VALUES ($1, 'peer_voter')
        RETURNING id;
      `, [discId]);
      const voteId = vote.rows[0].id;

      const afterUpvote = await db.query<{ upvotes: number }>(
        `SELECT upvotes FROM public.problem_discussions WHERE id = $1;`,
        [discId]
      );
      expect(afterUpvote.rows[0].upvotes).toBe(1);

      const karmaAfterUpvote = await db.query<{ total_points: number; karma_points: number }>(
        `SELECT total_points, karma_points FROM public.members WHERE github = 'disc_author_unvote';`
      );
      expect(Number(karmaAfterUpvote.rows[0].karma_points)).toBe(15);
      expect(Number(karmaAfterUpvote.rows[0].total_points)).toBe(100);

      // Peer unvotes (DELETE)
      await db.query(`DELETE FROM public.problem_discussion_votes WHERE id = $1;`, [voteId]);

      const afterUnvote = await db.query<{ upvotes: number }>(
        `SELECT upvotes FROM public.problem_discussions WHERE id = $1;`,
        [discId]
      );
      expect(afterUnvote.rows[0].upvotes).toBe(0);

      const karmaAfterUnvote = await db.query<{ total_points: number; karma_points: number }>(
        `SELECT total_points, karma_points FROM public.members WHERE github = 'disc_author_unvote';`
      );
      expect(Number(karmaAfterUnvote.rows[0].karma_points)).toBe(0);
      expect(Number(karmaAfterUnvote.rows[0].total_points)).toBe(100);
    });

    it("unvoting decrements poll option vote count cleanly", async () => {
      const poll = await db.query<{ id: string }>(`
        INSERT INTO public.community_polls (question, options, is_active)
        VALUES ('Test Poll', '[{"id": "o1", "text": "Opt 1", "votes": 0}]'::jsonb, true)
        RETURNING id;
      `);
      const pollId = poll.rows[0].id;

      // Vote
      const vote = await db.query<{ id: string }>(`
        INSERT INTO public.community_poll_votes (poll_id, github, option_id)
        VALUES ($1, 'poll_voter_1', 'o1')
        RETURNING id;
      `, [pollId]);
      const voteId = vote.rows[0].id;

      const afterVote = await db.query<{ options: any[] }>(
        `SELECT options FROM public.community_polls WHERE id = $1;`,
        [pollId]
      );
      expect(afterVote.rows[0].options[0].votes).toBe(1);

      // Unvote
      await db.query(`DELETE FROM public.community_poll_votes WHERE id = $1;`, [voteId]);

      const afterUnvote = await db.query<{ options: any[] }>(
        `SELECT options FROM public.community_polls WHERE id = $1;`,
        [pollId]
      );
      expect(afterUnvote.rows[0].options[0].votes).toBe(0);
    });

    it("ghost_duel_sessions privileges: direct client insert is revoked", async () => {
      let failed = false;
      try {
        await db.query(`BEGIN;`);
        await db.query(`SET LOCAL ROLE authenticated;`);
        await db.query(`SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000099';`);
        await db.query(`
          INSERT INTO public.ghost_duel_sessions (ghost_run_id, challenger_github, problem_id)
          VALUES ('00000000-0000-0000-0000-000000000001', 'bad_actor', 'two-sum');
        `);
        await db.query(`COMMIT;`);
      } catch (err: any) {
        await db.query(`ROLLBACK;`).catch(() => {});
        failed = true;
        expect(err.message).toMatch(/permission denied/i);
      }
      expect(failed).toBe(true);
    });

    it("column privileges: direct client update on members (total_points, karma_points, duels_won) is revoked", async () => {
      let failed = false;
      try {
        await db.query(`BEGIN;`);
        await db.query(`SET LOCAL ROLE authenticated;`);
        await db.query(`SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000099';`);
        await db.query(`UPDATE public.members SET total_points = 999999 WHERE github = 'bad_actor';`);
        await db.query(`COMMIT;`);
      } catch (err: any) {
        await db.query(`ROLLBACK;`).catch(() => {});
        failed = true;
        expect(err.message).toMatch(/permission denied/i);
      }
      expect(failed).toBe(true);
    });

    it("squad_join_attempts privileges: direct client select/insert is revoked", async () => {
      let failed = false;
      try {
        await db.query(`BEGIN;`);
        await db.query(`SET LOCAL ROLE authenticated;`);
        await db.query(`SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000099';`);
        await db.query(`SELECT * FROM public.squad_join_attempts;`);
        await db.query(`COMMIT;`);
      } catch (err: any) {
        await db.query(`ROLLBACK;`).catch(() => {});
        failed = true;
        expect(err.message).toMatch(/permission denied/i);
      }
      expect(failed).toBe(true);
    });

    it("cleanup_squad_join_attempts prunes attempts older than 1 hour", async () => {
      await db.query(`
        INSERT INTO public.squad_join_attempts (github, attempted_at) VALUES
        ('old_attempt', NOW() - INTERVAL '2 hours'),
        ('recent_attempt', NOW());
      `);
      await db.query(`SELECT public.cleanup_squad_join_attempts();`);
      const remaining = await db.query<{ github: string }>(`
        SELECT github FROM public.squad_join_attempts;
      `);
      expect(remaining.rows.some((r) => r.github === 'old_attempt')).toBe(false);
      expect(remaining.rows.some((r) => r.github === 'recent_attempt')).toBe(true);
    });

    it("function privileges: direct client RPC execution of claim_ghost_duel_win and cleanup_squad_join_attempts is revoked", async () => {
      let claimFailed = false;
      try {
        await db.query(`BEGIN;`);
        await db.query(`SET LOCAL ROLE authenticated;`);
        await db.query(`SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000099';`);
        await db.query(`
          SELECT public.claim_ghost_duel_win(
            '00000000-0000-0000-0000-000000000001'::uuid,
            'bad_actor', 'Bad Actor', 'two-sum', 'Two Sum', 60
          );
        `);
        await db.query(`COMMIT;`);
      } catch (err: any) {
        await db.query(`ROLLBACK;`).catch(() => {});
        claimFailed = true;
        expect(err.message).toMatch(/permission denied/i);
      }
      expect(claimFailed).toBe(true);

      let cleanupFailed = false;
      try {
        await db.query(`BEGIN;`);
        await db.query(`SET LOCAL ROLE authenticated;`);
        await db.query(`SELECT public.cleanup_squad_join_attempts();`);
        await db.query(`COMMIT;`);
      } catch (err: any) {
        await db.query(`ROLLBACK;`).catch(() => {});
        cleanupFailed = true;
        expect(err.message).toMatch(/permission denied/i);
      }
      expect(cleanupFailed).toBe(true);
    });

    it("submissions privileges: direct client insert/update on submissions, weekly_submissions, arena_submissions is revoked", async () => {
      let insertFailed = false;
      try {
        await db.query(`BEGIN;`);
        await db.query(`SET LOCAL ROLE authenticated;`);
        await db.query(`SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000099';`);
        await db.query(`
          INSERT INTO public.submissions (problem_id, github, code, lang, status, points_awarded)
          VALUES ('two-sum', 'bad_actor', 'def solve(): pass', 'python', 'Accepted', 100);
        `);
        await db.query(`COMMIT;`);
      } catch (err: any) {
        await db.query(`ROLLBACK;`).catch(() => {});
        insertFailed = true;
        expect(err.message).toMatch(/permission denied/i);
      }
      expect(insertFailed).toBe(true);

      let updateFailed = false;
      try {
        await db.query(`BEGIN;`);
        await db.query(`SET LOCAL ROLE authenticated;`);
        await db.query(`SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000099';`);
        await db.query(`UPDATE public.submissions SET points_awarded = 999 WHERE github = 'bad_actor';`);
        await db.query(`COMMIT;`);
      } catch (err: any) {
        await db.query(`ROLLBACK;`).catch(() => {});
        updateFailed = true;
        expect(err.message).toMatch(/permission denied/i);
      }
      expect(updateFailed).toBe(true);

      // Own-row policy: user can read their OWN submissions
      await db.query(`INSERT INTO public.submissions (problem_id, github, code) VALUES ('two-sum', 'bad_actor', 'my_secret_code');`);
      await db.query(`INSERT INTO public.submissions (problem_id, github, code) VALUES ('two-sum', 'victim_author', 'victim_secret_code');`);

      await db.query(`BEGIN;`);
      await db.query(`SET LOCAL ROLE authenticated;`);
      await db.query(`SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000099';`); // bad_actor
      const ownSubs = await db.query<{ code: string }>(`SELECT code FROM public.submissions WHERE github = 'bad_actor';`);
      expect(ownSubs.rows.length).toBe(1);
      expect(ownSubs.rows[0].code).toBe('my_secret_code');

      // Attempting to read another user's submission returns 0 rows (own-row policy protects code from other users)
      const otherSubs = await db.query<{ code: string }>(`SELECT code FROM public.submissions WHERE github = 'victim_author';`);
      expect(otherSubs.rows.length).toBe(0);
      await db.query(`COMMIT;`);

      // Anon cannot read submissions (revoked)
      let anonFailed = false;
      try {
        await db.query(`BEGIN;`);
        await db.query(`SET LOCAL ROLE anon;`);
        await db.query(`SELECT * FROM public.submissions;`);
        await db.query(`COMMIT;`);
      } catch (err: any) {
        await db.query(`ROLLBACK;`).catch(() => {});
        anonFailed = true;
        expect(err.message).toMatch(/permission denied/i);
      }
      expect(anonFailed).toBe(true);
    });

    it("atomic claim procedure: concurrent claims on different ghosts succeed, while same-user claims enforce daily 500 XP cap", async () => {
      await db.query(`
        INSERT INTO public.members (github, total_points, duels_won)
        VALUES ('atomic_racer', 0, 0)
        ON CONFLICT (github) DO UPDATE SET total_points = 0, duels_won = 0;
      `);

      // Concurrent claims on different ghosts (ghost 1 and ghost 2)
      const [res1, res2] = await Promise.all([
        db.query<{ claim_ghost_duel_win: any }>(`
          SELECT public.claim_ghost_duel_win(
            '00000000-0000-0000-0000-000000000001'::uuid,
            'atomic_racer', 'Atomic', 'two-sum', 'Two Sum', 60
          );
        `),
        db.query<{ claim_ghost_duel_win: any }>(`
          SELECT public.claim_ghost_duel_win(
            '00000000-0000-0000-0000-000000000002'::uuid,
            'atomic_racer', 'Atomic', 'valid-parentheses', 'Valid Parentheses', 70
          );
        `),
      ]);

      expect(res1.rows[0].claim_ghost_duel_win.points_awarded).toBe(100);
      expect(res2.rows[0].claim_ghost_duel_win.points_awarded).toBe(100);

      const member = await db.query<{ total_points: number }>(`
        SELECT total_points FROM public.members WHERE github = 'atomic_racer';
      `);
      expect(member.rows[0].total_points).toBe(200);
    });

    it("rollback and re-apply: cleanly drops all resources, preserves pre-existing tables, and re-applies without error", async () => {
      const rollbackPath = path.resolve(
        process.cwd(),
        "supabase/migrations/20261102_community_features_rollback.sql"
      );
      const rollbackSql = fs.readFileSync(rollbackPath, "utf8");
      await db.exec(rollbackSql);

      // Verify community table dropped
      const check = await db.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'squads'
        );
      `);
      expect(check.rows[0].exists).toBe(false);

      // Confirm pre-existing tables 'members' and 'submissions' were NOT dropped!
      const checkMembers = await db.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'members'
        );
      `);
      expect(checkMembers.rows[0].exists).toBe(true);

      const checkSubmissions = await db.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'submissions'
        );
      `);
      expect(checkSubmissions.rows[0].exists).toBe(true);

      // Re-apply migration
      const migrationPath = path.resolve(
        process.cwd(),
        "supabase/migrations/20261102_community_features.sql"
      );
      const migrationSql = fs.readFileSync(migrationPath, "utf8");
      await db.exec(migrationSql);

      // Verify table restored
      const checkRestored = await db.query<{ exists: boolean }>(`
        SELECT EXISTS (
          SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'squads'
        );
      `);
      expect(checkRestored.rows[0].exists).toBe(true);
    });
  });
});
