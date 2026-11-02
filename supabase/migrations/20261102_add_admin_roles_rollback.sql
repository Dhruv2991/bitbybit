-- ════════════════════════════════════════════════════════════
-- Supabase Migration Rollback: Remove role from admins
-- ════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS idx_admins_role;
ALTER TABLE IF EXISTS public.admins DROP COLUMN IF EXISTS role;

