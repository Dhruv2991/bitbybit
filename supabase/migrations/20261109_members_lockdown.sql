-- ════════════════════════════════════════════════════════════
-- Supabase Migration: Members & Submissions Security Lockdown
-- Migration Date: 2026-11-09
-- Purpose:
-- 1. Drop open/legacy policies on public.members
-- 2. Revoke ALL on members from anon and authenticated
-- 3. Grant SELECT on non-email columns to anon and authenticated
-- 4. Grant UPDATE (name, avatar_url) to authenticated
-- 5. Revoke TRUNCATE, REFERENCES and TRIGGER on submissions tables from authenticated
-- ════════════════════════════════════════════════════════════

-- 1. Drop open/legacy policies on public.members
DROP POLICY IF EXISTS "Auth upsert members" ON public.members;
DROP POLICY IF EXISTS "members_insert_auth" ON public.members;
DROP POLICY IF EXISTS "members_update_auth" ON public.members;
DROP POLICY IF EXISTS "Public read members" ON public.members;

-- 2. Ensure RLS is active on public.members
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- 3. Revoke all privileges on members from client roles
REVOKE ALL ON public.members FROM anon, authenticated;

-- 4. Grant SELECT on non-email columns to anon and authenticated
-- Explicitly excludes email and email_subscribed to protect user privacy
GRANT SELECT (
  id,
  github,
  name,
  avatar_url,
  karma_points,
  duels_won,
  duels_lost,
  total_points,
  problems_solved,
  streak,
  last_solved_at,
  squad_id,
  badges,
  created_at,
  updated_at
) ON public.members TO anon, authenticated;

-- 5. Grant UPDATE strictly on user-editable profile columns to authenticated
GRANT UPDATE (name, avatar_url) ON public.members TO authenticated;

-- 6. Revoke administrative/schema-level privileges on submissions tables from authenticated
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.submissions FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.weekly_submissions FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.arena_submissions FROM authenticated;

-- 7. Ensure claim_ghost_duel_win handles already_claimed idempotently without duplicate insert
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
    RETURN jsonb_build_object(
      'success', true,
      'match_id', NULL,
      'points_awarded', 0,
      'squad_points_awarded', 0,
      'already_claimed', true,
      'daily_cap_reached', false
    );
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
  IF NOT v_daily_cap_reached THEN
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
    'already_claimed', false,
    'daily_cap_reached', v_daily_cap_reached
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ════════════════════════════════════════════════════════════
-- UNDO / ROLLBACK SECTION
-- ════════════════════════════════════════════════════════════
/*
-- To undo this lockdown migration:

-- 1. Revoke column-level grants on members
REVOKE SELECT (
  id, github, name, avatar_url, karma_points, duels_won, duels_lost,
  total_points, problems_solved, streak, last_solved_at, squad_id, badges, created_at, updated_at
) ON public.members FROM anon, authenticated;

REVOKE UPDATE (name, avatar_url) ON public.members FROM authenticated;

-- 2. Restore table-level SELECT on members
GRANT SELECT ON public.members TO anon, authenticated;

-- 3. Restore UPDATE on authenticated for name, avatar_url
GRANT UPDATE (name, avatar_url) ON public.members TO authenticated;

-- 4. (Submissions tables retain SELECT for authenticated, all writes remain server-only)
*/
