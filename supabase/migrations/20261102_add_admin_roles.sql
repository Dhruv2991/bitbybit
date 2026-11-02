-- ════════════════════════════════════════════════════════════
-- Supabase Migration: Add Role-Based Access Control to Admins
-- ════════════════════════════════════════════════════════════

-- 1. Add role column to admins table (defaults to 'super_admin' so all current admins retain full access)
ALTER TABLE IF EXISTS public.admins 
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'super_admin';

-- 2. Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_admins_role ON public.admins(role);

-- 3. Document valid roles:
-- 'super_admin' : Full access (Architecture, Tech, DB, Admin Console, Coordinator Portal)
-- 'tech'        : Tech Team (Problems, Hidden Test Cases, Judge, Arena, Admin Console)
-- 'coordinator' : Management Team (Certificates, Contests, Announcements, Coupons, Feedback)
COMMENT ON COLUMN public.admins.role IS 'Role of the admin: super_admin, tech, or coordinator';
