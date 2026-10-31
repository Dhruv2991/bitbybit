-- Rollback Migration: 20261102_expire_notifications_rollback.sql
-- Restores Week 16 status to active and reenables announcement

UPDATE public.weekly_challenges
SET status = 'active'
WHERE title = 'Week 16';

UPDATE public.app_config
SET value = 'true'
WHERE key = 'announcement_active';

