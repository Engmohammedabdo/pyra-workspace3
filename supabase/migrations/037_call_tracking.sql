-- 037_call_tracking.sql
-- Call tracking: per-agent SIM-call log synced from company phones.
-- Spec: docs/superpowers/specs/2026-07-10-call-tracking-design.md
-- Both tables are service-role-only (Gap #3 doctrine).

CREATE TABLE IF NOT EXISTS pyra_agent_calls (
  id               text PRIMARY KEY,
  agent_username   text NOT NULL,
  phone_raw        text NOT NULL,
  phone_normalized text NOT NULL,
  direction        text NOT NULL CHECK (direction IN ('outgoing','incoming','missed')),
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  called_at        timestamptz NOT NULL,
  device_call_key  text NOT NULL,
  lead_id          text NULL REFERENCES pyra_sales_leads(id) ON DELETE SET NULL,
  activity_id      text NULL,
  match_status     text NOT NULL CHECK (match_status IN ('matched','unmatched','ignored')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pyra_agent_calls_agent_key_uniq UNIQUE (agent_username, device_call_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_calls_agent_called
  ON pyra_agent_calls (agent_username, called_at);
CREATE INDEX IF NOT EXISTS idx_agent_calls_phone
  ON pyra_agent_calls (phone_normalized);
CREATE INDEX IF NOT EXISTS idx_agent_calls_lead
  ON pyra_agent_calls (lead_id);

CREATE TABLE IF NOT EXISTS pyra_ignored_numbers (
  id               text PRIMARY KEY,
  agent_username   text NOT NULL,
  phone_normalized text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pyra_ignored_numbers_uniq UNIQUE (agent_username, phone_normalized)
);

REVOKE ALL PRIVILEGES ON TABLE pyra_agent_calls FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE pyra_ignored_numbers FROM anon, authenticated;
