-- ═══════════════════════════════════════════════════════════════════════
-- MERGE section A: 5 duplicate lead pairs. Survivor is youssef's card in
-- every pair (owner's instruction, 2026-08-08).
--
-- Audit fixes applied (independent opus review, 2026-08-08):
--   1. archived_by = 'elharm'  — the app's own archive path always writes it
--   2. audit row created_by = NULL — the codebase convention for system rows
--      (all 2,116 idle_warning rows are NULL); 'admin' is not a real user and
--      would render literally on the timeline. Attribution moves to
--      metadata.merged_by.
--   3. last_contact_at is recomputed from the MOVED connected calls, not just
--      the two scalars — pair 502737508 otherwise understates its freshest
--      contact by a day (survivor's own value is NULL).
--   4. notes concatenation is NULL-safe (|| poisons the whole string on a
--      single NULL; concat/concat_ws treat NULL as empty).
--   5. dropped the dead COALESCE(…, '-infinity') weight and its cleanup
--      statement — Postgres GREATEST already ignores NULLs.
--
-- Rollback set — USE THE 20260810 FILES:
--   backups/merge-duplicate-leads-leads-20260810.json      (all 10 lead rows, every column)
--   backups/merge-duplicate-leads-activities-20260810.json (47 activity rows on the losers)
--   backups/merge-duplicate-leads-calls-20260810.json      (16 call rows on the losers)
--
-- The 20260808 files are STALE and must not be used: the 01:00 UTC idle cron
-- added an activity row, so they hold 46 of what are now 47. A snapshot short
-- of live means the merge moves a row that cannot be put back. Re-capture and
-- re-verify the counts immediately before running — that is not optional.
-- `backups/` is gitignored, so those three files are LOCAL to this machine.
-- If this script is run from a fresh clone, re-capture them first — and
-- re-verify the 46/16 counts, because every idle-cron day adds activity rows.
--
-- Run with:  pnpm db:query scripts/sql/merge-duplicate-leads-2026-08-08.sql
-- (it contains Arabic — it MUST go through the file runner, never inline)
--
-- Blast radius measured: activities and agent_calls ONLY (46 + 16). Zero rows
-- in follow_ups / attachments / labels / tasks / transfers / contracts /
-- quotes / whatsapp_conversations / whatsapp_messages on any of the 10 leads.
-- ═══════════════════════════════════════════════════════════════════════
BEGIN;

CREATE TEMP TABLE merge_map (loser text, survivor text, keep_name text, grp text) ON COMMIT DROP;
INSERT INTO merge_map VALUES
  -- The flagship. youssef's 7 calls were filed on cosette's card by the
  -- unordered-index bug; he was calling his own prospect. His name is also the
  -- better one ("milestones coffee" is lowercase and less specific).
  ('sl_njsQ6XfyPCOL_Z12', 'sl_LIEiSbMcadQDcS-Z', 'Milestones Coffee Abu Dhabi Mall', '025836444'),

  -- Identical names, same creation day. Nothing to choose between them.
  ('sl_xQ-uWsU-K2f5iTZ-', 'sl_oxMF_F0KKFyKsgTx', 'Dermalase Clinic',                 '043497880'),

  -- NAME UPGRADE: both cards were called "Customer Service" (one misspelled
  -- "Serivce"). That is a contact role, not a business. The real name was
  -- sitting in the survivor's own company field all along.
  ('sl_BJGLxKd6XriEJESd', 'sl_8JzNc2rTQabOO-GI', 'HADEF & PARTNERS',                 '044292999'),

  -- Same name, order reversed.
  ('sl_nleQ8Fr5qe_DZOuN', 'sl_c_JPlJ6NEhQxNvBa', 'Farhan — UniTrust Insurance',      '502737508'),

  -- NAME UPGRADE: survivor was "Customer Service" too, but its company field
  -- carries the real Arabic name — and the loser's "al mostagbal cleaning" is
  -- just a transliteration of it. Take the Arabic.
  ('sl_aQXUOzb1QYyd4LUB', 'sl_PxOwLygIjCd0tNYf', 'المستقبل الوردي للتنظيف',          '557973340');

-- ── 1. Move every child row from loser to survivor ────────────────────
UPDATE pyra_lead_activities  a SET lead_id = m.survivor FROM merge_map m WHERE a.lead_id = m.loser;
UPDATE pyra_sales_follow_ups f SET lead_id = m.survivor FROM merge_map m WHERE f.lead_id = m.loser;
UPDATE pyra_agent_calls      c SET lead_id = m.survivor FROM merge_map m WHERE c.lead_id = m.loser;

-- ── 2. Coalesce the survivor's own fields ─────────────────────────────
-- A merge keeps the best of BOTH cards. Without this the email on
-- 044292999 and the second rep's note on 557973340 would be destroyed.
-- GREATEST ignores NULLs, so a missing value on either side never wins.
UPDATE pyra_sales_leads s SET
  name            = m.keep_name,
  email           = COALESCE(s.email,     l.email),
  company         = COALESCE(s.company,   l.company),
  industry        = COALESCE(s.industry,  l.industry),
  notes           = CASE
                      WHEN s.notes IS NOT NULL AND l.notes IS NOT NULL
                           AND btrim(s.notes) <> btrim(l.notes)
                        THEN concat_ws(E'\n', s.notes,
                               concat('— ', l.assigned_to, ': ', l.notes))
                      ELSE COALESCE(s.notes, l.notes)
                    END,
  last_contact_at = GREATEST(s.last_contact_at, l.last_contact_at),
  win_probability = GREATEST(s.win_probability, l.win_probability),
  expected_value  = GREATEST(s.expected_value,  l.expected_value),
  updated_at      = now()
FROM merge_map m JOIN pyra_sales_leads l ON l.id = m.loser
WHERE s.id = m.survivor;

-- ── 2b. Fold the MOVED calls into last_contact_at ─────────────────────
-- A card CAN carry a connected call newer than its own last_contact_at, and
-- GREATEST can only move the date forward, so this is a safe net. The
-- predicate is isConnectedCall() from lib/calls/match.ts, verbatim —
-- direction <> 'missed' AND duration_seconds > 0.
--
-- MEASURED (dry run, 2026-08-08): a NO-OP on all five pairs — every pair's
-- newest connected call is equal to or older than the scalar GREATEST above.
-- The audit asked for this step citing pair 502737508, but that pair has ZERO
-- connected calls (all 3 are unanswered attempts, which are effort and never a
-- touch — see the locked calls decisions). What actually rescues 502737508 is
-- the scalar GREATEST in step 2: its survivor's last_contact_at IS NULL and it
-- inherits the loser's 2026-07-31. Kept anyway, because this script is the
-- template for the section B/C pairs where it may well bite.
UPDATE pyra_sales_leads s SET last_contact_at = GREATEST(s.last_contact_at, x.max_called)
FROM (
  SELECT c.lead_id, max(c.called_at) AS max_called
  FROM pyra_agent_calls c
  WHERE c.lead_id IN (SELECT survivor FROM merge_map)
    AND c.direction <> 'missed' AND c.duration_seconds > 0
  GROUP BY c.lead_id
) x
WHERE s.id = x.lead_id;

-- ── 3. Recompute next_follow_up from the survivor's open follow-ups ───
UPDATE pyra_sales_leads s SET next_follow_up = (
  SELECT min(f.due_at) FROM pyra_sales_follow_ups f
  WHERE f.lead_id = s.id AND f.status IN ('pending','overdue')
)
WHERE s.id IN (SELECT survivor FROM merge_map);

-- ── 4. Retire the loser ───────────────────────────────────────────────
-- phone = NULL is the load-bearing half. `buildLeadPhoneIndex`'s select in
-- calls/sync filters on `.not('phone','is',null)` and does NOT filter
-- archived_at — so archiving alone would leave the duplicate key colliding in
-- the matcher forever. Clearing the phone is what actually removes the
-- duplicate. The number lives on the survivor.
UPDATE pyra_sales_leads l SET
  archived_at = now(),
  archived_by = 'elharm',
  phone       = NULL,
  -- The date is derived, not hardcoded: this script was written 2026-08-08 but
  -- the merge waited for an evening when the reps were not mid-call, so a fixed
  -- date would have put a false day on a permanent note.
  notes       = concat_ws(E'\n', l.notes,
                  concat('دُمج في ', m.survivor, ' — ', m.grp,
                         ' (', to_char(now(), 'YYYY-MM-DD'), '). ',
                         'الرقم اتشال من الكارت ده عشان يخرج من مطابقة المكالمات.')),
  updated_at  = now()
FROM merge_map m WHERE l.id = m.loser;

-- ── 5. Audit row on each survivor ─────────────────────────────────────
-- activity_type 'note' with metadata.auto = true is this codebase's shape for
-- a system-generated timeline entry. created_by stays NULL like every other
-- system row; the human who ordered the merge is in metadata.merged_by.
INSERT INTO pyra_lead_activities (id, lead_id, activity_type, description, metadata, created_by)
SELECT 'la_merge_' || m.grp, m.survivor, 'note',
       'اتدمج كارت مكرر على نفس الرقم — كل المكالمات والنشاط اتنقلوا هنا.',
       jsonb_build_object('auto', true, 'source', 'lead_merge',
                          'merged_from', m.loser, 'phone_key', m.grp,
                          'merged_by', 'elharm', 'merged_at', now()),
       NULL
FROM merge_map m;

COMMIT;

-- ── verify ────────────────────────────────────────────────────────────
SELECT l.id, l.name, l.assigned_to, l.email, l.company, l.industry,
       l.last_contact_at::date AS last_contact, l.next_follow_up::date AS next_fu,
       (l.archived_at IS NOT NULL) AS archived, l.archived_by, l.phone,
       (SELECT count(*) FROM pyra_lead_activities a WHERE a.lead_id = l.id) AS acts,
       (SELECT count(*) FROM pyra_agent_calls c WHERE c.lead_id = l.id) AS calls,
       (SELECT count(*) FROM pyra_sales_follow_ups f WHERE f.lead_id = l.id) AS fus
FROM pyra_sales_leads l
WHERE l.id IN ('sl_njsQ6XfyPCOL_Z12','sl_LIEiSbMcadQDcS-Z','sl_xQ-uWsU-K2f5iTZ-','sl_oxMF_F0KKFyKsgTx',
               'sl_BJGLxKd6XriEJESd','sl_8JzNc2rTQabOO-GI','sl_nleQ8Fr5qe_DZOuN','sl_c_JPlJ6NEhQxNvBa',
               'sl_aQXUOzb1QYyd4LUB','sl_PxOwLygIjCd0tNYf')
ORDER BY l.phone NULLS LAST, l.id;
