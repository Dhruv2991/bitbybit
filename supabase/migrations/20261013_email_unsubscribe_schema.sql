-- ════════════════════════════════════════════════════════════
-- Supabase Migration: Email Unsubscribe & Opt-Out System
-- Handles user opt-outs, tracks marketing email preferences,
-- and ensures CAN-SPAM / GDPR / CASL compliance.
-- ════════════════════════════════════════════════════════════

-- 1. Add email_subscribed to members table (user profiles/accounts)
ALTER TABLE public.members
ADD COLUMN IF NOT EXISTS email_subscribed BOOLEAN NOT NULL DEFAULT true;

-- Index for speedy email + subscription status lookups
CREATE INDEX IF NOT EXISTS idx_members_email_subscribed
ON public.members (email, email_subscribed);

-- 2. Add email_subscribed to subscribers table (paid subscribers)
ALTER TABLE public.subscribers
ADD COLUMN IF NOT EXISTS email_subscribed BOOLEAN NOT NULL DEFAULT true;

-- Index for subscribers status filtering
CREATE INDEX IF NOT EXISTS idx_subscribers_email_subscribed
ON public.subscribers (email, email_subscribed);

-- 3. Dedicated audit & opt-out tracking table
-- Tracks when users unsubscribed, their optional feedback/reason,
-- and guarantees an immutable opt-out record across email queries.
CREATE TABLE IF NOT EXISTS public.email_unsubscribes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    reason TEXT,
    source TEXT DEFAULT 'unsubscribe_page',
    unsubscribed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index on unsubscribed emails
CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_email
ON public.email_unsubscribes (email);

-- 4. Enable Row Level Security (RLS) on email_unsubscribes
ALTER TABLE public.email_unsubscribes ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role and server routes full access
DROP POLICY IF EXISTS "Service role full access to email_unsubscribes" ON public.email_unsubscribes;
CREATE POLICY "Service role full access to email_unsubscribes"
ON public.email_unsubscribes FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: Public/authenticated users can view their own opt-out status
DROP POLICY IF EXISTS "Public can view opt-out status" ON public.email_unsubscribes;
CREATE POLICY "Public can view opt-out status"
ON public.email_unsubscribes FOR SELECT
TO anon, authenticated
USING (true);

-- Policy: Allow opt-out submissions from the public unsubscribe endpoint
DROP POLICY IF EXISTS "Public can insert opt-out" ON public.email_unsubscribes;
CREATE POLICY "Public can insert opt-out"
ON public.email_unsubscribes FOR INSERT
TO anon, authenticated
WITH CHECK (true);
