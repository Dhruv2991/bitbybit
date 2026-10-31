-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20261101_problems_rls_hardening_rollback.sql
-- Run this script to fully revert the forward migration.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Remove problem_details table, functions, and sync trigger
DROP TRIGGER IF EXISTS trg_sync_problem_details ON public.problems;
DROP FUNCTION IF EXISTS public.sync_problem_details();
DROP TRIGGER IF EXISTS trg_touch_problem_details ON public.problem_details;
DROP FUNCTION IF EXISTS public.touch_problem_details();
DROP TABLE IF EXISTS public.problem_details;

-- 2. Drop the safe read policy
DROP POLICY IF EXISTS "problems_public_read" ON public.problems;

-- 3. Restore original 6 policies on problems
CREATE POLICY "Auth all problems"    ON public.problems FOR ALL    TO public        USING (true);
CREATE POLICY "Public read problems" ON public.problems FOR SELECT TO public        USING (true);
CREATE POLICY "problems_read_all"    ON public.problems FOR SELECT TO public        USING (true);
CREATE POLICY "problems_delete_auth" ON public.problems FOR DELETE TO authenticated USING (true);
CREATE POLICY "problems_update_auth" ON public.problems FOR UPDATE TO authenticated USING (true);
CREATE POLICY "problems_write_auth"  ON public.problems FOR INSERT TO authenticated WITH CHECK (true);

-- 4. Re-grant table-level privileges on problems to client roles
GRANT SELECT ON public.problems TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.problems TO authenticated;

-- 5. Restore original is_admin() and drop helpers
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admins
    WHERE github = (auth.jwt() -> 'user_metadata' ->> 'user_name')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS public.has_active_pro();
DROP FUNCTION IF EXISTS public.get_auth_github_username();

COMMIT;
