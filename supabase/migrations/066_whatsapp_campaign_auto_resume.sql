-- ────────────────────────────────────────────────────────────────────────────
-- Migration 066 — Campaign auto-resume flag
--
-- Phase:        lead-reactivation programme (2026-09-04)
-- Author:       claude
-- Date:         2026-09-04
-- Reversible:   YES (DROP COLUMN — see DOWN)
-- Touches data: NO (new column, DEFAULT false)
-- Risk tier:    1 (additive; the default keeps every existing row manual)
--
-- Purpose:
--   A campaign paces itself to a daily cap, so a 250-contact list needs about
--   seven separate runs. Until now the ONLY thing that could start a run was
--   the Send button, which meant ~50 manual presses spread across seven
--   campaigns and seven days, each one inside that line's own two-to-three
--   hour window. Nobody was going to do that, and a campaign that stops
--   because the operator was in a meeting is indistinguishable from one that
--   stopped because it was broken.
--
--   This flag is what lets the drain cron continue a campaign a human already
--   started, without ever starting one on its own. The distinction is the
--   whole point:
--     • Starting outreach to hundreds of strangers is a human decision, made
--       once, per campaign, by pressing Send.
--     • Continuing that same campaign tomorrow inside the same window, under
--       the same cap, to the same audience, is bookkeeping.
--   `false` (the default) therefore means "never auto-started and never will
--   be"; the cron skips those rows entirely. The Send path sets it true, and
--   the dashboard's stop control sets it back to false so a human can always
--   take the campaign off the schedule.
--
-- Idempotency contract:
--   ADD COLUMN IF NOT EXISTS with a DEFAULT. Re-applying is a no-op and can
--   never flip an existing campaign's value.
--
-- Pre-flight checklist (per docs/MIGRATIONS.md §4):
--   [x] `pnpm db:check-drift` clean before writing (65 tracked)
--   [x] `pnpm db:backup pre-066` — blocked by the standing missing
--       SUPABASE_DB_URL. Proceeded: additive column, no data rewritten.
--   [x] IF NOT EXISTS guard
--   [x] Verification query ready (see below)
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

ALTER TABLE pyra_whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS auto_resume boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN pyra_whatsapp_campaigns.auto_resume IS
  'True once a human has started this campaign, which lets the drain cron continue it on later days inside its line window and daily cap. The cron NEVER starts a campaign that is still false — beginning outreach is a human decision, continuing it is bookkeeping. The dashboard stop control sets this back to false.';

-- The cron's hot query: campaigns eligible to be resumed.
CREATE INDEX IF NOT EXISTS idx_wa_campaigns_auto_resume
  ON pyra_whatsapp_campaigns (status, auto_resume)
  WHERE auto_resume;


-- ─── VERIFICATION (run manually after apply) ───────────────────────────────

-- 1. Column exists, NOT NULL, defaults to false:
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'pyra_whatsapp_campaigns' AND column_name = 'auto_resume';
--
-- 2. Nothing is armed yet — every seeded campaign is still fully manual:
--   SELECT segment_key, status, auto_resume FROM pyra_whatsapp_campaigns
--   ORDER BY segment_key;
--   -- expect auto_resume = false on all 7 rows


-- ─── DOWN (informational — NOT executed by any tool) ───────────────────────

-- Forward-only. Dropping the column disables automatic resumption entirely,
-- which is safe: every run then requires a human press again.
--
-- -- DROP INDEX  IF EXISTS idx_wa_campaigns_auto_resume;
-- -- ALTER TABLE pyra_whatsapp_campaigns DROP COLUMN IF EXISTS auto_resume;
