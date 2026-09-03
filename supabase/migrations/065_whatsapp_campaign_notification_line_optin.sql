-- ────────────────────────────────────────────────────────────────────────────
-- Migration 065 — Explicit opt-in for broadcasting on the notification line
--
-- Phase:        lead-reactivation programme (2026-09-03)
-- Author:       claude
-- Date:         2026-09-03
-- Reversible:   YES (DROP COLUMN — see DOWN)
-- Touches data: NO (new column, DEFAULT false)
-- Risk tier:    2 (widens a deliberately closed door — read the note)
--
-- Purpose:
--   Migration 063 + campaign-policy.ts refuse the notification line as a
--   campaign sender outright, because a ban on it silences every internal
--   employee notification (the 2026-08-06 outage). The owner's plan, however,
--   rotates across ALL THREE lines and gives the company line the two WARM
--   segments — 64 leads who have already held a real phone conversation with
--   us, where the chance of a spam report is close to zero and the replies
--   protect the line's outbound:inbound ratio rather than hurting it.
--
--   That is a legitimate, bounded exception, and this column is what makes it
--   DELIBERATE rather than accidental. The distinction that matters:
--     • The old defect was a silent FALLBACK — `?? 'pyraai'` — that could pick
--       the notification line for a cold blast nobody intended.
--     • This is a per-campaign flag an admin must set, on a campaign that also
--       names the line explicitly and carries its own low daily cap.
--   `pickCampaignSender` still refuses by default; only a campaign row with
--   this flag set may pass `allowNotificationLine`.
--
--   Do NOT set it on a campaign built from cold segments. The protection it
--   relaxes is real; what makes the warm case safe is the audience, not the
--   flag.
--
-- Idempotency contract:
--   ADD COLUMN IF NOT EXISTS with a DEFAULT. Re-applying is a no-op and can
--   never flip an existing campaign's value.
--
-- Pre-flight checklist (per docs/MIGRATIONS.md §4):
--   [x] `pnpm db:check-drift` clean before writing (64 tracked)
--   [x] `pnpm db:backup pre-065` — blocked by the standing missing
--       SUPABASE_DB_URL. Proceeded: additive column, no data rewritten.
--   [x] IF NOT EXISTS guard
--   [x] Verification query ready (see below)
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

ALTER TABLE pyra_whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS allow_notification_line boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN pyra_whatsapp_campaigns.allow_notification_line IS
  'Deliberate, per-campaign permission to broadcast from the notification line. Default false, and the sender refuses that line unless this is true. Intended ONLY for small warm-audience campaigns; a cold blast from that line risks banning every internal notification.';


-- ─── VERIFICATION (run manually after apply) ───────────────────────────────

-- 1. Column exists, NOT NULL, defaults to false:
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'pyra_whatsapp_campaigns'
--     AND column_name = 'allow_notification_line';
--
-- 2. Nothing is opted in by accident:
--   SELECT id, name, instance_name, daily_cap, allow_notification_line
--   FROM pyra_whatsapp_campaigns WHERE allow_notification_line;
--   -- every row here must be a small, WARM-audience campaign


-- ─── DOWN (informational — NOT executed by any tool) ───────────────────────

-- Forward-only. Dropping this column re-closes the door entirely, which is
-- safe: pickCampaignSender's default is already refusal.
--
-- -- ALTER TABLE pyra_whatsapp_campaigns DROP COLUMN IF EXISTS allow_notification_line;
