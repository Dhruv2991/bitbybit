-- Migration: 20261102_fix_collaborations_email.sql
-- Fixes mismatch where displayed email is teamcodelocked@gmail.com but the link opened ddhruvgnayak@gmail.com

UPDATE public.collaborations_page
SET content = REPLACE(
  REPLACE(
    content,
    'https://mail.google.com/mail/?view=cm&fs=1&to=ddhruvgnayak@gmail.com',
    'mailto:teamcodelocked@gmail.com?subject=Partnership%20Inquiry%20-%20BitByBit'
  ),
  'https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=ddhruvgnayak@gmail.com',
  'mailto:teamcodelocked@gmail.com?subject=Partnership%20Inquiry%20-%20BitByBit'
),
updated_at = NOW()
WHERE content LIKE '%ddhruvgnayak@gmail.com%';

