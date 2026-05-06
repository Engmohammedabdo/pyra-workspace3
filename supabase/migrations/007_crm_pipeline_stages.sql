-- =============================================
-- Migration 007: CRM Phase 1 — insert new 7-stage taxonomy
-- PRD ref: CRM-PRD/02-DATABASE-AND-MIGRATION.md crm_002_pipeline_stages.sql
-- Tier: 1 (additive — INSERT ... ON CONFLICT, idempotent)
-- Reversible: YES
-- Notes:
--   - Legacy 7 stage_* rows REMAIN until v1.1 cleanup. Phase 2 remap moves
--     all leads off them. After 30-day verification window, legacy rows can
--     be deleted (separate migration, separate approval).
-- =============================================

-- UP
INSERT INTO pyra_sales_pipeline_stages (id, name, name_ar, color, sort_order, is_default, created_at) VALUES
  ('stg_new_inquiry',     'new_inquiry',     'استفسار جديد',     'sky',     1, true,  now()),
  ('stg_discovery_call',  'discovery_call',  'مكالمة استكشافية', 'indigo',  2, false, now()),
  ('stg_proposal_sent',   'proposal_sent',   'تم إرسال العرض',   'amber',   3, false, now()),
  ('stg_negotiation',     'negotiation',     'تفاوض',            'orange',  4, false, now()),
  ('stg_contract_signed', 'contract_signed', 'تم توقيع العقد',   'emerald', 5, false, now()),
  ('stg_closed_won',      'closed_won',      'فوز بالصفقة',      'gold',    6, false, now()),
  ('stg_closed_lost',     'closed_lost',     'خسارة',            'stone',   7, false, now())
ON CONFLICT (id) DO UPDATE
SET name       = EXCLUDED.name,
    name_ar    = EXCLUDED.name_ar,
    color      = EXCLUDED.color,
    sort_order = EXCLUDED.sort_order,
    is_default = EXCLUDED.is_default;

-- The existing legacy `stage_*` rows have is_default=true on stage_new.
-- Setting is_default=true on stg_new_inquiry doesn't override that (no DB
-- constraint enforces single default). Application code must treat
-- stg_new_inquiry as canonical default once Phase 2 remap completes.

-- DOWN (rollback)
-- DELETE FROM pyra_sales_pipeline_stages WHERE id IN (
--   'stg_new_inquiry','stg_discovery_call','stg_proposal_sent',
--   'stg_negotiation','stg_contract_signed','stg_closed_won','stg_closed_lost'
-- );
