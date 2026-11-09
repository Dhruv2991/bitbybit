-- ════════════════════════════════════════════════════════════
-- Rollback Migration: BitByBit Community Features
-- ════════════════════════════════════════════════════════════

-- 1. Drop tables in dependency order (drops dependent policies first)
DROP TABLE IF EXISTS public.ghost_duel_matches CASCADE;
DROP TABLE IF EXISTS public.ghost_duel_sessions CASCADE;
DROP TABLE IF EXISTS public.ghost_runs CASCADE;
DROP TABLE IF EXISTS public.problem_discussion_votes CASCADE;
DROP TABLE IF EXISTS public.problem_discussions CASCADE;
DROP TABLE IF EXISTS public.community_poll_votes CASCADE;
DROP TABLE IF EXISTS public.community_polls CASCADE;
DROP TABLE IF EXISTS public.squad_members CASCADE;
DROP TABLE IF EXISTS public.squad_join_attempts CASCADE;
DROP TABLE IF EXISTS public.squads CASCADE;

-- 2. Drop discussion triggers and functions
DROP TRIGGER IF EXISTS trg_prevent_self_upvote ON public.problem_discussion_votes;
DROP FUNCTION IF EXISTS trg_check_no_self_upvote();

DROP TRIGGER IF EXISTS trg_increment_discussion_upvotes ON public.problem_discussion_votes;
DROP FUNCTION IF EXISTS trg_on_discussion_vote_insert();

DROP TRIGGER IF EXISTS trg_decrement_discussion_upvotes ON public.problem_discussion_votes;
DROP FUNCTION IF EXISTS trg_on_discussion_vote_delete();

-- 3. Drop poll triggers and functions
DROP TRIGGER IF EXISTS trg_increment_poll_option_vote ON public.community_poll_votes;
DROP FUNCTION IF EXISTS trg_on_poll_vote_insert();

DROP TRIGGER IF EXISTS trg_decrement_poll_option_vote ON public.community_poll_votes;
DROP FUNCTION IF EXISTS trg_on_poll_vote_delete();

-- 4. Drop squad capacity trigger and function
DROP TRIGGER IF EXISTS trg_check_squad_capacity ON public.squad_members;
DROP FUNCTION IF EXISTS check_squad_capacity();

-- 5. Drop helper functions
DROP FUNCTION IF EXISTS public.claim_ghost_duel_win(UUID, TEXT, TEXT, TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS public.cleanup_squad_join_attempts();
DROP FUNCTION IF EXISTS public.get_auth_github_username() CASCADE;


-- Restore pre-existing table policies (drop community policies)
DROP POLICY IF EXISTS "members_read_all" ON public.members;
DROP POLICY IF EXISTS "members_update_own" ON public.members;
DROP POLICY IF EXISTS "submissions_select_all" ON public.submissions;
DROP POLICY IF EXISTS "submissions_select_own" ON public.submissions;
DROP POLICY IF EXISTS "weekly_submissions_select_all" ON public.weekly_submissions;
DROP POLICY IF EXISTS "weekly_submissions_select_own" ON public.weekly_submissions;
DROP POLICY IF EXISTS "arena_submissions_select_all" ON public.arena_submissions;
DROP POLICY IF EXISTS "arena_submissions_select_own" ON public.arena_submissions;

-- NOTE: Original pre-existing table/column grants for members, submissions, weekly_submissions,
-- and arena_submissions must be restored using the captured output of information_schema.role_table_grants.
-- Do not blindly apply 'GRANT ALL', which grants excessive administrative privileges.
