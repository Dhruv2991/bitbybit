-- ════════════════════════════════════════════════════════════
-- Rollback Migration: 20261102_hidden_test_cases_rollback.sql
-- ════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop atomic scoring function (matches signature with uuid first param)
DROP FUNCTION IF EXISTS public.award_problem_points(uuid, text, text, text, text, integer, integer);

-- 2. Restore column grants on problems
GRANT SELECT (test_cases) ON public.problems TO anon, authenticated;
REVOKE SELECT (sample_test_cases) ON public.problems FROM anon, authenticated;

-- 3. Drop split triggers and sync functions on problems
DROP TRIGGER IF EXISTS trg_sync_problem_test_cases_child ON public.problems;
DROP FUNCTION IF EXISTS public.sync_problem_test_cases_child();

DROP TRIGGER IF EXISTS trg_set_problem_sample_test_cases ON public.problems;
DROP FUNCTION IF EXISTS public.set_problem_sample_test_cases();

-- 4. Drop sample_test_cases column
ALTER TABLE public.problems DROP COLUMN IF EXISTS sample_test_cases;

-- 5. Drop problem_test_cases table
DROP TABLE IF EXISTS public.problem_test_cases CASCADE;

COMMIT;
