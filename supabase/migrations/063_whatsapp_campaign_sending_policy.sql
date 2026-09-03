-- ────────────────────────────────────────────────────────────────────────────
-- Migration 063 — WhatsApp campaign sending policy
--
-- Phase:        lead-reactivation programme (2026-09-03)
-- Author:       claude
-- Date:         2026-09-03
-- Reversible:   YES (rollback hints inline below)
-- Touches data: YES (seeds the suppression list from already-disqualified
--               leads — insert-only, ON CONFLICT DO NOTHING)
-- Risk tier:    2 (additive DDL + one guarded backfill into a NEW table)
--
-- Purpose:
--   The broadcast sender (`campaigns/[id]/send`) had no way to say WHICH line
--   a campaign goes out on. It resolved one with
--       .eq('status','connected').limit(1)  →  instances?.[0] ?? 'pyraai'
--   an UNORDERED read with a literal fallback to the notification line. That
--   is the migration-058 defect again — the sender as an accident of row
--   order — but with a worse blast radius: a broadcast to cold numbers from
--   the notification line risks a WhatsApp ban on the single line every
--   internal employee notification is sent from.
--
--   It also had nowhere to record a daily cap, no link from a queued contact
--   back to its lead, no memory of which line already spoke to a lead, and no
--   opt-out list — so "لا شكراً" on one line did not stop the next one.
--
--   This migration adds the state those rules need. The rules themselves are
--   pure and unit-tested in lib/whatsapp/campaign-policy.ts.
--
-- Idempotency contract:
--   Every statement carries IF NOT EXISTS. The single backfill inserts into a
--   table created by this migration and is guarded by ON CONFLICT DO NOTHING,
--   so a re-apply is a no-op and can never resurrect a row an admin deleted.
--
-- Pre-flight checklist (per docs/MIGRATIONS.md §4):
--   [x] `pnpm db:check-drift` before writing this file → 62 tracked, no drift
--   [x] `pnpm db:backup pre-063` — blocked by the known missing SUPABASE_DB_URL
--       (Coolify secret), the same standing gap as every prior migration here.
--       Proceeded because the DDL is purely additive (new nullable columns, a
--       new table) and nothing pre-existing is read-modify-written.
--   [x] IF NOT EXISTS guards on every DDL statement
--   [x] Backfill is idempotent (ON CONFLICT DO NOTHING on the primary key)
--   [x] Manual verification queries ready (see below)
--   [x] Arabic literals live in this UTF-8 FILE, never inline on a shell
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

-- 1. The designated sending line. Deliberately NULLABLE: an existing campaign
--    has no line, and `pickCampaignSender` refuses to send rather than guess
--    one — which is the entire point. There is no default and must not be.
ALTER TABLE pyra_whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS instance_name character varying;

COMMENT ON COLUMN pyra_whatsapp_campaigns.instance_name IS
  'The pyra_whatsapp_instances.instance_name this campaign sends FROM. Required at send time — a campaign with no designated line is refused, never routed to a fallback. The notification line is rejected outright (see lib/whatsapp/campaign-policy.ts).';

-- 2. Per-campaign daily ceiling. 40 matches the warm-up ladder's first step
--    for the mature sales line; a young line is capped far lower by its own
--    campaign row.
ALTER TABLE pyra_whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS daily_cap integer NOT NULL DEFAULT 40;

COMMENT ON COLUMN pyra_whatsapp_campaigns.daily_cap IS
  'Maximum messages this campaign may send per Dubai day. Enforced against the line''s sends for today, not the campaign''s — several campaigns can share a line.';

-- 3. Which segment this campaign targets — traceability only, so a line that
--    starts collecting blocks can be tied back to the audience that did it.
ALTER TABLE pyra_whatsapp_campaigns
  ADD COLUMN IF NOT EXISTS segment_key character varying;

-- 4. Link a queued contact back to its lead: needed to write the sticky line
--    assignment, and to suppress by lead rather than only by phone string.
ALTER TABLE pyra_whatsapp_campaign_contacts
  ADD COLUMN IF NOT EXISTS lead_id character varying;

-- The send loop reads "pending contacts for this campaign" on every pass.
CREATE INDEX IF NOT EXISTS idx_wa_campaign_contacts_queue
  ON pyra_whatsapp_campaign_contacts (campaign_id, status);

-- 5. Sticky line per lead. Once a lead has heard from a number, every later
--    message must come from that same number: switching mid-thread reads as
--    spam infrastructure to WhatsApp AND as a scam to the person.
ALTER TABLE pyra_sales_leads
  ADD COLUMN IF NOT EXISTS whatsapp_instance character varying;

COMMENT ON COLUMN pyra_sales_leads.whatsapp_instance IS
  'The WhatsApp line that owns outbound contact with this lead. Set on first send and never rotated — a lead must never receive messages from two company numbers.';

-- 6. Global opt-out. Keyed by the SAME 9-digit suffix every other phone
--    comparison in the codebase uses (lib/utils/phone.ts phoneMatchKey), so a
--    number suppressed in one format is suppressed in all of them.
CREATE TABLE IF NOT EXISTS pyra_whatsapp_suppressions (
  phone_key   text PRIMARY KEY,
  phone_raw   text,
  reason      character varying NOT NULL,
  lead_id     character varying,
  created_by  character varying,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE pyra_whatsapp_suppressions IS
  'Never-contact list for outbound WhatsApp. GLOBAL across every line: someone who declined on one number declined for the company. phone_key = last 9 digits (phoneMatchKey).';


-- ─── DATA BACKFILL ──────────────────────────────────────────────────────────

-- Seed from leads already disqualified by a human. These people have said no
-- once; a campaign reaching them again is the single most likely source of a
-- spam report, which is what actually gets a line banned.
--
-- DISTINCT ON collapses duplicate lead cards that share a phone (18 such keys
-- exist in production). right(digits, 9) reproduces phoneMatchKey exactly,
-- including its behaviour on numbers shorter than 9 digits (returns them
-- whole). Leads with an unusable phone are skipped, not stored blank.
INSERT INTO pyra_whatsapp_suppressions (phone_key, phone_raw, reason, lead_id)
SELECT DISTINCT ON (RIGHT(REGEXP_REPLACE(l.phone, '[^0-9]', '', 'g'), 9))
       RIGHT(REGEXP_REPLACE(l.phone, '[^0-9]', '', 'g'), 9),
       l.phone,
       'disqualified',
       l.id
FROM   pyra_sales_leads l
JOIN   pyra_sales_pipeline_stages s ON s.id = l.stage_id
WHERE  s.name_ar IN ('غير مهتم', 'خسارة')
  AND  LENGTH(REGEXP_REPLACE(COALESCE(l.phone, ''), '[^0-9]', '', 'g')) > 0
ORDER  BY RIGHT(REGEXP_REPLACE(l.phone, '[^0-9]', '', 'g'), 9), l.updated_at DESC
ON CONFLICT (phone_key) DO NOTHING;


-- ─── VERIFICATION (run manually after apply) ───────────────────────────────

-- 1. New columns exist with the right nullability/defaults:
--   SELECT table_name, column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE (table_name = 'pyra_whatsapp_campaigns'          AND column_name IN ('instance_name','daily_cap','segment_key'))
--      OR (table_name = 'pyra_whatsapp_campaign_contacts'  AND column_name = 'lead_id')
--      OR (table_name = 'pyra_sales_leads'                 AND column_name = 'whatsapp_instance')
--   ORDER BY table_name, column_name;
--
-- 2. Suppression list seeded, and the ARABIC reason/stage matched (this is
--    the mojibake check — a corrupted write would have matched nothing):
--   SELECT count(*) FROM pyra_whatsapp_suppressions WHERE reason = 'disqualified';
--   -- expect ~66, the disqualified-lead count on 2026-09-03
--
-- 3. Every seeded key is a real digit suffix, never blank or punctuated:
--   SELECT count(*) FROM pyra_whatsapp_suppressions WHERE phone_key !~ '^[0-9]+$';
--   -- expect 0
--
-- 4. The queue index is used by the send loop's read:
--   EXPLAIN SELECT * FROM pyra_whatsapp_campaign_contacts
--   WHERE campaign_id = 'x' AND status = 'pending';


-- ─── DOWN (informational — NOT executed by any tool) ───────────────────────

-- Forward-only. To revert, write a new migration reversing the DDL below.
-- NOTE: dropping `instance_name` restores the unordered-fallback sender that
-- could broadcast from the notification line — do not drop it without first
-- replacing the selection rule in lib/whatsapp/campaign-policy.ts.
--
-- -- DROP TABLE  IF EXISTS pyra_whatsapp_suppressions;
-- -- DROP INDEX  IF EXISTS idx_wa_campaign_contacts_queue;
-- -- ALTER TABLE pyra_sales_leads                DROP COLUMN IF EXISTS whatsapp_instance;
-- -- ALTER TABLE pyra_whatsapp_campaign_contacts DROP COLUMN IF EXISTS lead_id;
-- -- ALTER TABLE pyra_whatsapp_campaigns         DROP COLUMN IF EXISTS segment_key;
-- -- ALTER TABLE pyra_whatsapp_campaigns         DROP COLUMN IF EXISTS daily_cap;
-- -- ALTER TABLE pyra_whatsapp_campaigns         DROP COLUMN IF EXISTS instance_name;
