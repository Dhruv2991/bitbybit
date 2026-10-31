-- Migration: 20261102_expire_notifications.sql
-- Expires past weekly challenges and deactivates expired announcements

-- 1. Expire past weekly challenges whose end date has passed
UPDATE public.weekly_challenges
SET status = 'ended'
WHERE status = 'active' AND ends_at < NOW();

-- 2. Deactivate expired announcement banner (Week 16) in app_config
UPDATE public.app_config
SET value = 'false'
WHERE key = 'announcement_active'
  AND EXISTS (
    SELECT 1 FROM public.app_config WHERE key = 'announcement_text' AND value ILIKE '%Week 16%'
  );

-- 3. Ensure announcement_expires_at config key exists
INSERT INTO public.app_config (key, value)
VALUES ('announcement_expires_at', '')
ON CONFLICT (key) DO NOTHING;

