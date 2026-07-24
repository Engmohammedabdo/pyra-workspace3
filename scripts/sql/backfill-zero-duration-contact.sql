-- Measurement query for the "0-second dial counted as contact" backfill
-- (calls-urgent-fixes Task 2, 2026-07-25). Read-only, idempotent — safe to
-- re-run at any time to check current corruption state.
--
-- This is a REFERENCE / audit query only. It does NOT mutate anything.
-- All writes (DELETE on pyra_lead_activities, UPDATE on pyra_sales_leads)
-- happen exclusively via `npx tsx scripts/backfill-zero-duration-contact.ts
-- --apply`, which snapshots every row to backups/ BEFORE writing anything —
-- do not hand-roll the write side of this from copies of the CTEs below.
--
-- Run with: pnpm db:query scripts/sql/backfill-zero-duration-contact.sql
--
-- Reconstruction rule (Abdou, 2026-07-25 — full cleanup):
--   Delete every `call_logged` activity logged for a 0-second call.
--   For every lead touched by the bug, last_contact_at becomes
--   MAX(called_at) over that lead's GENUINE calls
--   (direction <> 'missed' AND duration_seconds > 0), or NULL if none exist.

WITH activity_leads AS (
  SELECT DISTINCT lead_id
  FROM pyra_lead_activities
  WHERE activity_type = 'call_logged' AND (metadata->>'duration_seconds')::int = 0
),
poisoned_leads AS (
  SELECT DISTINCT l.id AS lead_id
  FROM pyra_sales_leads l
  JOIN pyra_agent_calls c ON c.lead_id = l.id
  WHERE c.duration_seconds = 0 AND c.direction <> 'missed'
    AND l.last_contact_at IS NOT NULL
    AND date_trunc('minute', l.last_contact_at) = date_trunc('minute', c.called_at)
),
affected AS (
  SELECT lead_id FROM activity_leads
  UNION
  SELECT lead_id FROM poisoned_leads
),
detail AS (
  SELECT
    l.id AS lead_id,
    l.last_contact_at AS current_last_contact_at,
    (
      SELECT max(c2.called_at)
      FROM pyra_agent_calls c2
      WHERE c2.lead_id = l.id AND c2.duration_seconds > 0 AND c2.direction <> 'missed'
    ) AS genuine_max
  FROM pyra_sales_leads l
  JOIN affected a ON a.lead_id = l.id
)
SELECT
  (SELECT count(*) FROM pyra_lead_activities
     WHERE activity_type = 'call_logged' AND (metadata->>'duration_seconds')::int = 0
  ) AS fake_activities,
  (SELECT count(*) FROM poisoned_leads) AS poisoned_leads,
  (SELECT count(*) FROM affected) AS affected_leads_candidate_set,
  count(*) FILTER (
    WHERE genuine_max IS DISTINCT FROM current_last_contact_at
  ) AS leads_needing_update,
  count(*) FILTER (
    WHERE genuine_max IS NULL AND genuine_max IS DISTINCT FROM current_last_contact_at
  ) AS would_become_null,
  count(*) FILTER (
    WHERE genuine_max IS NOT NULL AND genuine_max IS DISTINCT FROM current_last_contact_at
  ) AS would_move_to_earlier_timestamp,
  count(*) FILTER (
    WHERE genuine_max IS NOT DISTINCT FROM current_last_contact_at
  ) AS already_correct_no_op
FROM detail;
