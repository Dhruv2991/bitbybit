-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20261101_problems_rls_hardening.sql
-- Purpose  : 1. Fix write-exposure (revoke client table privileges, drop open write policies).
--            2. Fix read leak: column-level GRANT on problems (card columns + test_cases).
--            3. Create problem_details table for gated columns (description, hints, starter_code, etc.).
--            4. Harden is_admin() and has_active_pro() using auth.identities only (no user_metadata).
-- Safe     : Does NOT drop or alter existing columns/data in public.problems.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Secure Identity Helpers (unspoofable, auth.identities only) ────────────
CREATE OR REPLACE FUNCTION public.get_auth_github_username()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT (identity_data ->> 'user_name')
  FROM auth.identities
  WHERE user_id = auth.uid()
    AND provider = 'github'
  LIMIT 1;
$$;

-- Secure admin check
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins
    WHERE github = public.get_auth_github_username()
  );
$$;

-- Secure active Pro subscription check
CREATE OR REPLACE FUNCTION public.has_active_pro()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscribers s
    WHERE s.github = public.get_auth_github_username()
      AND s.status = 'confirmed'
      AND s.current_period_end > now()
  );
$$;

-- ── 2. Drop all 6 existing broken policies on `problems` ─────────────────────
DROP POLICY IF EXISTS "Auth all problems"     ON public.problems;
DROP POLICY IF EXISTS "Public read problems"  ON public.problems;
DROP POLICY IF EXISTS "problems_read_all"     ON public.problems;
DROP POLICY IF EXISTS "problems_delete_auth"  ON public.problems;
DROP POLICY IF EXISTS "problems_update_auth"  ON public.problems;
DROP POLICY IF EXISTS "problems_write_auth"   ON public.problems;

-- Ensure RLS is active
ALTER TABLE public.problems ENABLE ROW LEVEL SECURITY;

-- Safe read policy on problems (row level)
CREATE POLICY "problems_public_read"
  ON public.problems
  FOR SELECT
  TO public
  USING (true);

-- ── 3. Enforce Table & Column Privileges on `problems` ───────────────────────
-- Revoke all table-level privileges (SELECT, INSERT, UPDATE, DELETE) from client roles
REVOKE ALL ON public.problems FROM anon, authenticated;

-- Grant SELECT ONLY on card columns + test_cases (test_cases temporarily until Issue #2)
GRANT SELECT (
  id,
  title,
  difficulty,
  points,
  tags,
  visibility,
  is_contest_problem,
  submission_count,
  created_at,
  updated_at,
  test_cases
) ON public.problems TO anon, authenticated;

-- ── 4. Create `problem_details` table for gated columns ──────────────────────
CREATE TABLE IF NOT EXISTS public.problem_details (
  problem_id    UUID        PRIMARY KEY REFERENCES public.problems(id) ON DELETE CASCADE,
  description   TEXT        NOT NULL DEFAULT '',
  example       TEXT        NOT NULL DEFAULT '',
  hints         TEXT[]      NOT NULL DEFAULT '{}',
  starter_code  TEXT        NOT NULL DEFAULT '',
  param_types   TEXT[]      NOT NULL DEFAULT '{}',
  return_type   TEXT        NOT NULL DEFAULT 'void',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill from existing problems data (safe copy, preserves problems table intact)
INSERT INTO public.problem_details
  (problem_id, description, example, hints, starter_code, param_types, return_type)
SELECT
  id,
  COALESCE(description,  ''),
  COALESCE(example,      ''),
  COALESCE(hints,        '{}'),
  COALESCE(starter_code, ''),
  COALESCE(param_types,  '{}'),
  COALESCE(return_type,  'void')
FROM public.problems
ON CONFLICT (problem_id) DO NOTHING;

-- Auto-update updated_at on problem_details
CREATE OR REPLACE FUNCTION public.touch_problem_details()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_problem_details ON public.problem_details;
CREATE TRIGGER trg_touch_problem_details
  BEFORE UPDATE ON public.problem_details
  FOR EACH ROW EXECUTE FUNCTION public.touch_problem_details();

-- ── 5. RLS & Privileges on `problem_details` ─────────────────────────────────
ALTER TABLE public.problem_details ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.problem_details FROM anon, authenticated;
GRANT SELECT ON public.problem_details TO authenticated;

CREATE POLICY "problem_details_read"
  ON public.problem_details
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR
    EXISTS (
      SELECT 1 FROM public.problems p
      WHERE p.id = problem_details.problem_id
        AND (p.visibility = 'public' OR p.visibility = 'arena')
        AND p.is_contest_problem IS NOT TRUE
    )
    OR
    public.has_active_pro()
  );

-- ── 6. Trigger to keep `problem_details` in sync on updates to `problems` ─────
CREATE OR REPLACE FUNCTION public.sync_problem_details()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.problem_details
    (problem_id, description, example, hints, starter_code, param_types, return_type)
  VALUES
    (NEW.id,
     COALESCE(NEW.description,  ''),
     COALESCE(NEW.example,      ''),
     COALESCE(NEW.hints,        '{}'),
     COALESCE(NEW.starter_code, ''),
     COALESCE(NEW.param_types,  '{}'),
     COALESCE(NEW.return_type,  'void'))
  ON CONFLICT (problem_id) DO UPDATE SET
    description  = EXCLUDED.description,
    example      = EXCLUDED.example,
    hints        = EXCLUDED.hints,
    starter_code = EXCLUDED.starter_code,
    param_types  = EXCLUDED.param_types,
    return_type  = EXCLUDED.return_type,
    updated_at   = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_problem_details ON public.problems;
CREATE TRIGGER trg_sync_problem_details
  AFTER INSERT OR UPDATE OF description, example, hints, starter_code, param_types, return_type
  ON public.problems
  FOR EACH ROW EXECUTE FUNCTION public.sync_problem_details();

COMMIT;
