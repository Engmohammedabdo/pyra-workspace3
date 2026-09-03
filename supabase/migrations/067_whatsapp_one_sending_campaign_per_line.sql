-- ────────────────────────────────────────────────────────────────────────────
-- Migration 067 — At most one SENDING campaign per WhatsApp line
--
-- Phase:        lead-reactivation programme (2026-09-04)
-- Author:       claude
-- Date:         2026-09-04
-- Reversible:   YES (DROP INDEX — see DOWN)
-- Touches data: NO (index only; verified 0 rows currently 'sending')
-- Risk tier:    2 (adds a constraint that can reject writes — read below)
--
-- Purpose:
--   The daily cap is a PER-LINE control — migration 063's own column comment
--   says so: "Enforced against the line's sends for today, not the campaign's
--   — several campaigns can share a line." But the cap was read once per run,
--   as a snapshot, and reserved nothing. Three campaigns share `yellow`
--   (s5/s6/s7, 642 of the 798 queued contacts). The first drain-cron tick
--   after the yellow window opens would start all three: each reads
--   sentToday=0, each is granted the full 40, each launches its own paced
--   drain against ONE number. 120 messages against a cap the code computed as
--   40, from three uncoordinated streams — on the line carrying the entire
--   cold audience. The same shape hits pyraai (s1+s2) and selver (s3+s4).
--
--   The application now refuses to start a campaign on a line that already has
--   one sending, but that check is a read followed by a write with network
--   round trips in between: two callers can both read "free" and both claim.
--   This index makes the invariant impossible to violate no matter how many
--   triggers race — the second claim fails with a unique violation, which the
--   caller translates into an ordinary "line busy" refusal.
--
--   This is the same "single flagged row" guard migration 058 used to make the
--   notification line an explicit designation rather than a race.
--
-- Consequence to know before changing sending code:
--   ANY update that sets status='sending' can now fail with 23505. That is the
--   constraint working. Callers must handle it as a refusal, never as a crash.
--
-- Idempotency contract:
--   CREATE UNIQUE INDEX IF NOT EXISTS. Verified before writing that no row is
--   currently 'sending' (all 7 campaigns are 'draft'), so the index builds
--   cleanly on live data.
--
-- Pre-flight checklist (per docs/MIGRATIONS.md §4):
--   [x] `pnpm db:check-drift` clean before writing (66 tracked)
--   [x] `pnpm db:backup pre-067` — blocked by the standing missing
--       SUPABASE_DB_URL. Proceeded: index only, no data written.
--   [x] Confirmed 0 existing rows would violate the new index
--   [x] IF NOT EXISTS guard
--   [x] Verification queries ready (see below)
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

-- Only rows with status='sending' participate, so any number of campaigns may
-- sit 'draft' / 'paused' / 'completed' on the same line.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_campaigns_one_sending_per_line
  ON pyra_whatsapp_campaigns (instance_name)
  WHERE status = 'sending';

COMMENT ON INDEX idx_wa_campaigns_one_sending_per_line IS
  'At most one campaign may be actively sending on a given line. Without it, concurrent campaigns on one line each get the full daily_cap and the per-line cap is multiplied by the number of campaigns sharing that line.';


-- ─── VERIFICATION (run manually after apply) ───────────────────────────────

-- 1. The index exists and is partial + unique:
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'pyra_whatsapp_campaigns'
--     AND indexname = 'idx_wa_campaigns_one_sending_per_line';
--
-- 2. It actually bites (expect a unique violation on the SECOND update):
--   UPDATE pyra_whatsapp_campaigns SET status='sending' WHERE segment_key='s5_short_convo';
--   UPDATE pyra_whatsapp_campaigns SET status='sending' WHERE segment_key='s6_no_answer';
--   -- ^ must fail 23505; then roll both back:
--   UPDATE pyra_whatsapp_campaigns SET status='draft'
--   WHERE segment_key IN ('s5_short_convo','s6_no_answer');
--
-- 3. Nothing is stuck sending:
--   SELECT segment_key, instance_name, status FROM pyra_whatsapp_campaigns
--   WHERE status = 'sending';


-- ─── DOWN (informational — NOT executed by any tool) ───────────────────────

-- Forward-only. Dropping this index restores the ability for several campaigns
-- on one line to each claim the full daily cap — do not drop it without first
-- replacing the guarantee in lib/whatsapp/run-campaign.ts.
--
-- -- DROP INDEX IF EXISTS idx_wa_campaigns_one_sending_per_line;
