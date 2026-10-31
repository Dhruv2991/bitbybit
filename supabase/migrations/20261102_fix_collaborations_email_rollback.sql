-- Rollback Migration: 20261102_fix_collaborations_email_rollback.sql
-- Reverts collaborations email link back to previous Gmail compose URL

UPDATE public.collaborations_page
SET content = REPLACE(
  content,
  'mailto:teamcodelocked@gmail.com?subject=Partnership%20Inquiry%20-%20BitByBit',
  'https://mail.google.com/mail/?view=cm&fs=1&to=ddhruvgnayak@gmail.com'
),
updated_at = NOW()
WHERE content LIKE '%mailto:teamcodelocked@gmail.com?subject=Partnership%20Inquiry%20-%20BitByBit%';

