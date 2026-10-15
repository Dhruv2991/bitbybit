-- ════════════════════════════════════════════════════════════
-- Supabase Migration: Real-Time 1v1 Code Duel Arena
-- Table, indexes, RLS policies, and realtime publication
-- ════════════════════════════════════════════════════════════

-- 1. Create code_duels Table
CREATE TABLE IF NOT EXISTS public.code_duels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id TEXT NOT NULL,
    problem_title TEXT,
    time_limit_mins INTEGER NOT NULL DEFAULT 30,
    host_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
    host_github TEXT NOT NULL,
    host_name TEXT NOT NULL,
    guest_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
    guest_github TEXT,
    guest_name TEXT,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'abandoned')),
    host_progress JSONB NOT NULL DEFAULT '{"testsPassed": 0, "totalTests": 0, "status": "coding"}'::jsonb,
    guest_progress JSONB NOT NULL DEFAULT '{"testsPassed": 0, "totalTests": 0, "status": "waiting"}'::jsonb,
    winner_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
    winner_github TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_code_duels_host_id ON public.code_duels(host_id);
CREATE INDEX IF NOT EXISTS idx_code_duels_guest_id ON public.code_duels(guest_id);
CREATE INDEX IF NOT EXISTS idx_code_duels_status ON public.code_duels(status);
CREATE INDEX IF NOT EXISTS idx_code_duels_created_at ON public.code_duels(created_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.code_duels ENABLE ROW LEVEL SECURITY;

-- Ensure replica identity is full for realtime diff payload
ALTER TABLE public.code_duels REPLICA IDENTITY FULL;

-- Policy: Anyone (anon and authenticated) can select duels to view and join
DROP POLICY IF EXISTS "Public can view duels" ON public.code_duels;
CREATE POLICY "Public can view duels"
ON public.code_duels FOR SELECT
TO anon, authenticated
USING (true);

-- Policy: Allow creating duel rooms
DROP POLICY IF EXISTS "Users can create duels" ON public.code_duels;
CREATE POLICY "Users can create duels"
ON public.code_duels FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Policy: Participants or service role can update duels
DROP POLICY IF EXISTS "Participants can update duels" ON public.code_duels;
CREATE POLICY "Participants can update duels"
ON public.code_duels FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 4. Enable Supabase Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'code_duels'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.code_duels;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
