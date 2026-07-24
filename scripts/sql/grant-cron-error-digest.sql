-- One-off grant: allow the scoped n8n cron API key to call /api/cron/error-digest.
-- Idempotent: the @> guard makes re-runs no-ops.
UPDATE pyra_api_keys
SET permissions = permissions || '["cron.error-digest"]'::jsonb
WHERE name = 'n8n PyraCRM_Cron'
  AND is_active = true
  AND NOT permissions @> '["cron.error-digest"]'::jsonb;
