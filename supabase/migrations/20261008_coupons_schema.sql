-- ════════════════════════════════════════════════════════════
-- Supabase Migration: Coupons Table & RLS Policies
-- Secure coupon code management system & pricing override feature
-- ════════════════════════════════════════════════════════════

-- 1. Create coupons Table
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE CHECK (code = upper(code)),
    discount_type TEXT NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percentage')),
    discount_value NUMERIC NOT NULL DEFAULT 160 CHECK (discount_value >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create index on coupon code for fast lookup
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons (code);

-- 3. Seed initial promo codes reducing base $199 price to $39
INSERT INTO public.coupons (code, discount_type, discount_value, is_active)
VALUES ('BITBYBIT160', 'fixed', 160, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.coupons (code, discount_type, discount_value, is_active)
VALUES ('SAVE160', 'fixed', 160, true)
ON CONFLICT (code) DO NOTHING;

-- 4. Enable Row Level Security
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Policy: Allow reading active coupons for checkout validation
DROP POLICY IF EXISTS "Public can read active coupons" ON public.coupons;
CREATE POLICY "Public can read active coupons"
ON public.coupons FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Policy: Admins have full access to select, insert, update, and delete coupons
DROP POLICY IF EXISTS "Admins full access to coupons" ON public.coupons;
CREATE POLICY "Admins full access to coupons"
ON public.coupons FOR ALL
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
