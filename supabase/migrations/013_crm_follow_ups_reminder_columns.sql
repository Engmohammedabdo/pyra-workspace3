-- ============================================================
-- 013_crm_follow_ups_reminder_columns.sql
-- ============================================================
-- Phase 11 prep — closes the schema gap that Phase 6 left open.
--
-- Background:
--   Phase 6 shipped the follow-ups feature but the live
--   pyra_sales_follow_ups table was missing reminder_at +
--   whatsapp_reminder_sent (per Q-DB-001 baseline). The follow-ups
--   API route at app/api/crm/follow-ups/route.ts:105-108 has explicit
--   code comments acknowledging the gap — accepting reminder_at +
--   send_whatsapp_reminder in the body but DROPPING them at insert
--   time. Phase 11 closes this gap by adding the columns.
--
-- Columns added:
--
--   reminder_at TIMESTAMPTZ NULL
--     When the WhatsApp reminder should fire. Caller-supplied via
--     POST /api/crm/follow-ups body, or defaulted to (due_at - 30min)
--     by the API per PRD §03 line 434.
--
--   whatsapp_reminder_sent BOOLEAN NOT NULL DEFAULT false
--     Idempotency flag. The cron endpoint sets it to true after a
--     successful Evolution send, preventing re-fire on subsequent
--     5-minute ticks. Default false is required so existing rows
--     (created before this migration) become eligible for processing
--     once they receive a reminder_at value.
--
--   send_whatsapp_reminder BOOLEAN NOT NULL DEFAULT true
--     User-facing toggle (PRD §03 line 437). Default true matches
--     the "opt-out" UX — most follow-ups want a reminder.
--
-- Index added:
--
--   idx_follow_ups_pending_reminders ON (reminder_at)
--   WHERE status = 'pending'
--     AND whatsapp_reminder_sent = false
--     AND send_whatsapp_reminder = true
--
--   Partial index that matches the cron query predicate exactly.
--   In production this index will stay small (only currently-pending,
--   not-yet-sent, opt-in rows) so the every-5-minute cron scan is
--   essentially O(active reminders).
--
-- Backward compat:
--   - All 3 columns added with safe defaults; existing rows unaffected.
--   - The follow-ups API previously dropped reminder_at silently;
--     once Commit 2 lands and starts persisting, behaviour aligns
--     with what the body already advertised.
--   - Idempotent — safe to re-run (ADD COLUMN IF NOT EXISTS +
--     CREATE INDEX IF NOT EXISTS).

ALTER TABLE pyra_sales_follow_ups
  ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ NULL;

ALTER TABLE pyra_sales_follow_ups
  ADD COLUMN IF NOT EXISTS whatsapp_reminder_sent BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE pyra_sales_follow_ups
  ADD COLUMN IF NOT EXISTS send_whatsapp_reminder BOOLEAN NOT NULL DEFAULT true;

-- Partial index — only rows the cron actually cares about.
CREATE INDEX IF NOT EXISTS idx_follow_ups_pending_reminders
  ON pyra_sales_follow_ups (reminder_at)
  WHERE status = 'pending'
    AND whatsapp_reminder_sent = false
    AND send_whatsapp_reminder = true;

-- ============================================================
-- Verification (run after migration):
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'pyra_sales_follow_ups'
--     AND column_name IN ('reminder_at', 'whatsapp_reminder_sent',
--                         'send_whatsapp_reminder')
--   ORDER BY column_name;
-- Expected 3 rows:
--   reminder_at             | timestamp with time zone | YES | NULL
--   send_whatsapp_reminder  | boolean                  | NO  | true
--   whatsapp_reminder_sent  | boolean                  | NO  | false
--
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'pyra_sales_follow_ups'
--     AND indexname = 'idx_follow_ups_pending_reminders';
-- Expected: 1 row.
-- ============================================================
