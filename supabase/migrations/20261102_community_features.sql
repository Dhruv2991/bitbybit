-- ════════════════════════════════════════════════════════════
-- Supabase Migration: BitByBit Community Features
-- 1. Squads / Guilds / Clans (3-5 members)
-- 2. Daily Community Polls & Questions
-- 3. Problem Discussions & Intuitions ("ELI5")
-- 4. Ghost Duels & Asynchronous Battles
-- 5. Atomic Concurrency Controls & Row-Level Security (RLS)
-- ════════════════════════════════════════════════════════════

-- 1. SQUADS / CLANS TABLE
CREATE TABLE IF NOT EXISTS public.squads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  tag TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  leader_github TEXT NOT NULL,
  total_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_squads_code ON public.squads(code);
CREATE INDEX IF NOT EXISTS idx_squads_points ON public.squads(total_points DESC);

-- SQUAD MEMBERS (A user can be in ONLY ONE squad: enforced by UNIQUE(lower(github)))
CREATE TABLE IF NOT EXISTS public.squad_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id UUID NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  github TEXT NOT NULL,
  name TEXT NOT NULL,
  points_contributed INTEGER NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_squad_member_github ON public.squad_members (lower(github));
CREATE INDEX IF NOT EXISTS idx_squad_members_squad ON public.squad_members(squad_id);
CREATE INDEX IF NOT EXISTS idx_squad_members_github ON public.squad_members(lower(github));

-- SQUAD JOIN ATTEMPTS (Persistent Rate Limiting: 5 attempts per minute per user)
CREATE TABLE IF NOT EXISTS public.squad_join_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_squad_join_attempts ON public.squad_join_attempts (lower(github), attempted_at DESC);

-- Enforce atomic, race-safe max 5 members per squad with row-level lock on the parent squad
CREATE OR REPLACE FUNCTION check_squad_capacity()
RETURNS TRIGGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- 1. Lock the parent squad row for update to serialize concurrent joins
  PERFORM 1 FROM public.squads WHERE id = NEW.squad_id FOR UPDATE;

  -- 2. Count current members atomically
  SELECT COUNT(*) INTO v_count
  FROM public.squad_members
  WHERE squad_id = NEW.squad_id;

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'Squad is full (maximum 5 members reached)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_check_squad_capacity ON public.squad_members;
CREATE TRIGGER trg_check_squad_capacity
BEFORE INSERT ON public.squad_members
FOR EACH ROW EXECUTE FUNCTION check_squad_capacity();

-- 2. DAILY COMMUNITY POLLS
CREATE TABLE IF NOT EXISTS public.community_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of { id: string, text: string, votes: number }
  created_by TEXT,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_polls_active ON public.community_polls(is_active, created_at DESC);

-- POLL VOTES (Strict: 1 vote per user per poll, case-insensitive)
CREATE TABLE IF NOT EXISTS public.community_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.community_polls(id) ON DELETE CASCADE,
  github TEXT NOT NULL,
  option_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_poll_vote ON public.community_poll_votes (poll_id, lower(github));
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON public.community_poll_votes(poll_id);

-- Atomic Poll Option Vote Increment Trigger
CREATE OR REPLACE FUNCTION trg_on_poll_vote_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM 1 FROM public.community_polls WHERE id = NEW.poll_id FOR UPDATE;

  UPDATE public.community_polls
  SET options = (
    SELECT jsonb_agg(
      CASE 
        WHEN elem->>'id' = NEW.option_id 
        THEN jsonb_set(elem, '{votes}', to_jsonb(COALESCE((elem->>'votes')::int, 0) + 1))
        ELSE elem
      END
    )
    FROM jsonb_array_elements(options) AS elem
  )
  WHERE id = NEW.poll_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_increment_poll_option_vote ON public.community_poll_votes;
CREATE TRIGGER trg_increment_poll_option_vote
AFTER INSERT ON public.community_poll_votes
FOR EACH ROW EXECUTE FUNCTION trg_on_poll_vote_insert();

-- Atomic Poll Option Vote Decrement Trigger (Unvoting / Vote Removal)
CREATE OR REPLACE FUNCTION trg_on_poll_vote_delete()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM 1 FROM public.community_polls WHERE id = OLD.poll_id FOR UPDATE;

  UPDATE public.community_polls
  SET options = (
    SELECT jsonb_agg(
      CASE 
        WHEN elem->>'id' = OLD.option_id 
        THEN jsonb_set(elem, '{votes}', to_jsonb(GREATEST(0, COALESCE((elem->>'votes')::int, 0) - 1)))
        ELSE elem
      END
    )
    FROM jsonb_array_elements(options) AS elem
  )
  WHERE id = OLD.poll_id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_decrement_poll_option_vote ON public.community_poll_votes;
CREATE TRIGGER trg_decrement_poll_option_vote
AFTER DELETE ON public.community_poll_votes
FOR EACH ROW EXECUTE FUNCTION trg_on_poll_vote_delete();

-- 3. PROBLEM DISCUSSIONS ("Explain Like I'm 5")
CREATE TABLE IF NOT EXISTS public.problem_discussions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id TEXT NOT NULL,
  github TEXT NOT NULL,
  author_name TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  approach_type TEXT NOT NULL DEFAULT 'intuitive', -- 'intuitive' | 'brute_force' | 'optimized' | 'one_liner'
  upvotes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discussions_problem ON public.problem_discussions(problem_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discussions_author ON public.problem_discussions(github);

-- DISCUSSION UPVOTES (Strict: 1 upvote per user per discussion post, case-insensitive)
CREATE TABLE IF NOT EXISTS public.problem_discussion_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id UUID NOT NULL REFERENCES public.problem_discussions(id) ON DELETE CASCADE,
  github TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_discussion_vote ON public.problem_discussion_votes (discussion_id, lower(github));
CREATE INDEX IF NOT EXISTS idx_discussion_votes_disc ON public.problem_discussion_votes(discussion_id);

-- Prevent self-upvote at database trigger level (case-insensitive)
CREATE OR REPLACE FUNCTION trg_check_no_self_upvote()
RETURNS TRIGGER AS $$
DECLARE
  v_author_github TEXT;
BEGIN
  SELECT github INTO v_author_github
  FROM public.problem_discussions
  WHERE id = NEW.discussion_id;

  IF v_author_github IS NOT NULL AND lower(v_author_github) = lower(NEW.github) THEN
    RAISE EXCEPTION 'Authors cannot upvote their own discussions (self-upvote blocked).';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_self_upvote ON public.problem_discussion_votes;
CREATE TRIGGER trg_prevent_self_upvote
BEFORE INSERT ON public.problem_discussion_votes
FOR EACH ROW EXECUTE FUNCTION trg_check_no_self_upvote();

-- Ensure all columns required by community features exist on pre-existing members table
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS karma_points INTEGER DEFAULT 0;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS duels_won INTEGER DEFAULT 0;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS total_points INTEGER DEFAULT 0;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS problems_solved INTEGER DEFAULT 0;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS last_solved_at TIMESTAMPTZ;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS email_subscribed BOOLEAN DEFAULT true;

-- Atomic Discussion Upvote & Mentor Karma Increment Trigger
CREATE OR REPLACE FUNCTION trg_on_discussion_vote_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_author_github TEXT;
BEGIN
  -- 1. Increment discussion upvotes count
  UPDATE public.problem_discussions
  SET upvotes = upvotes + 1
  WHERE id = NEW.discussion_id
  RETURNING github INTO v_author_github;

  -- 2. Atomically increment author mentor karma in members table (+15 karma_points)
  IF v_author_github IS NOT NULL THEN
    UPDATE public.members
    SET karma_points = COALESCE(karma_points, 0) + 15
    WHERE lower(github) = lower(v_author_github);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_increment_discussion_upvotes ON public.problem_discussion_votes;
CREATE TRIGGER trg_increment_discussion_upvotes
AFTER INSERT ON public.problem_discussion_votes
FOR EACH ROW EXECUTE FUNCTION trg_on_discussion_vote_insert();

-- Atomic Discussion Upvote & Mentor Karma Decrement Trigger (Unvoting)
CREATE OR REPLACE FUNCTION trg_on_discussion_vote_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_author_github TEXT;
BEGIN
  -- 1. Decrement discussion upvotes count
  UPDATE public.problem_discussions
  SET upvotes = GREATEST(0, upvotes - 1)
  WHERE id = OLD.discussion_id
  RETURNING github INTO v_author_github;

  -- 2. Atomically decrement author mentor karma in members table (-15 karma_points)
  IF v_author_github IS NOT NULL THEN
    UPDATE public.members
    SET karma_points = GREATEST(0, COALESCE(karma_points, 0) - 15)
    WHERE lower(github) = lower(v_author_github);
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_decrement_discussion_upvotes ON public.problem_discussion_votes;
CREATE TRIGGER trg_decrement_discussion_upvotes
AFTER DELETE ON public.problem_discussion_votes
FOR EACH ROW EXECUTE FUNCTION trg_on_discussion_vote_delete();

-- 4. GHOST RUNS (Recorded runs for Asynchronous 1v1 Battles)
CREATE TABLE IF NOT EXISTS public.ghost_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id TEXT NOT NULL,
  problem_title TEXT NOT NULL,
  github TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  time_seconds INTEGER NOT NULL, -- Time taken to pass all tests in seconds (e.g. 165s = 2m 45s)
  language TEXT NOT NULL DEFAULT 'javascript',
  code_length INTEGER NOT NULL DEFAULT 0,
  checkpoints JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of { at: number, label: string }
  is_verified BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ghost_runs_problem ON public.ghost_runs(problem_id, time_seconds ASC);
CREATE INDEX IF NOT EXISTS idx_ghost_runs_github ON public.ghost_runs(github);

-- 5. GHOST DUEL SESSIONS (Server-side race start tracking for time integrity)
CREATE TABLE IF NOT EXISTS public.ghost_duel_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ghost_run_id UUID NOT NULL REFERENCES public.ghost_runs(id) ON DELETE CASCADE,
  challenger_github TEXT NOT NULL,
  problem_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  solved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT uq_ghost_duel_session UNIQUE (ghost_run_id, challenger_github)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ghost_duel_session_case ON public.ghost_duel_sessions (ghost_run_id, lower(challenger_github));
CREATE INDEX IF NOT EXISTS idx_ghost_sessions_lookup ON public.ghost_duel_sessions(ghost_run_id, lower(challenger_github));

-- 6. GHOST DUEL MATCHES (Completed race matches against ghosts)
CREATE TABLE IF NOT EXISTS public.ghost_duel_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ghost_run_id UUID REFERENCES public.ghost_runs(id) ON DELETE SET NULL,
  problem_id TEXT NOT NULL,
  problem_title TEXT NOT NULL,
  challenger_github TEXT NOT NULL,
  challenger_name TEXT NOT NULL,
  challenger_time_seconds INTEGER NOT NULL,
  result TEXT NOT NULL, -- 'won' | 'lost'
  time_diff_seconds INTEGER NOT NULL, -- positive if user beat ghost by X seconds, negative if ghost was faster
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ghost_matches_challenger ON public.ghost_duel_matches(lower(challenger_github));
CREATE INDEX IF NOT EXISTS idx_ghost_matches_recent ON public.ghost_duel_matches(created_at DESC);

-- Atomic duplicate-claim prevention: only 1 winning match claim allowed per user per ghost (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ghost_duel_matches_claim 
ON public.ghost_duel_matches (ghost_run_id, lower(challenger_github)) 
WHERE (result = 'won');

-- ════════════════════════════════════════════════════════════
-- 7. ROW LEVEL SECURITY (RLS) POLICIES & PRIVILEGES
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
END $$;

-- Unspoofable Identity Helper (Case-Insensitive):
-- NEVER trust auth.jwt() -> 'user_metadata' because user_metadata is user-editable via auth.updateUser()!
-- Resolves strictly from auth.identities (OAuth provider claim) or app_metadata, returned in lowercase.
CREATE OR REPLACE FUNCTION public.get_auth_github_username()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT lower(COALESCE(
    (SELECT identity_data ->> 'user_name'
     FROM auth.identities
     WHERE user_id = auth.uid()
       AND provider = 'github'
     LIMIT 1),
    (SELECT (auth.jwt() -> 'app_metadata' ->> 'user_name'))
  ));
$$;

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squad_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squad_join_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problem_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problem_discussion_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghost_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghost_duel_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghost_duel_matches ENABLE ROW LEVEL SECURITY;

-- Grant client privileges on user-facing tables (controlled via RLS policies below)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squad_members TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.problem_discussions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.problem_discussion_votes TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_poll_votes TO anon, authenticated;
GRANT SELECT ON public.community_polls TO anon, authenticated;
GRANT SELECT ON public.ghost_runs TO anon, authenticated;
GRANT SELECT ON public.members TO anon, authenticated;

-- Grant column-level UPDATE ONLY on non-sensitive user profile columns
-- Users must NOT be able to update score, karma, points or duels directly
GRANT UPDATE (name, avatar_url) ON public.members TO authenticated;
REVOKE UPDATE ON public.members FROM anon;

-- Revoke all client privileges on internal rate-limiting table
REVOKE ALL ON public.squad_join_attempts FROM anon, authenticated;

-- Revoke all client table-level write privileges on server-only tables
REVOKE INSERT, UPDATE, DELETE ON public.ghost_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ghost_duel_sessions FROM anon, authenticated;
GRANT SELECT ON public.ghost_duel_sessions TO anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.ghost_duel_matches FROM anon, authenticated;
GRANT SELECT ON public.ghost_duel_matches TO anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.squads FROM anon, authenticated;
GRANT SELECT ON public.squads TO anon, authenticated;

-- MEMBERS POLICIES (Case-insensitive, score/karma/badges mutation forbidden directly)
DROP POLICY IF EXISTS "members_read_all" ON public.members;
CREATE POLICY "members_read_all" ON public.members FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "members_update_own" ON public.members;
CREATE POLICY "members_update_own" ON public.members FOR UPDATE TO authenticated
USING (lower(github) = public.get_auth_github_username())
WITH CHECK (lower(github) = public.get_auth_github_username());

-- Housekeeping: cleanup old squad join attempts
CREATE OR REPLACE FUNCTION public.cleanup_squad_join_attempts()
RETURNS void AS $$
BEGIN
  DELETE FROM public.squad_join_attempts
  WHERE attempted_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Atomic Ghost Duel Win & Daily XP Cap Lock Procedure
CREATE OR REPLACE FUNCTION public.claim_ghost_duel_win(
  p_ghost_run_id UUID,
  p_challenger_github TEXT,
  p_challenger_name TEXT,
  p_problem_id TEXT,
  p_problem_title TEXT,
  p_elapsed_seconds INT
) RETURNS JSONB AS $$
DECLARE
  v_clean_github TEXT := lower(trim(p_challenger_github));
  v_today_start TIMESTAMPTZ := date_trunc('day', NOW() AT TIME ZONE 'UTC');
  v_today_wins INT;
  v_match_id UUID;
  v_points_awarded INT := 0;
  v_squad_boost INT := 0;
  v_already_claimed BOOLEAN := false;
  v_daily_cap_reached BOOLEAN := false;
  v_squad_id UUID;
BEGIN
  -- 1. Atomic Advisory Lock per challenger serializes concurrent claims
  PERFORM pg_advisory_xact_lock(hashtext('ghost_claim_' || v_clean_github));

  -- 2. Check if already claimed a win on this ghost
  IF EXISTS (
    SELECT 1 FROM public.ghost_duel_matches
    WHERE ghost_run_id = p_ghost_run_id
      AND lower(challenger_github) = v_clean_github
      AND result = 'won'
  ) THEN
    v_already_claimed := true;
  END IF;

  -- 3. Check daily wins count today
  SELECT COUNT(*) INTO v_today_wins
  FROM public.ghost_duel_matches
  WHERE lower(challenger_github) = v_clean_github
    AND result = 'won'
    AND created_at >= v_today_start;

  IF v_today_wins >= 5 THEN
    v_daily_cap_reached := true;
  END IF;

  -- 4. Record match history row
  INSERT INTO public.ghost_duel_matches (
    ghost_run_id,
    problem_id,
    problem_title,
    challenger_github,
    challenger_name,
    challenger_time_seconds,
    result,
    time_diff_seconds
  ) VALUES (
    p_ghost_run_id,
    p_problem_id,
    p_problem_title,
    p_challenger_github,
    p_challenger_name,
    p_elapsed_seconds,
    'won',
    0
  ) RETURNING id INTO v_match_id;

  -- 5. Award points if under cap and not duplicate
  IF NOT v_already_claimed AND NOT v_daily_cap_reached THEN
    v_points_awarded := 100;
    UPDATE public.members
    SET total_points = COALESCE(total_points, 0) + 100,
        duels_won = COALESCE(duels_won, 0) + 1
    WHERE lower(github) = v_clean_github;

    -- Award squad boost (+50)
    SELECT squad_id INTO v_squad_id
    FROM public.squad_members
    WHERE lower(github) = v_clean_github
    LIMIT 1;

    IF v_squad_id IS NOT NULL THEN
      v_squad_boost := 50;
      UPDATE public.squad_members
      SET points_contributed = COALESCE(points_contributed, 0) + 50
      WHERE lower(github) = v_clean_github;

      UPDATE public.squads
      SET total_points = COALESCE(total_points, 0) + 50
      WHERE id = v_squad_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'match_id', v_match_id,
    'points_awarded', v_points_awarded,
    'squad_points_awarded', v_squad_boost,
    'already_claimed', v_already_claimed,
    'daily_cap_reached', v_daily_cap_reached
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- SQUADS POLICIES
DROP POLICY IF EXISTS "squads_read_all" ON public.squads;
CREATE POLICY "squads_read_all" ON public.squads FOR SELECT TO anon, authenticated USING (true);

-- SQUAD MEMBERS POLICIES (Case-insensitive)
DROP POLICY IF EXISTS "squad_members_read_all" ON public.squad_members;
CREATE POLICY "squad_members_read_all" ON public.squad_members FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "squad_members_delete_own" ON public.squad_members;
CREATE POLICY "squad_members_delete_own" ON public.squad_members FOR DELETE TO authenticated
USING (lower(github) = public.get_auth_github_username());

-- COMMUNITY POLLS POLICIES
DROP POLICY IF EXISTS "polls_read_all" ON public.community_polls;
CREATE POLICY "polls_read_all" ON public.community_polls FOR SELECT TO anon, authenticated USING (true);

-- COMMUNITY POLL VOTES POLICIES (Case-insensitive)
DROP POLICY IF EXISTS "poll_votes_read_all" ON public.community_poll_votes;
CREATE POLICY "poll_votes_read_all" ON public.community_poll_votes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "poll_votes_insert_own" ON public.community_poll_votes;
CREATE POLICY "poll_votes_insert_own" ON public.community_poll_votes FOR INSERT TO authenticated
WITH CHECK (lower(github) = public.get_auth_github_username());

-- PROBLEM DISCUSSIONS POLICIES (Case-insensitive)
DROP POLICY IF EXISTS "discussions_read_all" ON public.problem_discussions;
CREATE POLICY "discussions_read_all" ON public.problem_discussions FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "discussions_insert_own" ON public.problem_discussions;
CREATE POLICY "discussions_insert_own" ON public.problem_discussions FOR INSERT TO authenticated
WITH CHECK (lower(github) = public.get_auth_github_username() AND upvotes = 0);

DROP POLICY IF EXISTS "discussions_update_own" ON public.problem_discussions;
CREATE POLICY "discussions_update_own" ON public.problem_discussions FOR UPDATE TO authenticated
USING (lower(github) = public.get_auth_github_username())
WITH CHECK (lower(github) = public.get_auth_github_username());

DROP POLICY IF EXISTS "discussions_delete_own" ON public.problem_discussions;
CREATE POLICY "discussions_delete_own" ON public.problem_discussions FOR DELETE TO authenticated
USING (lower(github) = public.get_auth_github_username());

-- PROBLEM DISCUSSION VOTES POLICIES (Case-insensitive)
DROP POLICY IF EXISTS "discussion_votes_read_all" ON public.problem_discussion_votes;
CREATE POLICY "discussion_votes_read_all" ON public.problem_discussion_votes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "discussion_votes_insert_own" ON public.problem_discussion_votes;
CREATE POLICY "discussion_votes_insert_own" ON public.problem_discussion_votes FOR INSERT TO authenticated
WITH CHECK (lower(github) = public.get_auth_github_username());

DROP POLICY IF EXISTS "discussion_votes_delete_own" ON public.problem_discussion_votes;
CREATE POLICY "discussion_votes_delete_own" ON public.problem_discussion_votes FOR DELETE TO authenticated
USING (lower(github) = public.get_auth_github_username());

-- GHOST RUNS POLICIES
DROP POLICY IF EXISTS "ghost_runs_read_all" ON public.ghost_runs;
CREATE POLICY "ghost_runs_read_all" ON public.ghost_runs FOR SELECT TO anon, authenticated USING (true);

-- GHOST DUEL SESSIONS POLICIES
DROP POLICY IF EXISTS "ghost_sessions_read_all" ON public.ghost_duel_sessions;
CREATE POLICY "ghost_sessions_read_all" ON public.ghost_duel_sessions FOR SELECT TO anon, authenticated USING (true);

-- GHOST DUEL MATCHES POLICIES (Client direct INSERT forbidden; service_role server actions only)
DROP POLICY IF EXISTS "ghost_matches_read_all" ON public.ghost_duel_matches;
CREATE POLICY "ghost_matches_read_all" ON public.ghost_duel_matches FOR SELECT TO anon, authenticated USING (true);

-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- 7. FUNCTION PRIVILEGE HARDENING (Requirement 4)
-- ════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.claim_ghost_duel_win(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ghost_duel_win(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_squad_join_attempts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_squad_join_attempts() TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_squad_capacity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_squad_capacity() TO service_role;

REVOKE EXECUTE ON FUNCTION public.trg_on_poll_vote_insert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_on_poll_vote_insert() TO service_role;

REVOKE EXECUTE ON FUNCTION public.trg_on_poll_vote_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_on_poll_vote_delete() TO service_role;

REVOKE EXECUTE ON FUNCTION public.trg_check_no_self_upvote() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_check_no_self_upvote() TO service_role;

REVOKE EXECUTE ON FUNCTION public.trg_on_discussion_vote_insert() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_on_discussion_vote_insert() TO service_role;

REVOKE EXECUTE ON FUNCTION public.trg_on_discussion_vote_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_on_discussion_vote_delete() TO service_role;

-- ════════════════════════════════════════════════════════════
-- SUBMISSIONS RLS & PRIVILEGES HARDENING
-- Restricts code reads so callers can only read their own code
-- ════════════════════════════════════════════════════════════
-- Ensure columns used by execute and community features exist on pre-existing submissions tables
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS problem_id TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS problem_title TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS github TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS lang TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS approach TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS tests_passed INTEGER DEFAULT 0;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS tests_total INTEGER DEFAULT 0;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS points_awarded INTEGER DEFAULT 0;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS reject_reason TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.weekly_submissions ADD COLUMN IF NOT EXISTS weekly_challenge_id TEXT;
ALTER TABLE public.weekly_submissions ADD COLUMN IF NOT EXISTS problem_id TEXT;
ALTER TABLE public.weekly_submissions ADD COLUMN IF NOT EXISTS problem_title TEXT;
ALTER TABLE public.weekly_submissions ADD COLUMN IF NOT EXISTS github TEXT;
ALTER TABLE public.weekly_submissions ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.weekly_submissions ADD COLUMN IF NOT EXISTS lang TEXT;
ALTER TABLE public.weekly_submissions ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.weekly_submissions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.weekly_submissions ADD COLUMN IF NOT EXISTS tests_passed INTEGER DEFAULT 0;
ALTER TABLE public.weekly_submissions ADD COLUMN IF NOT EXISTS tests_total INTEGER DEFAULT 0;
ALTER TABLE public.weekly_submissions ADD COLUMN IF NOT EXISTS points_awarded INTEGER DEFAULT 0;
ALTER TABLE public.weekly_submissions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.weekly_submissions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.arena_submissions ADD COLUMN IF NOT EXISTS contest_id TEXT;
ALTER TABLE public.arena_submissions ADD COLUMN IF NOT EXISTS contest_name TEXT;
ALTER TABLE public.arena_submissions ADD COLUMN IF NOT EXISTS problem_id TEXT;
ALTER TABLE public.arena_submissions ADD COLUMN IF NOT EXISTS problem_title TEXT;
ALTER TABLE public.arena_submissions ADD COLUMN IF NOT EXISTS github TEXT;
ALTER TABLE public.arena_submissions ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.arena_submissions ADD COLUMN IF NOT EXISTS lang TEXT;
ALTER TABLE public.arena_submissions ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.arena_submissions ADD COLUMN IF NOT EXISTS approach TEXT;
ALTER TABLE public.arena_submissions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'submitted';
ALTER TABLE public.arena_submissions ADD COLUMN IF NOT EXISTS points_awarded INTEGER DEFAULT 0;
ALTER TABLE public.arena_submissions ADD COLUMN IF NOT EXISTS tests_passed INTEGER DEFAULT 0;
ALTER TABLE public.arena_submissions ADD COLUMN IF NOT EXISTS tests_total INTEGER DEFAULT 0;
ALTER TABLE public.arena_submissions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_submissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.submissions FROM anon;
REVOKE ALL ON public.weekly_submissions FROM anon;
REVOKE ALL ON public.arena_submissions FROM anon;

REVOKE INSERT, UPDATE, DELETE ON public.submissions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.weekly_submissions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.arena_submissions FROM authenticated;

GRANT SELECT ON public.submissions TO authenticated;
GRANT SELECT ON public.weekly_submissions TO authenticated;
GRANT SELECT ON public.arena_submissions TO authenticated;

-- Own-row code protection: authenticated users can only read their own submissions
DROP POLICY IF EXISTS "submissions_select_all" ON public.submissions;
DROP POLICY IF EXISTS "submissions_select_own" ON public.submissions;
CREATE POLICY "submissions_select_own" ON public.submissions FOR SELECT TO authenticated
USING (lower(github) = public.get_auth_github_username());

DROP POLICY IF EXISTS "weekly_submissions_select_all" ON public.weekly_submissions;
DROP POLICY IF EXISTS "weekly_submissions_select_own" ON public.weekly_submissions;
CREATE POLICY "weekly_submissions_select_own" ON public.weekly_submissions FOR SELECT TO authenticated
USING (lower(github) = public.get_auth_github_username());

DROP POLICY IF EXISTS "arena_submissions_select_all" ON public.arena_submissions;
DROP POLICY IF EXISTS "arena_submissions_select_own" ON public.arena_submissions;
CREATE POLICY "arena_submissions_select_own" ON public.arena_submissions FOR SELECT TO authenticated
USING (lower(github) = public.get_auth_github_username());

-- 8. SEED DATA
-- ════════════════════════════════════════════════════════════

-- SEED COMMUNITY GHOST RUNS (Deterministic UUIDs for instant race availability)
INSERT INTO public.ghost_runs (id, problem_id, problem_title, github, user_name, user_avatar, time_seconds, language, code_length, checkpoints)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'two-sum', 'Two Sum', 'arjun_dev', 'Arjun Verma', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face', 145, 'python', 198, '[{"at": 15, "label": "Analyzing constraints"}, {"at": 40, "label": "Initialized complement map"}, {"at": 90, "label": "Passed sample cases"}, {"at": 145, "label": "All tests green!"}]'::jsonb),
  ('00000000-0000-0000-0000-000000000002', 'valid-parentheses', 'Valid Parentheses', 'karthik_r', 'Karthik R.', 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&h=100&fit=crop&crop=face', 190, 'javascript', 240, '[{"at": 20, "label": "Bracket stack structure"}, {"at": 65, "label": "Closing match logic"}, {"at": 130, "label": "Edge cases passed"}, {"at": 190, "label": "All tests green!"}]'::jsonb),
  ('00000000-0000-0000-0000-000000000003', 'reverse-linked-list', 'Reverse Linked List', 'sneha_codes', 'Sneha Patel', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face', 110, 'python', 165, '[{"at": 12, "label": "Pointer initialization"}, {"at": 45, "label": "Three-pointer loop"}, {"at": 80, "label": "Single-node test"}, {"at": 110, "label": "All tests green!"}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- SEED ACTIVE DAILY POLL
INSERT INTO public.community_polls (id, question, options, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  '🔥 Daily Debate: Recursion vs Iteration in Technical Interviews — which is your go-to?',
  '[{"id": "opt-1", "text": "Recursion (Cleaner, easier to visualize trees/graphs)", "votes": 42}, {"id": "opt-2", "text": "Iteration (No stack overflow risk, faster in prod)", "votes": 68}, {"id": "opt-3", "text": "Depends on whether the interviewer asks for O(1) space", "votes": 85}]'::jsonb,
  true
)
ON CONFLICT (id) DO NOTHING;
