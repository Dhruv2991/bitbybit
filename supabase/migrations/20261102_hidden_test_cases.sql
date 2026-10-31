-- ════════════════════════════════════════════════════════════
-- Migration: 20261102_hidden_test_cases.sql
-- Description:
--   1. Read-only duplicate check query (kept as comment).
--   2. Creates public.problem_test_cases table (problem_id uuid references problems(id)).
--   3. Adds problems.sample_test_cases column.
--   4. Backfills sample vs hidden test cases using jsonb_array_elements(...) WITH ORDINALITY:
--      (if no is_hidden=true cases, ord <= 2 are samples, ord > 2 are hidden).
--   5. Splits triggers on problems into:
--      - BEFORE INSERT OR UPDATE: sets NEW.sample_test_cases.
--      - AFTER INSERT OR UPDATE: synchronizes child rows in problem_test_cases.
--   6. Revokes test_cases from anon/authenticated and grants sample_test_cases.
--   7. Creates atomic SECURITY DEFINER award_problem_points(p_problem_id uuid, ...) function:
--      - Advisory lock (pg_advisory_xact_lock)
--      - Exploit prevention: never downgrades approved solve, preserves first approved code,
--        treats any existing row with points_awarded > 0 as already solved
--      - Casts p_problem_id::text for submissions (text) and uses uuid directly for weekly_submissions (uuid)
--      - Weekly challenge lookup with p_problem_id::text = ANY(problem_ids)
--      - Time bonus included in members.total_points for weekly challenges (matching old behavior)
--      - Uses IF FOUND with github in SELECT list, and ON CONFLICT (github) DO UPDATE for new members
--      - IST streak calculation (Asia/Kolkata)
--      - Restricted execute permission: granted exclusively to service_role.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Read-only duplicate check query ────────────────────────
-- Run this in the Supabase SQL editor to inspect any existing duplicate solves:
-- SELECT github, problem_id, count(*)
-- FROM public.submissions
-- WHERE status = 'approved' AND points_awarded > 0
-- GROUP BY github, problem_id
-- HAVING count(*) > 1;

-- ── 2. Create problem_test_cases table ────────────────────────
CREATE TABLE IF NOT EXISTS public.problem_test_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id uuid NOT NULL REFERENCES public.problems(id) ON DELETE CASCADE,
  input text NOT NULL,
  expected text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_problem_test_cases_prob_pos
  ON public.problem_test_cases (problem_id, position);

ALTER TABLE public.problem_test_cases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.problem_test_cases FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.problem_test_cases TO service_role;

-- ── 3. Add sample_test_cases column to problems ───────────────
ALTER TABLE public.problems
  ADD COLUMN IF NOT EXISTS sample_test_cases jsonb DEFAULT '[]'::jsonb;

-- ── 4. Backfill problem_test_cases and sample_test_cases ──────
DO $$
DECLARE
  p RECORD;
  tc RECORD;
  v_has_hidden BOOLEAN;
  v_is_hidden BOOLEAN;
  v_samples JSONB;
BEGIN
  DELETE FROM public.problem_test_cases;

  FOR p IN SELECT id, test_cases FROM public.problems WHERE test_cases IS NOT NULL AND jsonb_array_length(test_cases) > 0 LOOP
    -- Check if problem already has explicit is_hidden = true
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p.test_cases) elem
      WHERE (elem->>'is_hidden')::boolean = true
    ) INTO v_has_hidden;

    v_samples := '[]'::jsonb;

    FOR tc IN SELECT * FROM jsonb_array_elements(p.test_cases) WITH ORDINALITY AS t(value, ord) LOOP
      IF v_has_hidden THEN
        v_is_hidden := COALESCE((tc.value->>'is_hidden')::boolean, false);
      ELSE
        -- 2-sample split rule: ord 1, 2 are samples, ord > 2 are hidden
        v_is_hidden := (tc.ord > 2);
      END IF;

      INSERT INTO public.problem_test_cases (
        problem_id,
        input,
        expected,
        is_hidden,
        position,
        explanation
      ) VALUES (
        p.id,
        COALESCE(tc.value->>'input', ''),
        COALESCE(tc.value->>'expected', ''),
        v_is_hidden,
        (tc.ord - 1)::integer,
        tc.value->>'explanation'
      );

      IF NOT v_is_hidden THEN
        v_samples := v_samples || jsonb_build_object(
          'input', COALESCE(tc.value->>'input', ''),
          'expected', COALESCE(tc.value->>'expected', ''),
          'is_hidden', false,
          'explanation', tc.value->>'explanation'
        );
      END IF;
    END LOOP;

    UPDATE public.problems
    SET sample_test_cases = v_samples
    WHERE id = p.id;
  END LOOP;
END $$;

-- ── 5. Trigger Split on problems ──────────────────────────────
-- 5a. BEFORE trigger: Computes and sets NEW.sample_test_cases directly on problems
CREATE OR REPLACE FUNCTION public.set_problem_sample_test_cases()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tc RECORD;
  v_has_hidden BOOLEAN;
  v_is_hidden BOOLEAN;
  v_samples JSONB := '[]'::jsonb;
BEGIN
  IF NEW.test_cases IS NULL OR jsonb_array_length(NEW.test_cases) = 0 THEN
    NEW.sample_test_cases := '[]'::jsonb;
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.test_cases) elem
    WHERE (elem->>'is_hidden')::boolean = true
  ) INTO v_has_hidden;

  FOR tc IN SELECT * FROM jsonb_array_elements(NEW.test_cases) WITH ORDINALITY AS t(value, ord) LOOP
    IF v_has_hidden THEN
      v_is_hidden := COALESCE((tc.value->>'is_hidden')::boolean, false);
    ELSE
      v_is_hidden := (tc.ord > 2);
    END IF;

    IF NOT v_is_hidden THEN
      v_samples := v_samples || jsonb_build_object(
        'input', COALESCE(tc.value->>'input', ''),
        'expected', COALESCE(tc.value->>'expected', ''),
        'is_hidden', false,
        'explanation', tc.value->>'explanation'
      );
    END IF;
  END LOOP;

  NEW.sample_test_cases := v_samples;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_problem_sample_test_cases ON public.problems;
CREATE TRIGGER trg_set_problem_sample_test_cases
BEFORE INSERT OR UPDATE OF test_cases ON public.problems
FOR EACH ROW EXECUTE FUNCTION public.set_problem_sample_test_cases();

-- 5b. AFTER trigger: Synchronizes child rows in problem_test_cases after parent exists
CREATE OR REPLACE FUNCTION public.sync_problem_test_cases_child()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tc RECORD;
  v_has_hidden BOOLEAN;
  v_is_hidden BOOLEAN;
BEGIN
  DELETE FROM public.problem_test_cases WHERE problem_id = NEW.id;

  IF NEW.test_cases IS NULL OR jsonb_array_length(NEW.test_cases) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.test_cases) elem
    WHERE (elem->>'is_hidden')::boolean = true
  ) INTO v_has_hidden;

  FOR tc IN SELECT * FROM jsonb_array_elements(NEW.test_cases) WITH ORDINALITY AS t(value, ord) LOOP
    IF v_has_hidden THEN
      v_is_hidden := COALESCE((tc.value->>'is_hidden')::boolean, false);
    ELSE
      v_is_hidden := (tc.ord > 2);
    END IF;

    INSERT INTO public.problem_test_cases (
      problem_id,
      input,
      expected,
      is_hidden,
      position,
      explanation
    ) VALUES (
      NEW.id,
      COALESCE(tc.value->>'input', ''),
      COALESCE(tc.value->>'expected', ''),
      v_is_hidden,
      (tc.ord - 1)::integer,
      tc.value->>'explanation'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_problem_test_cases_child ON public.problems;
CREATE TRIGGER trg_sync_problem_test_cases_child
AFTER INSERT OR UPDATE OF test_cases ON public.problems
FOR EACH ROW EXECUTE FUNCTION public.sync_problem_test_cases_child();

-- Clean up any previous combined trigger name if present
DROP TRIGGER IF EXISTS trg_sync_problem_test_cases ON public.problems;
DROP FUNCTION IF EXISTS public.sync_problem_test_cases();

-- ── 6. Column grants on problems ──────────────────────────────
REVOKE SELECT (test_cases) ON public.problems FROM anon, authenticated;
GRANT SELECT (sample_test_cases) ON public.problems TO anon, authenticated;

-- ── 7. Atomic scoring function award_problem_points ───────────
CREATE OR REPLACE FUNCTION public.award_problem_points(
  p_problem_id uuid,
  p_github text,
  p_name text,
  p_lang text,
  p_code text,
  p_passed integer,
  p_total integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_all_passed boolean;
  v_prob RECORD;
  v_ex_sub RECORD;
  v_already_solved boolean := false;
  v_is_first_solve boolean := false;
  v_base_points integer;
  v_points_awarded integer := 0;
  v_today_ist text;
  v_last_ist text;
  v_yesterday_ist text;
  v_member RECORD;
  v_streak integer := 0;
  v_now timestamptz := now();
  v_active_challenge RECORD;
  v_bonus numeric := 0;
  v_total_sec numeric;
  v_frac numeric;
  v_weekly_points integer := 0;
  v_member_points integer := 0;
BEGIN
  -- 1. Acquire transaction-level advisory lock per user + problem
  PERFORM pg_advisory_xact_lock(hashtext(p_github || ':' || p_problem_id::text));

  v_all_passed := (p_total > 0 AND p_passed = p_total);

  -- 2. Load problem row (problems.id is uuid)
  SELECT id, title, points, visibility INTO v_prob
  FROM public.problems
  WHERE id = p_problem_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Problem % not found', p_problem_id;
  END IF;

  v_base_points := COALESCE(v_prob.points, 100);

  -- 3. Check existing solve across both submissions and weekly_submissions (133 legacy weekly solves)
  -- Any existing row with points_awarded > 0 is treated as already solved, regardless of status
  SELECT id, points_awarded, status, code INTO v_ex_sub
  FROM public.submissions
  WHERE github = p_github
    AND problem_id = p_problem_id::text
  LIMIT 1;

  v_already_solved := (
    (v_ex_sub.id IS NOT NULL AND COALESCE(v_ex_sub.points_awarded, 0) > 0)
    OR EXISTS (
      SELECT 1 FROM public.weekly_submissions ws
      WHERE ws.github = p_github
        AND ws.problem_id = p_problem_id
        AND COALESCE(ws.points_awarded, 0) > 0
    )
  );
  v_is_first_solve := (NOT v_already_solved AND v_all_passed);

  IF v_all_passed AND NOT v_already_solved THEN
    v_points_awarded := v_base_points;
  ELSE
    v_points_awarded := 0;
  END IF;

  -- 4. If weekly problem, compute time bonus and weekly points
  -- weekly_challenges.problem_ids is text[]; weekly_submissions.problem_id is UUID
  IF v_prob.visibility = 'weekly' THEN
    SELECT id, starts_at, ends_at INTO v_active_challenge
    FROM public.weekly_challenges
    WHERE p_problem_id::text = ANY(problem_ids)
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_active_challenge.id IS NOT NULL THEN
      v_total_sec := EXTRACT(EPOCH FROM (v_active_challenge.ends_at - v_active_challenge.starts_at));
      IF v_total_sec > 0 THEN
        v_frac := LEAST(1.0, GREATEST(0.0, EXTRACT(EPOCH FROM (v_now - v_active_challenge.starts_at)) / v_total_sec));
      ELSE
        v_frac := 1.0;
      END IF;
      v_bonus := 1.0 - (v_frac * 0.8);
      v_weekly_points := CASE WHEN v_all_passed AND NOT v_already_solved THEN ROUND(v_base_points * (1 + v_bonus))::int ELSE 0 END;
    END IF;
  END IF;

  -- Points added to members.total_points: includes time bonus for weekly challenges
  v_member_points := CASE WHEN v_prob.visibility = 'weekly' THEN v_weekly_points ELSE v_points_awarded END;

  -- 5. Calculate streak in Asia/Kolkata (IST)
  v_today_ist := to_char(v_now AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD');
  v_yesterday_ist := to_char((v_now - interval '1 day') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD');

  SELECT github, total_points, problems_solved, streak, last_solved_at INTO v_member
  FROM public.members
  WHERE github = p_github
  FOR UPDATE;

  IF v_all_passed THEN
    IF FOUND THEN
      IF v_member.last_solved_at IS NOT NULL THEN
        v_last_ist := to_char(v_member.last_solved_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD');
        IF v_last_ist = v_today_ist THEN
          v_streak := COALESCE(v_member.streak, 1);
        ELSIF v_last_ist = v_yesterday_ist THEN
          v_streak := COALESCE(v_member.streak, 0) + 1;
        ELSE
          v_streak := 1;
        END IF;
      ELSE
        v_streak := 1;
      END IF;

      UPDATE public.members
      SET total_points = COALESCE(total_points, 0) + v_member_points,
          problems_solved = COALESCE(problems_solved, 0) + CASE WHEN v_is_first_solve THEN 1 ELSE 0 END,
          streak = v_streak,
          last_solved_at = v_now
      WHERE github = p_github;
    ELSE
      v_streak := 1;
      INSERT INTO public.members (github, name, total_points, problems_solved, streak, last_solved_at)
      VALUES (p_github, p_name, v_member_points, CASE WHEN v_is_first_solve THEN 1 ELSE 0 END, 1, v_now)
      ON CONFLICT (github) DO UPDATE
      SET total_points = COALESCE(members.total_points, 0) + EXCLUDED.total_points,
          problems_solved = COALESCE(members.problems_solved, 0) + EXCLUDED.problems_solved,
          streak = EXCLUDED.streak,
          last_solved_at = EXCLUDED.last_solved_at;
    END IF;
  ELSE
    v_streak := COALESCE(v_member.streak, 0);
  END IF;

  -- 6. Record/update in submissions table (submissions.problem_id is TEXT)
  -- Never downgrade an approved solve; preserve the original approved code
  INSERT INTO public.submissions (
    problem_id, problem_title, github, name, lang, code, status, tests_passed, tests_total, points_awarded, created_at
  ) VALUES (
    p_problem_id::text, v_prob.title, p_github, p_name, p_lang, p_code,
    CASE WHEN v_all_passed THEN 'approved' ELSE 'rejected' END,
    p_passed, p_total, v_points_awarded, v_now
  )
  ON CONFLICT (problem_id, github) DO UPDATE
  SET status = CASE WHEN submissions.status = 'approved' THEN 'approved' ELSE EXCLUDED.status END,
      code = CASE WHEN submissions.status = 'approved' AND submissions.code IS NOT NULL AND submissions.code <> '' THEN submissions.code ELSE EXCLUDED.code END,
      lang = CASE WHEN submissions.status = 'approved' THEN submissions.lang ELSE EXCLUDED.lang END,
      tests_passed = CASE WHEN submissions.status = 'approved' THEN submissions.tests_passed ELSE EXCLUDED.tests_passed END,
      tests_total = CASE WHEN submissions.status = 'approved' THEN submissions.tests_total ELSE EXCLUDED.tests_total END,
      points_awarded = GREATEST(COALESCE(submissions.points_awarded, 0), EXCLUDED.points_awarded),
      created_at = submissions.created_at;

  -- 7. If weekly problem, also update weekly_submissions
  IF v_prob.visibility = 'weekly' AND v_active_challenge.id IS NOT NULL THEN
    INSERT INTO public.weekly_submissions (
      weekly_challenge_id, problem_id, problem_title, github, name, lang, code, tests_passed, tests_total, points_awarded, time_bonus, status, submitted_at
    ) VALUES (
      v_active_challenge.id, p_problem_id, v_prob.title, p_github, p_name, p_lang, p_code,
      p_passed, p_total, v_weekly_points, v_bonus,
      CASE WHEN v_all_passed THEN 'approved' ELSE 'rejected' END,
      v_now
    )
    ON CONFLICT (weekly_challenge_id, problem_id, github) DO UPDATE
    SET status = CASE WHEN weekly_submissions.status = 'approved' THEN 'approved' ELSE EXCLUDED.status END,
        code = CASE WHEN weekly_submissions.status = 'approved' AND weekly_submissions.code IS NOT NULL AND weekly_submissions.code <> '' THEN weekly_submissions.code ELSE EXCLUDED.code END,
        lang = CASE WHEN weekly_submissions.status = 'approved' THEN weekly_submissions.lang ELSE EXCLUDED.lang END,
        tests_passed = CASE WHEN weekly_submissions.status = 'approved' THEN weekly_submissions.tests_passed ELSE EXCLUDED.tests_passed END,
        tests_total = CASE WHEN weekly_submissions.status = 'approved' THEN weekly_submissions.tests_total ELSE EXCLUDED.tests_total END,
        points_awarded = GREATEST(COALESCE(weekly_submissions.points_awarded, 0), EXCLUDED.points_awarded),
        time_bonus = CASE WHEN weekly_submissions.status = 'approved' THEN weekly_submissions.time_bonus ELSE EXCLUDED.time_bonus END,
        submitted_at = weekly_submissions.submitted_at;
  END IF;

  RETURN jsonb_build_object(
    'points_awarded', v_points_awarded,
    'weekly_points', v_weekly_points,
    'member_points', v_member_points,
    'is_first_solve', v_is_first_solve,
    'streak', v_streak,
    'all_passed', v_all_passed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.award_problem_points(uuid, text, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_problem_points(uuid, text, text, text, text, integer, integer) TO service_role;

COMMIT;
