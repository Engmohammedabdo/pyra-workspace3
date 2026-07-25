-- One-off grant: allow the scoped n8n PyraCRM_Cron API key to call
-- /api/cron/follow-ups-check-due (the sole writer of status='overdue').
-- Idempotent: the @> guard makes re-runs no-ops.
UPDATE pyra_api_keys
SET permissions = permissions || '["cron.follow-ups-check-due"]'::jsonb
WHERE name = 'n8n PyraCRM_Cron'
  AND is_active = true
  AND NOT permissions @> '["cron.follow-ups-check-due"]'::jsonb;
