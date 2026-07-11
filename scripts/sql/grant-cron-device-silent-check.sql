-- One-off grant: allow the scoped n8n PyraCRM_Cron API key to call the new
-- device-silent-check cron endpoint (V1.1-C, 2026-07-11).
-- Idempotent: the @> guard makes re-runs no-ops.
UPDATE pyra_api_keys
SET permissions = permissions || '["cron.device-silent-check"]'::jsonb
WHERE name = 'n8n PyraCRM_Cron'
  AND is_active = true
  AND NOT permissions @> '["cron.device-silent-check"]'::jsonb;
