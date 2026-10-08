-- ════════════════════════════════════════════════════════════
-- Supabase Migration: Collaborations Page Schema & RLS Policies
-- Dedicated isolated table for Collaborations & Partnerships
-- ════════════════════════════════════════════════════════════

-- 1. Create Dedicated collaborations_page Table
CREATE TABLE IF NOT EXISTS public.collaborations_page (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL DEFAULT 'Our Collaborations',
    content TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Insert Initial Row if Table is Empty
INSERT INTO public.collaborations_page (title, content)
SELECT 
    'Our Collaborations & Partnerships',
    '<h2>Empowering Developers Together</h2><p>BitByBit collaborates with top collegiate developer clubs, technical organizations, and industry partners to host competitive programming arenas, hackathons, and structured learning cohorts.</p><h3>Why Partner With Us?</h3><ul><li><strong>High Engagement:</strong> Direct access to an active community of skilled problem solvers and engineers.</li><li><strong>Custom Arena Competitions:</strong> Turnkey proctored coding assessments tailored to your college or organization.</li><li><strong>Verified Credentials:</strong> Issue cryptographically verifiable certificates with activity points recognition.</li></ul><p>Interested in organizing an event or partnering with BitByBit? Contact our team at <a href="mailto:teamcodelocked@gmail.com">teamcodelocked@gmail.com</a>.</p>'
WHERE NOT EXISTS (SELECT 1 FROM public.collaborations_page);

-- 3. Row Level Security (RLS)
ALTER TABLE public.collaborations_page ENABLE ROW LEVEL SECURITY;

-- Policy: Public read access for everyone (anon and authenticated)
DROP POLICY IF EXISTS "Public can view collaborations page" ON public.collaborations_page;
CREATE POLICY "Public can view collaborations page"
ON public.collaborations_page FOR SELECT
TO anon, authenticated
USING (true);

-- Policy: Admins can update collaborations page
DROP POLICY IF EXISTS "Admins can update collaborations page" ON public.collaborations_page;
CREATE POLICY "Admins can update collaborations page"
ON public.collaborations_page FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE github = (auth.jwt() -> 'user_metadata' ->> 'user_name')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE github = (auth.jwt() -> 'user_metadata' ->> 'user_name')
  )
);

-- Policy: Admins can insert collaborations page
DROP POLICY IF EXISTS "Admins can insert collaborations page" ON public.collaborations_page;
CREATE POLICY "Admins can insert collaborations page"
ON public.collaborations_page FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admins
    WHERE github = (auth.jwt() -> 'user_metadata' ->> 'user_name')
  )
);
