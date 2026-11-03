-- ════════════════════════════════════════════════════════════
-- Supabase Migration: BitByBit Community Features
-- 1. Squads / Guilds / Clans (3-5 members)
-- 2. Daily Community Polls & Questions
-- 3. Problem Discussions & Intuitions ("ELI5")
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

-- SQUAD MEMBERS (Max 5 per squad enforced by application logic)
CREATE TABLE IF NOT EXISTS public.squad_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id UUID NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  github TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  points_contributed INTEGER NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_squad_members_squad ON public.squad_members(squad_id);
CREATE INDEX IF NOT EXISTS idx_squad_members_github ON public.squad_members(github);

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

-- POLL VOTES
CREATE TABLE IF NOT EXISTS public.community_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.community_polls(id) ON DELETE CASCADE,
  github TEXT NOT NULL,
  option_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_poll_vote UNIQUE (poll_id, github)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON public.community_poll_votes(poll_id);

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

-- DISCUSSION UPVOTES (Prevent duplicate upvotes)
CREATE TABLE IF NOT EXISTS public.problem_discussion_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id UUID NOT NULL REFERENCES public.problem_discussions(id) ON DELETE CASCADE,
  github TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_discussion_vote UNIQUE (discussion_id, github)
);

CREATE INDEX IF NOT EXISTS idx_discussion_votes_disc ON public.problem_discussion_votes(discussion_id);

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

-- 5. GHOST DUEL MATCHES (Completed race matches against ghosts)
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

CREATE INDEX IF NOT EXISTS idx_ghost_matches_challenger ON public.ghost_duel_matches(challenger_github);
CREATE INDEX IF NOT EXISTS idx_ghost_matches_recent ON public.ghost_duel_matches(created_at DESC);


