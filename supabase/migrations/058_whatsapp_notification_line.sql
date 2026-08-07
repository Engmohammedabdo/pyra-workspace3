-- ────────────────────────────────────────────────────────────────────────────
-- Migration 058 — Explicit WhatsApp notification line
--
-- Phase:        hotfix (2026-08-06 production-notification outage)
-- Author:       abdou
-- Date:         2026-08-07
-- Reversible:   YES (rollback hints inline below)
-- Touches data: YES (designates exactly one existing row — expected 1 UPDATE)
-- Risk tier:    2 (touches existing data — guarded, see idempotency contract)
--
-- Purpose:
--   `sendWhatsAppToUser` (lib/notifications/whatsapp.ts) chose its sender with
--   `ORDER BY last_connected_at DESC NULLS LAST LIMIT 1`. That made the sender
--   an accident of registration order: when the sales shared-inbox work
--   registered a second line (`selver`) on 2026-08-06 16:01, it instantly
--   outranked the company line `pyraai` (whose last_connected_at was NULL) and
--   every internal production notification — task assigned / submitted /
--   revision requested / approved / deadline + attendance reminders — started
--   routing through it. The app's Evolution key is not authorized for that
--   line (verified: GET /instance/connectionState/selver → 401, while pyraai →
--   200 open), so every send failed, and the helper's graceful-degradation
--   contract swallowed the failure silently.
--
--   This makes the notification sender an EXPLICIT, durable designation
--   instead of a recency race. The picker still falls back to recency when no
--   line is designated, so a database that has not been backfilled keeps
--   sending rather than going silent.
--
-- Idempotency contract:
--   ADD COLUMN IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT EXISTS are safe to
--   re-apply on (a) a fresh bootstrap database and (b) live production after
--   the first apply. The backfill is guarded by `NOT EXISTS (… WHERE
--   is_notification_line)` so a re-apply can never override a designation an
--   admin moved to a different line afterwards.
--
-- Pre-flight checklist (per docs/MIGRATIONS.md §4):
--   [x] `pnpm db:check-drift` before writing this file
--   [x] `pnpm db:backup pre-058` — blocked by the known missing
--       SUPABASE_DB_URL (Coolify secret), the same standing gap as every
--       prior migration in this repo. Proceeded because the DDL is additive
--       (one boolean, DEFAULT false) and the only data write sets that new
--       column on a single row — nothing pre-existing is overwritten.
--   [x] IF NOT EXISTS guards on every DDL statement
--   [x] Backfill is idempotent (guarded by NOT EXISTS on the flag itself)
--   [x] Manual verification query ready (see below)
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

ALTER TABLE pyra_whatsapp_instances
  ADD COLUMN IF NOT EXISTS is_notification_line boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN pyra_whatsapp_instances.is_notification_line IS
  'The line internal employee notifications are sent FROM (sendWhatsAppToUser). At most one row may be true. Independent of the sales inbox lines.';

-- At most ONE designated line. A partial unique index over a constant is the
-- standard "single flagged row" guard: only rows with the flag set take part,
-- so unlimited rows may carry false.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_instances_one_notification_line
  ON pyra_whatsapp_instances ((true))
  WHERE is_notification_line;


-- ─── DATA BACKFILL ──────────────────────────────────────────────────────────

-- Designate the company line that carried these notifications successfully
-- from 2026-07-03 to 2026-08-03 (36 delivered production notifications on
-- `pyraai`, per pyra_whatsapp_messages). Guarded twice:
--   • `NOT is_notification_line`      — no pointless rewrite on re-apply
--   • `NOT EXISTS (… WHERE flag)`     — never steal the designation from a
--                                       line an admin chose later
UPDATE pyra_whatsapp_instances
SET    is_notification_line = true,
       updated_at           = NOW()
WHERE  instance_name = 'pyraai'
  AND  NOT is_notification_line
  AND  NOT EXISTS (
         SELECT 1 FROM pyra_whatsapp_instances WHERE is_notification_line
       );


-- ─── VERIFICATION (run manually after apply) ───────────────────────────────

-- 1. Column exists with the right type/default/nullability:
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'pyra_whatsapp_instances'
--     AND column_name = 'is_notification_line';
--
-- 2. Exactly one designated line, and it is the company line:
--   SELECT instance_name, phone_number, status, is_notification_line
--   FROM pyra_whatsapp_instances
--   ORDER BY is_notification_line DESC, instance_name;
--   -- expect exactly one row with is_notification_line = true → 'pyraai'
--
-- 3. The uniqueness guard actually bites (expect a unique-violation error):
--   UPDATE pyra_whatsapp_instances SET is_notification_line = true
--   WHERE instance_name = 'selver';
--   -- ROLL THIS BACK / re-set to false if you run it.


-- ─── DOWN (informational — NOT executed by any tool) ───────────────────────

-- Forward-only. To revert, write a new migration reversing the DDL below.
-- NOTE: dropping the column restores the recency race that caused the
-- 2026-08-06 outage — do not drop it without replacing the selection rule in
-- lib/notifications/whatsapp.ts first.
--
-- -- DROP INDEX IF EXISTS idx_wa_instances_one_notification_line;
-- -- ALTER TABLE pyra_whatsapp_instances DROP COLUMN IF EXISTS is_notification_line;
