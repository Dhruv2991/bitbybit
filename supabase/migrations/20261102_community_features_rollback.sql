-- ════════════════════════════════════════════════════════════
-- Rollback Migration: BitByBit Community Features
-- ════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.ghost_duel_matches CASCADE;
DROP TABLE IF EXISTS public.ghost_runs CASCADE;
DROP TABLE IF EXISTS public.problem_discussion_votes CASCADE;
DROP TABLE IF EXISTS public.problem_discussions CASCADE;
DROP TABLE IF EXISTS public.community_poll_votes CASCADE;
DROP TABLE IF EXISTS public.community_polls CASCADE;
DROP TABLE IF EXISTS public.squad_members CASCADE;
DROP TABLE IF EXISTS public.squads CASCADE;

