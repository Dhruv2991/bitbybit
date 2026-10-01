-- ════════════════════════════════════════════════════════════
-- Supabase Migration: Certificates Schema & RLS Policies
-- ════════════════════════════════════════════════════════════

-- 1. Create Certificates Table
CREATE TABLE IF NOT EXISTS public.certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_id TEXT NOT NULL UNIQUE,
    member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
    github TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    certificate_type TEXT NOT NULL DEFAULT 'Certificate of Achievement',
    title TEXT NOT NULL DEFAULT 'CERTIFICATE OF ACHIEVEMENT',
    achievement_text TEXT NOT NULL,
    event_name TEXT NOT NULL,
    organization_text TEXT NOT NULL DEFAULT 'from teamcodelocked club',
    activity_points_text TEXT DEFAULT 'This certificate is eligible for claiming 1-2 activity points.',
    coordinator_names JSONB DEFAULT '[
      {"name": "PROF. NAMRATHA M.", "title": "FACULTY CLUB COORDINATOR", "org": "TEAMCODELOCKED"},
      {"name": "PANNAG K", "title": "STUDENT CLUB COORDINATOR", "org": "TEAMCODELOCKED"},
      {"name": "AAKANSHYA AGARWAL", "title": "STUDENT CLUB COORDINATOR", "org": "TEAMCODELOCKED"}
    ]'::jsonb,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    issued_by TEXT NOT NULL,
    pdf_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'revoked')),
    email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed')),
    email_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_certificates_github ON public.certificates(github);
CREATE INDEX IF NOT EXISTS idx_certificates_cert_id ON public.certificates(certificate_id);
CREATE INDEX IF NOT EXISTS idx_certificates_status ON public.certificates(status);
CREATE INDEX IF NOT EXISTS idx_certificates_created_at ON public.certificates(created_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

-- Helper function to check admin status
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admins
    WHERE github = (auth.jwt() -> 'user_metadata' ->> 'user_name')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy: Authenticated Admins can select all certificates
DROP POLICY IF EXISTS "Admins can view all certificates" ON public.certificates;
CREATE POLICY "Admins can view all certificates"
ON public.certificates FOR SELECT
TO authenticated
USING (public.is_admin());

-- Policy: Authenticated Members can view ONLY their own active certificates
DROP POLICY IF EXISTS "Members can view their own certificates" ON public.certificates;
CREATE POLICY "Members can view their own certificates"
ON public.certificates FOR SELECT
TO authenticated
USING (
  github = (auth.jwt() -> 'user_metadata' ->> 'user_name')
);

-- Policy: Public can view certificates for verification
DROP POLICY IF EXISTS "Public can view non-sensitive certificate details" ON public.certificates;
CREATE POLICY "Public can view non-sensitive certificate details"
ON public.certificates FOR SELECT
TO anon
USING (true);

-- Policy: Only service role / admins can insert or update certificates
DROP POLICY IF EXISTS "Admins can insert certificates" ON public.certificates;
CREATE POLICY "Admins can insert certificates"
ON public.certificates FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update certificates" ON public.certificates;
CREATE POLICY "Admins can update certificates"
ON public.certificates FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());
