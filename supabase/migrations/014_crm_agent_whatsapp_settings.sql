-- supabase/migrations/014_crm_agent_whatsapp_settings.sql
--
-- Phase 11 Refinement — agent-level WhatsApp routing config.
--
-- Purpose: decouple "which Evolution instance sends" from "which agent
-- receives". Before this table, the follow-up-reminders cron required
-- each agent to OWN a connected pyra_whatsapp_instances row (lookup at
-- app/api/cron/follow-up-reminders/route.ts:179). In production today,
-- only the admin (elharm) owns an instance, so reminders for sales
-- agents (sayed) silently skip the WA send.
--
-- The new model: admin maintains a per-agent row mapping
--   agent_username   → which Evolution INSTANCE sends from
--   agent_username   → which PHONE NUMBER to send to
-- A single instance (e.g. 'pyraai') can be the "shared sender" for
-- multiple agents, each routed to their own recipient phone.
--
-- Cron lookup hot path: agent_username + is_active=true → covered by
-- the partial index. UI list/CRUD is admin-only and infrequent — no
-- additional indexes needed.

CREATE TABLE IF NOT EXISTS pyra_agent_whatsapp_settings (
  id                    varchar PRIMARY KEY,
  agent_username        varchar NOT NULL UNIQUE
                          REFERENCES pyra_users(username) ON DELETE CASCADE,
  sender_instance_name  varchar NOT NULL,
  recipient_phone       varchar NOT NULL,
  is_active             boolean NOT NULL DEFAULT false,
  notes                 text,
  created_by            varchar,
  created_at            timestamptz NOT NULL DEFAULT NOW(),
  updated_at            timestamptz NOT NULL DEFAULT NOW()
);

-- Hot-path partial index for the follow-up-reminders cron lookup.
-- Filters to is_active=true so the index stays small even if the
-- table grows with disabled "draft" rows.
CREATE INDEX IF NOT EXISTS idx_agent_wa_settings_active_lookup
  ON pyra_agent_whatsapp_settings (agent_username)
  WHERE is_active = true;

-- updated_at trigger (mirrors the pattern used by other CRM tables).
CREATE OR REPLACE FUNCTION pyra_agent_whatsapp_settings_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pyra_agent_whatsapp_settings_updated_at_trigger
  ON pyra_agent_whatsapp_settings;
CREATE TRIGGER pyra_agent_whatsapp_settings_updated_at_trigger
  BEFORE UPDATE ON pyra_agent_whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION pyra_agent_whatsapp_settings_set_updated_at();

-- NOTE: no auto-migration of existing pyra_whatsapp_instances rows.
-- The 1 prod row (pyraai) is owned by elharm/admin, not a sales_agent.
-- Sayed's row will be created via the new Settings UI as the first
-- production row. See Q-R-6 for rationale.

COMMENT ON TABLE pyra_agent_whatsapp_settings IS
  'Per-agent routing config for follow-up-reminders cron. Decouples '
  'sender instance from recipient phone — one instance can serve '
  'multiple agents, each routed to their own WA number.';
COMMENT ON COLUMN pyra_agent_whatsapp_settings.sender_instance_name IS
  'Name of the pyra_whatsapp_instances row to send FROM. Soft-validated '
  'at INSERT/UPDATE time (admin can prepare row before instance is up); '
  'hard-validated at cron fire time (skip if not status=connected).';
COMMENT ON COLUMN pyra_agent_whatsapp_settings.recipient_phone IS
  'Normalized digits-only WA number to send TO (e.g. 971565799505). '
  'v1 accepts any non-empty string; v1.1 may add E.164 regex validation.';
COMMENT ON COLUMN pyra_agent_whatsapp_settings.is_active IS
  'Whether the cron should use this row. Default false — admin can '
  'prepare config without triggering. Flip to true when ready.';
