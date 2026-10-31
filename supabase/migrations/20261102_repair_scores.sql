-- ============================================================
-- Migration: 20261102_repair_scores.sql
-- Description: Repair false approvals with 0 points and resync
-- members table total_points and problems_solved to canonical
-- deduplicated solve totals.
-- ============================================================

-- 1. Correct false approvals with 0 passed tests and 0 points to 'rejected'
UPDATE public.submissions
SET status = 'rejected', reject_reason = 'Failed all test cases (0 passed)'
WHERE status = 'approved' AND points_awarded = 0 AND tests_passed = 0;

UPDATE public.weekly_submissions
SET status = 'rejected', review_notes = 'Failed all test cases (0 passed)'
WHERE status = 'approved' AND points_awarded = 0 AND tests_passed = 0;

-- 2. Recalculate members table total_points and problems_solved from canonical deduplicated solves
WITH all_solves AS (
  SELECT github, problem_id::text AS problem_id, points_awarded
  FROM public.submissions
  WHERE status = 'approved' AND points_awarded > 0
  UNION ALL
  SELECT github, problem_id::text AS problem_id, points_awarded
  FROM public.weekly_submissions
  WHERE status = 'approved' AND points_awarded > 0
  UNION ALL
  SELECT github, problem_id::text AS problem_id, points_awarded
  FROM public.arena_submissions
  WHERE status = 'reviewed' AND points_awarded > 0
),
best_per_problem AS (
  SELECT github, problem_id, MAX(points_awarded) AS points
  FROM all_solves
  GROUP BY github, problem_id
),
canonical_totals AS (
  SELECT
    github,
    COALESCE(SUM(points), 0)::int AS real_points,
    COUNT(*)::int AS real_solved
  FROM best_per_problem
  GROUP BY github
)
UPDATE public.members m
SET
  total_points = COALESCE(c.real_points, 0),
  problems_solved = COALESCE(c.real_solved, 0)
FROM (
  SELECT m2.github, ct.real_points, ct.real_solved
  FROM public.members m2
  LEFT JOIN canonical_totals ct ON ct.github = m2.github
) c
WHERE m.github = c.github;

