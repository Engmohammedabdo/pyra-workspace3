-- Migration 027: document expired-alert flag
--
-- Adds a one-shot idempotency flag so the daily expiry cron can send a single
-- "document expired" notification when a document's expiry_date passes, without
-- re-notifying on every subsequent run. Mirrors the existing
-- expiry_alert_30_sent / expiry_alert_7_sent pattern.
--
-- Risk tier 1 (additive, nullable-safe with NOT NULL DEFAULT false — existing
-- rows backfill to false, so already-expired docs get exactly one expired alert
-- on the next cron run).

ALTER TABLE pyra_employee_documents
  ADD COLUMN IF NOT EXISTS expiry_alert_expired_sent boolean NOT NULL DEFAULT false;

-- DOWN (informational only — forward-only migration policy):
-- -- ALTER TABLE pyra_employee_documents DROP COLUMN IF EXISTS expiry_alert_expired_sent;
