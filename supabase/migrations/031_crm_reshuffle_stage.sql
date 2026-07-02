-- ────────────────────────────────────────────────────────────────────────────
-- Migration 031 — CRM "ريشفل" (reshuffle) pipeline stage
--
-- Adds a leading pipeline column (sort_order 0, before "استفسار جديد") used as a
-- reassignment/handover holding area: the admin moves a lead here when handing it
-- from one sales rep to another, so reshuffled leads are visible + countable
-- (filter the pipeline by owner to count per employee).
--
-- Treated as a normal ACTIVE stage (counts in pipeline value + reports) with a
-- low default win_probability (5%). All the code-side constants live in
-- lib/constants/statuses.ts (PIPELINE_STAGE_IDS/ORDER/ACTIVE + labels +
-- STAGE_DEFAULT_WIN_PROBABILITY) and the color maps.
--
-- Idempotent (ON CONFLICT DO NOTHING). Risk tier 1 (additive seed row).
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO pyra_sales_pipeline_stages (id, name, name_ar, color, sort_order, is_default)
VALUES ('stg_reshuffle', 'Reshuffle', 'ريشفل', 'violet', 0, false)
ON CONFLICT (id) DO NOTHING;

-- -- DOWN (informational only — forward-only migration system):
-- -- DELETE FROM pyra_sales_pipeline_stages WHERE id = 'stg_reshuffle';
-- --   (only safe when no lead has stage_id = 'stg_reshuffle')
