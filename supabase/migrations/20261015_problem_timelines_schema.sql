-- ════════════════════════════════════════════════════════════
-- Supabase Migration: Algorithmic Thought-Process Time-Lapse & Logic Replay
-- Schema for capturing problem-solving chronological evolution
-- ════════════════════════════════════════════════════════════

-- 1. Create problem_timelines Table
CREATE TABLE IF NOT EXISTS public.problem_timelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
    problem_id TEXT NOT NULL,
    problem_title TEXT,
    user_github TEXT,
    user_name TEXT,
    snapshots JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of { timestamp, code, language, activeTestsPassed, eventType, stats, label }
    duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Indexes for fast retrieval & query optimization
CREATE INDEX IF NOT EXISTS idx_problem_timelines_problem_id ON public.problem_timelines(problem_id);
CREATE INDEX IF NOT EXISTS idx_problem_timelines_user_id ON public.problem_timelines(user_id);
CREATE INDEX IF NOT EXISTS idx_problem_timelines_user_github ON public.problem_timelines(user_github);
CREATE INDEX IF NOT EXISTS idx_problem_timelines_created_at ON public.problem_timelines(created_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.problem_timelines ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role unrestricted access
DROP POLICY IF EXISTS "Service role full access to problem_timelines" ON public.problem_timelines;
CREATE POLICY "Service role full access to problem_timelines"
ON public.problem_timelines FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: Public read access for shared replays (anon & authenticated)
DROP POLICY IF EXISTS "Public can view shared replays" ON public.problem_timelines;
CREATE POLICY "Public can view shared replays"
ON public.problem_timelines FOR SELECT
TO anon, authenticated
USING (true);

-- Policy: Authenticated and anonymous workspace users can record timelines
DROP POLICY IF EXISTS "Users can insert problem timelines" ON public.problem_timelines;
CREATE POLICY "Users can insert problem timelines"
ON public.problem_timelines FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Policy: Users can update their own timelines
DROP POLICY IF EXISTS "Users can update their own timelines" ON public.problem_timelines;
CREATE POLICY "Users can update their own timelines"
ON public.problem_timelines FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);
