# 02 — Database Schema & Migration

> **CRITICAL**: This module touches **production data**. Read `00-README.md` § Pre-Build Inventory Queries first. Save baseline counts. Verify after every step.

---

## Schema Strategy

We **extend** existing tables rather than creating parallel ones. Specifically:

| Table | Action | Why |
|-------|--------|-----|
| `pyra_sales_leads` | **EXTEND** with new columns | Existing data preserved, no migration needed for existing rows |
| `pyra_sales_pipeline_stages` | **REPLACE** seed data only (no schema change) | Map old stages to new 7-stage taxonomy |
| `pyra_sales_labels` | **EXTEND** (add color discipline) | Already exists, just standardize |
| `pyra_lead_activities` | **EXTEND** with new activity types | Existing rows still work |
| `pyra_contracts` | **EXTEND** with `lead_id` FK | Critical link for "one lead, multiple contracts" model |
| `pyra_sales_follow_ups` | **VERIFY/EXTEND** | Exists per repo CLAUDE.md; confirm structure |
| `pyra_notifications` | **NO SCHEMA CHANGE** | Just new `type` values via `notify()` |
| `pyra_clients` | **NO CHANGE** | Optional portal — already supports `is_active`, `auth_user_id` |

**No new tables are created.** Every change extends existing structures.

---

## Phase 1 — Verify Existing Schema (READ-ONLY)

**Before any migration**, run these to confirm the existing schema matches what this PRD assumes. If ANY column shape differs, **stop and ask** (Q-DB-NNN in `06-OPEN-QUESTIONS.md`).

```sql
-- 1. Verify pyra_sales_leads structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'pyra_sales_leads'
ORDER BY ordinal_position;

-- Expected columns (from DATABASE-SCHEMA.md):
-- id, name, phone, email, company, source, stage_id, assigned_to,
-- client_id, notes, priority, last_contact_at, next_follow_up,
-- converted_at, is_converted, created_by, created_at, updated_at

-- 2. Verify pyra_lead_activities structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'pyra_lead_activities'
ORDER BY ordinal_position;

-- 3. Verify pyra_sales_pipeline_stages structure
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'pyra_sales_pipeline_stages';

-- 4. Verify pyra_sales_follow_ups exists
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'pyra_sales_follow_ups';
-- If table missing → Q-DB-001: should we create it or use pyra_lead_activities?

-- 5. Verify pyra_contracts (we'll add lead_id)
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'pyra_contracts';

-- 6. Inventory current stage data
SELECT * FROM pyra_sales_pipeline_stages ORDER BY sort_order;

-- 7. Check how many leads have null stage_id (orphans)
SELECT COUNT(*) FROM pyra_sales_leads WHERE stage_id IS NULL;
```

**Save outputs to `/CRM-PRD/baseline-schema.txt`. Do not proceed if any expected column is missing.**

---

## Phase 2 — Extend `pyra_sales_leads`

Add columns to support the unified Lead-as-Customer-Account model.

### Migration: `crm_001_extend_sales_leads.sql`

```sql
-- Migration: crm_001_extend_sales_leads
-- Reversible: YES (see DOWN section)
-- Idempotent: YES (uses IF NOT EXISTS)

-- UP
ALTER TABLE pyra_sales_leads
  ADD COLUMN IF NOT EXISTS lead_type VARCHAR(10) DEFAULT 'b2b' CHECK (lead_type IN ('b2b', 'b2c')),
  ADD COLUMN IF NOT EXISTS industry VARCHAR(100),
  ADD COLUMN IF NOT EXISTS deal_type VARCHAR(50),
  -- deal_type values: 'web_design', 'social_media_retainer', 'branding',
  --   'payer_ai', 'video_production', 'performance_ads', 'hybrid_package', 'other'
  ADD COLUMN IF NOT EXISTS expected_value NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_value_currency VARCHAR(3) DEFAULT 'AED',
  ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'one_time',
  -- billing_cycle: 'one_time', 'monthly', 'quarterly', 'annual'
  ADD COLUMN IF NOT EXISTS win_probability INTEGER DEFAULT 0
  -- 0-100, can be auto-calculated by stage or set manually
    CHECK (win_probability >= 0 AND win_probability <= 100),
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS contact_person VARCHAR(200),
  -- The named person on the customer side (e.g., "لمى الزعابي - مدير التسويق")
  ADD COLUMN IF NOT EXISTS contact_role VARCHAR(100),
  ADD COLUMN IF NOT EXISTS company_size VARCHAR(50),
  -- e.g., '1-10', '11-50', '51-200', '200+', or freeform
  ADD COLUMN IF NOT EXISTS decision_maker VARCHAR(200),
  ADD COLUMN IF NOT EXISTS budget_range VARCHAR(100),
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';
  -- For future use; do NOT build a builder UI in v1

-- Index for common filters
CREATE INDEX IF NOT EXISTS idx_leads_lead_type ON pyra_sales_leads(lead_type);
CREATE INDEX IF NOT EXISTS idx_leads_deal_type ON pyra_sales_leads(deal_type);
CREATE INDEX IF NOT EXISTS idx_leads_converted ON pyra_sales_leads(is_converted, stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_stage ON pyra_sales_leads(assigned_to, stage_id);
-- Composite index for the most common query: "my leads in stage X"

-- DOWN (rollback)
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS lead_type;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS industry;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS deal_type;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS expected_value;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS expected_value_currency;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS billing_cycle;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS win_probability;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS lost_reason;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS contact_person;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS contact_role;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS company_size;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS decision_maker;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS budget_range;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS custom_fields;
-- DROP INDEX IF EXISTS idx_leads_lead_type;
-- DROP INDEX IF EXISTS idx_leads_deal_type;
-- DROP INDEX IF EXISTS idx_leads_converted;
-- DROP INDEX IF EXISTS idx_leads_assigned_stage;
```

### Verification

```sql
-- 1. Row count unchanged
SELECT COUNT(*) FROM pyra_sales_leads;
-- Must equal baseline-inventory.txt #1

-- 2. New columns exist
SELECT column_name FROM information_schema.columns
WHERE table_name = 'pyra_sales_leads'
  AND column_name IN ('lead_type', 'industry', 'deal_type', 'expected_value',
                       'win_probability', 'contact_person', 'custom_fields');
-- Must return 7 rows

-- 3. Defaults applied
SELECT lead_type, COUNT(*) FROM pyra_sales_leads GROUP BY lead_type;
-- All existing rows should now have lead_type='b2b' (default)
```

---

## Phase 3 — Update Pipeline Stages

The new 7-stage taxonomy. Existing rows in `pyra_sales_pipeline_stages` may not match. Strategy: **insert new stages with new IDs, then remap leads**, then optionally clean up old stage rows.

### Migration: `crm_002_pipeline_stages.sql`

```sql
-- Migration: crm_002_pipeline_stages
-- WARNING: This migration MUST run before any leads are remapped (Phase 4).

-- UP

-- Step 1: Insert the new 7 stages (idempotent on name)
INSERT INTO pyra_sales_pipeline_stages (id, name, name_ar, color, sort_order, is_default, created_at)
VALUES
  ('stg_new_inquiry',     'new_inquiry',     'استفسار جديد',     'sky',     1, true,  NOW()),
  ('stg_discovery_call',  'discovery_call',  'مكالمة استكشافية', 'indigo',  2, false, NOW()),
  ('stg_proposal_sent',   'proposal_sent',   'تم إرسال العرض',   'amber',   3, false, NOW()),
  ('stg_negotiation',     'negotiation',     'تفاوض',            'orange',  4, false, NOW()),
  ('stg_contract_signed', 'contract_signed', 'تم توقيع العقد',   'emerald', 5, false, NOW()),
  ('stg_closed_won',      'closed_won',      'فوز بالصفقة',      'gold',    6, false, NOW()),
  ('stg_closed_lost',     'closed_lost',     'خسارة',            'stone',   7, false, NOW())
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  name_ar = EXCLUDED.name_ar,
  color = EXCLUDED.color,
  sort_order = EXCLUDED.sort_order,
  is_default = EXCLUDED.is_default;

-- DOWN
-- DELETE FROM pyra_sales_pipeline_stages WHERE id IN (
--   'stg_new_inquiry','stg_discovery_call','stg_proposal_sent',
--   'stg_negotiation','stg_contract_signed','stg_closed_won','stg_closed_lost'
-- );
```

### Verification

```sql
-- 1. New stages exist with correct order
SELECT id, name, name_ar, sort_order
FROM pyra_sales_pipeline_stages
WHERE id LIKE 'stg_%'
ORDER BY sort_order;
-- Must return 7 rows, sort_order 1-7

-- 2. Old stages still present (we did NOT delete them yet)
SELECT id, name FROM pyra_sales_pipeline_stages WHERE id NOT LIKE 'stg_%';
-- Save this list for Phase 4 mapping
```

> **STOP**: After Phase 3, do NOT delete old stages. Phase 4 will remap leads first.

---

## Phase 4 — Remap Existing Leads to New Stages (SIMPLIFIED)

> **NOTE (post-Q-DB-002 answer)**: Original PRD assumed we'd map old stages to new stages 1-to-1. **Abdou approved a simpler approach**: move all existing leads to `stg_new_inquiry`, except already-converted leads which go to `stg_closed_won`. Sales agents will manually re-stage their own leads after launch.
>
> This eliminates the riskiest migration in the project. **No mapping discovery needed.**

### Migration: `crm_003_remap_leads.sql` (FINAL — Tier 1 SAFE per Q-OPS-001)

```sql
-- Migration: crm_003_remap_leads (SIMPLIFIED)
-- Reversible: YES (legacy_stage_id preserved)
-- Safe: YES (deterministic, no guessing, no data loss)
-- Tier: 1 (additive — execute directly)

-- UP

-- Step 1: Add backup column to preserve original stage_id (for rollback safety)
ALTER TABLE pyra_sales_leads
  ADD COLUMN IF NOT EXISTS legacy_stage_id VARCHAR(50);

UPDATE pyra_sales_leads
SET legacy_stage_id = stage_id
WHERE legacy_stage_id IS NULL;

-- Step 2: Convert leads with already-converted=true → closed_won
UPDATE pyra_sales_leads
SET stage_id = 'stg_closed_won'
WHERE is_converted = true
  AND (stage_id IS NULL OR stage_id NOT LIKE 'stg_%');

-- Step 3: All other leads → new_inquiry (sales reps will re-stage manually)
UPDATE pyra_sales_leads
SET stage_id = 'stg_new_inquiry'
WHERE (is_converted = false OR is_converted IS NULL)
  AND (stage_id IS NULL OR stage_id NOT LIKE 'stg_%');

-- DOWN (full rollback if ever needed)
-- UPDATE pyra_sales_leads SET stage_id = legacy_stage_id;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS legacy_stage_id;
```

### Verification

```sql
-- 1. NO leads have null or non-stg_ stage_id
SELECT COUNT(*) FROM pyra_sales_leads
WHERE stage_id IS NULL OR stage_id NOT LIKE 'stg_%';
-- Must return 0.

-- 2. Distribution check
SELECT stage_id, COUNT(*) FROM pyra_sales_leads GROUP BY stage_id ORDER BY stage_id;
-- Expected: most in stg_new_inquiry, converted ones in stg_closed_won

-- 3. Total row count unchanged
SELECT COUNT(*) FROM pyra_sales_leads;
-- Must equal baseline

-- 4. legacy_stage_id populated for all rows that had old stage_id
SELECT COUNT(*) FROM pyra_sales_leads WHERE legacy_stage_id IS NULL;
-- Must return 0
```

### Communication to Sales Team (after Phase 2)

Once the migration runs, **inform Sayed** (and any other sales rep):

> "النظام الجديد محتاج منك تراجع كل lead بتاعك في 'استفسار جديد' وتحركه للمرحلة الصح بناءً على آخر معلومة عندك عنه. ضيف الـ activities والـ notes والـ history الفعلية اللي حصلت معاه. بكدا الـ pipeline يبقى دقيق."

This is the trade-off Abdou approved: 1-2 hours of cleanup work by Sayed in exchange for zero migration risk.

---

## Phase 5 — Add `lead_id` to `pyra_contracts`

Critical for the "one lead, multiple contracts" model.

### Migration: `crm_004_link_contracts_to_leads.sql`

```sql
-- Migration: crm_004_link_contracts_to_leads
-- Reversible: YES

-- UP
ALTER TABLE pyra_contracts
  ADD COLUMN IF NOT EXISTS lead_id VARCHAR REFERENCES pyra_sales_leads(id) ON DELETE SET NULL;
-- ON DELETE SET NULL: deleting a lead does NOT cascade-delete contracts
-- Contracts are financial records, must persist

CREATE INDEX IF NOT EXISTS idx_contracts_lead ON pyra_contracts(lead_id);

-- Backfill: where contract.client_id matches a lead.client_id, set lead_id
UPDATE pyra_contracts c
SET lead_id = l.id
FROM pyra_sales_leads l
WHERE c.client_id = l.client_id
  AND l.is_converted = true
  AND c.lead_id IS NULL;

-- DOWN
-- ALTER TABLE pyra_contracts DROP CONSTRAINT IF EXISTS pyra_contracts_lead_id_fkey;
-- ALTER TABLE pyra_contracts DROP COLUMN IF EXISTS lead_id;
-- DROP INDEX IF EXISTS idx_contracts_lead;
```

### Verification

```sql
-- How many contracts got linked to leads
SELECT
  COUNT(*) FILTER (WHERE lead_id IS NOT NULL) AS linked,
  COUNT(*) FILTER (WHERE lead_id IS NULL) AS unlinked
FROM pyra_contracts;
-- Show this to Abdou. Some contracts may legitimately not have leads
-- (e.g., if they were created before the CRM migration).
```

> **NOTE**: Some contracts will have `lead_id = NULL`. That's expected for legacy contracts whose clients never had a lead record. They show under "Customers" in `/dashboard/finance/contracts` but won't appear in CRM views. This is acceptable.

---

## Phase 6 — Extend `pyra_lead_activities`

Verify the schema and add new activity types.

### Pre-step: Verify schema

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'pyra_lead_activities';
```

**Expected columns** (based on existing CRM patterns — verify and ask if different):
- `id`, `lead_id`, `activity_type`, `content`, `created_by`, `created_at`, `metadata` (jsonb)

If structure differs → `Q-DB-003`.

### Migration: `crm_005_lead_activity_types.sql`

```sql
-- Migration: crm_005_lead_activity_types
-- This is mostly documentation — we don't enforce activity_type via CHECK
-- because that would break old rows. We document the canonical types here.

-- UP (no schema change, just ensure metadata column exists)
ALTER TABLE pyra_lead_activities
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_created
  ON pyra_lead_activities(lead_id, created_at DESC);

-- DOWN
-- ALTER TABLE pyra_lead_activities DROP COLUMN IF EXISTS metadata;
-- DROP INDEX IF EXISTS idx_lead_activities_lead_created;
```

### Canonical Activity Types (DOCUMENTATION — enforce in code, not DB)

These are the types `pyra_lead_activities.activity_type` may take. Defined in `lib/constants/statuses.ts` as a TypeScript union — **NOT** as a DB CHECK constraint.

| `activity_type` | Source | Auto/Manual | Metadata fields |
|-----------------|--------|-------------|-----------------|
| `lead_created` | system | auto | `source`, `created_by` |
| `stage_change` | system | auto | `from_stage`, `to_stage`, `changed_by` |
| `note` | user | manual | `pinned` (bool) |
| `call_logged` | user | manual | `duration_minutes`, `direction` |
| `meeting_scheduled` | user | manual | `meeting_date`, `location` |
| `whatsapp_inbound` | system | auto (from Evolution) | `message_id`, `message_text`, `from_number` |
| `whatsapp_outbound` | system | auto (from Evolution) | `message_id`, `message_text`, `to_number` |
| `email_sent` | user | manual | `subject`, `to` |
| `file_attached` | system | auto (on upload) | `file_path`, `file_name` |
| `field_updated` | system | auto (on critical field changes) | `field`, `old_value`, `new_value` |
| `assignment_changed` | system | auto | `from_user`, `to_user` |
| `closed_won_pending` | system | auto (on stage move to contract_signed) | `requested_by`, `contract_id`, `invoice_id` |
| `closed_won_approved` | system | auto | `approved_by`, `approved_at` |
| `closed_won_rejected` | system | auto | `rejected_by`, `reason` |
| `follow_up_created` | user | manual | `follow_up_id`, `due_at` |
| `follow_up_completed` | user | manual | `follow_up_id` |
| `follow_up_overdue` | system | auto (cron) | `follow_up_id`, `days_overdue` |
| `idle_warning` | system | auto (cron, ≥7 days no activity) | `days_idle` |

**Add to `lib/constants/statuses.ts`**:

```typescript
export const LEAD_ACTIVITY_TYPES = [
  'lead_created', 'stage_change', 'note', 'call_logged',
  'meeting_scheduled', 'whatsapp_inbound', 'whatsapp_outbound',
  'email_sent', 'file_attached', 'field_updated',
  'assignment_changed', 'closed_won_pending', 'closed_won_approved',
  'closed_won_rejected', 'follow_up_created', 'follow_up_completed',
  'follow_up_overdue', 'idle_warning',
] as const;

export type LeadActivityType = typeof LEAD_ACTIVITY_TYPES[number];

export const LEAD_ACTIVITY_LABELS_AR: Record<LeadActivityType, string> = {
  lead_created: 'تم إنشاء الـ Lead',
  stage_change: 'انتقلت المرحلة',
  note: 'ملاحظة',
  // ... fill rest
};
```

---

## Phase 7 — Verify/Confirm `pyra_sales_follow_ups` Schema

### Pre-step

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'pyra_sales_follow_ups';
```

If the table does NOT exist → `Q-DB-004`: do we create it? Or is follow-up tracking already in `pyra_lead_activities` of type `follow_up_created`?

If it exists, expected schema (verify):
- `id`, `lead_id`, `assigned_to`, `title`, `due_at`, `status` ('pending' / 'completed' / 'cancelled' / 'overdue'), `completed_at`, `notes`, `created_by`, `created_at`, `updated_at`

### If NOT exists, Migration: `crm_006_create_follow_ups.sql`

```sql
-- ONLY RUN IF Q-DB-004 confirmed table doesn't exist
CREATE TABLE IF NOT EXISTS pyra_sales_follow_ups (
  id              VARCHAR PRIMARY KEY,
  lead_id         VARCHAR NOT NULL REFERENCES pyra_sales_leads(id) ON DELETE CASCADE,
  assigned_to     VARCHAR NOT NULL,
  title           TEXT NOT NULL,
  due_at          TIMESTAMPTZ NOT NULL,
  reminder_at     TIMESTAMPTZ,  -- e.g., 30 min before due
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  whatsapp_reminder_sent BOOLEAN DEFAULT false,
  created_by      VARCHAR NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CHECK (status IN ('pending','completed','cancelled','overdue'))
);

CREATE INDEX idx_followups_assigned_due ON pyra_sales_follow_ups(assigned_to, due_at) WHERE status = 'pending';
CREATE INDEX idx_followups_lead ON pyra_sales_follow_ups(lead_id);
```

---

## Phase 8 — RLS / Permission Strategy

The current `pyra-workspace3` does NOT use Postgres RLS — access is enforced at the application layer via `requireApiPermission()` and `canAccessLead()` (new helper).

### New helper to add: `lib/auth/lead-scope.ts`

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasPermission } from './rbac';

/**
 * Returns true if the user can access (read OR mutate) a specific lead.
 * Admins bypass. Sales agents can only access leads where assigned_to = their username.
 *
 * Used as the final scope gate AFTER permission gate.
 */
export async function canAccessLead(
  supabase: SupabaseClient,
  username: string,
  role: string,
  leadId: string,
): Promise<boolean> {
  // Admin override
  if (role === 'admin') return true;

  // Manager: can access leads of their direct reports
  // (uses existing canApproveFor pattern — manager_username chain)
  // For v1 with one rep, this is effectively same as admin

  // Default: sales agent only sees own leads
  const { data, error } = await supabase
    .from('pyra_sales_leads')
    .select('assigned_to')
    .eq('id', leadId)
    .single();

  if (error || !data) return false;
  return data.assigned_to === username;
}

/**
 * Returns the SQL filter clause for "leads I can see".
 * Used in list endpoints to scope queries efficiently.
 *
 * Returns: { filterColumn?: 'assigned_to', filterValue?: 'username' } or null for unrestricted.
 */
export function getLeadScopeFilter(role: string, username: string) {
  if (role === 'admin') return null; // unrestricted
  return { filterColumn: 'assigned_to', filterValue: username };
}
```

**Use in API routes**:

```typescript
// In every leads API route:
const auth = await requireApiPermission('leads.view');
if (!auth.ok) return auth.response;

const filter = getLeadScopeFilter(auth.pyraUser.role, auth.pyraUser.username);
let query = supabase.from('pyra_sales_leads').select('*');
if (filter) query = query.eq(filter.filterColumn, filter.filterValue);
```

---

## Final Verification After All Phases

```sql
-- 1. Lead count unchanged
SELECT COUNT(*) FROM pyra_sales_leads;
-- Equals baseline

-- 2. Activity count never decreased
SELECT COUNT(*) FROM pyra_lead_activities;
-- ≥ baseline

-- 3. All leads have new-format stage_id
SELECT COUNT(*) FROM pyra_sales_leads WHERE stage_id NOT LIKE 'stg_%';
-- = 0

-- 4. legacy_stage_id preserved for rollback
SELECT COUNT(*) FROM pyra_sales_leads WHERE legacy_stage_id IS NOT NULL;
-- = baseline

-- 5. No orphan leads (stage_id pointing to non-existent stage)
SELECT COUNT(*)
FROM pyra_sales_leads l
LEFT JOIN pyra_sales_pipeline_stages s ON l.stage_id = s.id
WHERE s.id IS NULL;
-- = 0

-- 6. Contracts linked correctly
SELECT
  COUNT(*) FILTER (WHERE lead_id IS NOT NULL) AS linked_to_lead,
  COUNT(*) FILTER (WHERE client_id IS NOT NULL AND lead_id IS NULL) AS legacy_unlinked
FROM pyra_contracts;
-- Show to Abdou
```

---

## Cleanup (deferred to v1.1, NOT in v1)

After CRM is stable for 2+ weeks AND all features verified working:

```sql
-- Phase X (DEFERRED — DO NOT RUN IN v1)
-- Drop legacy stage rows (only after Abdou approves)
-- DELETE FROM pyra_sales_pipeline_stages WHERE id NOT LIKE 'stg_%';

-- Drop legacy_stage_id column (only after 30-day verification window)
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS legacy_stage_id;
```

**These cleanups require a new explicit approval before running. Not part of v1.**

---

## Summary Migration Checklist

- [ ] `crm_001_extend_sales_leads.sql` — extends pyra_sales_leads (safe, additive)
- [ ] `crm_002_pipeline_stages.sql` — inserts new stages (safe, additive)
- [ ] `crm_003_remap_leads.sql` — **REQUIRES Q-DB-002 ANSWER FIRST**
- [ ] `crm_004_link_contracts_to_leads.sql` — adds lead_id to contracts
- [ ] `crm_005_lead_activity_types.sql` — adds metadata column + index
- [ ] `crm_006_create_follow_ups.sql` — **ONLY IF Q-DB-004 SAYS TO**
- [ ] All verification queries pass

**On any failure**: stop. Restore from Supabase point-in-time backup. Fix migration. Retry.
