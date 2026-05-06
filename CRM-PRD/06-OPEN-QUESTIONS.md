# 06 — Open Questions

> **This file is the formal channel for Claude Code to escalate questions to the owner (Abdou).** Every unanswered question here is a **blocker** for the corresponding phase. Do not improvise. Do not "make a reasonable choice" without asking.

---

## How to Use This File

1. **When Claude Code hits a question**: append it here using the template below, and **stop** the affected work item.
2. **The user (Abdou via the conversational AI)**: reads new questions, answers them in the "Answer" section.
3. **Claude Code**: re-reads, applies the answer, and continues.
4. **Never assume an answer**, never delete a question after answering — keep the history.

---

## Template

```markdown
## Q-{CATEGORY}-{NNN} — {short title}

**Status**: Open / Answered / Resolved
**Phase impacted**: [reference to 05-EXECUTION-PHASES.md]
**Date asked**: YYYY-MM-DD

**Context**:
What I'm trying to do, and what the PRD says about it.

**Where I'm stuck**:
The specific gap, contradiction, or unknown.

**Affected files/tables**:
- ...

**My best guess** (optional, if I have one):
...

**Blocker?**: Yes / No

---

**Answer** (filled in by Abdou):
...

**Resolution applied** (filled in by Claude Code after applying):
...
```

Categories:
- `Q-DB` — database / schema questions
- `Q-API` — backend / API questions
- `Q-UI` — frontend / UX questions
- `Q-BIZ` — business logic / product questions
- `Q-OPS` — deployment / infrastructure questions

---

# Pre-Seeded Questions (must be answered before relevant phase)

These are **expected** unknowns identified during PRD creation. Answer them at the start of the relevant phase.

---

## Q-DB-001 — `pyra_sales_follow_ups` table existence

**Status**: ✅ ANSWERED (self-discovered in Phase 0)
**Phase impacted**: Phase 1 (Database Foundation)
**Date asked**: PRD creation
**Date answered**: 2026-05-06 (from baseline-schema.txt)

**Context**:
The existing repo's `CLAUDE.md` and `DATABASE-SCHEMA.md` reference a Sales CRM with follow-ups feature, but the schema doc was truncated mid-section so I couldn't verify the exact table.

**Where I'm stuck**:
Does `pyra_sales_follow_ups` already exist as a table? If yes, what's its schema?

**Affected files/tables**:
- `pyra_sales_follow_ups`
- `crm_006_create_follow_ups.sql` migration

---

### ✅ ANSWER (Phase 0 schema dump):

`pyra_sales_follow_ups` **EXISTS** with 0 rows. Live schema:

| column | type | nullable | default |
|---|---|---|---|
| id | varchar | NOT NULL | — |
| lead_id | varchar | YES | — |
| assigned_to | varchar | YES | — |
| due_at | timestamptz | NOT NULL | — |
| title | text | YES | — |
| notes | text | YES | — |
| status | varchar | YES | `'pending'` |
| completed_at | timestamptz | YES | — |
| created_by | varchar | YES | — |
| created_at | timestamptz | YES | `now()` |
| quote_id | varchar | YES | — *(extra; not in PRD spec — links follow-up to a quote)* |

**Difference vs PRD's CREATE TABLE shape** (`crm_006_create_follow_ups.sql`):

Missing from live table: `reminder_at`, `whatsapp_reminder_sent`, `updated_at`, and the `CHECK (status IN (...))` constraint.

### Resolution applied
- `crm_006_create_follow_ups.sql` (CREATE TABLE IF NOT EXISTS) is a **no-op** — DO NOT run it as written.
- For Phases 1–10 we use the table **as-is** (existing columns are sufficient for create / list / mark-complete).
- If/when Phase 11 needs WhatsApp reminder dispatch, add the missing columns via a NEW additive Tier-1 migration (e.g. `crm_006b_extend_follow_ups.sql`):
  ```sql
  ALTER TABLE pyra_sales_follow_ups
    ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS whatsapp_reminder_sent BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  ```
  No CHECK constraint — application-layer enforcement matches existing repo style.

---

## Q-DB-002 — Old-to-new pipeline stage mapping

**Status**: ✅ ANSWERED
**Phase impacted**: Phase 2 (Lead Remap)
**Date asked**: PRD creation
**Date answered**: 2026-05-06

**Context**:
The existing `pyra_sales_pipeline_stages` has whatever stages were configured before. Phase 2 of `02-DATABASE...` requires remapping every existing lead to one of the new 7 stages.

---

### ✅ ANSWER FROM ABDOU:

**Simplified strategy approved:**

> "Put ALL existing leads in the first stage (`stg_new_inquiry`). The sales agents will manually re-stage their own leads after the migration, adding their own notes, activities, and history."

**Why this is the right call**:
- ✅ Eliminates the highest-risk migration in the project
- ✅ No need for old-to-new mapping discovery
- ✅ Forces sales reps to review every lead → data quality goes UP
- ✅ Each lead's true current stage will be set by the rep who knows the context
- ✅ Activity timeline on each lead will accurately reflect when the new system started tracking
- ✅ Zero risk of misclassifying an old lead

**Trade-off accepted**: For ~24 hours after launch, the Pipeline Kanban view will look top-heavy (everything in the first column). This is OK and expected. Within the first week, Sayed (and any future reps) will spread leads across the correct stages.

---

### Updated Migration: `crm_003_remap_leads.sql` (FINAL — execute as-is)

This migration is now SAFE because it doesn't depend on guessing any mapping:

```sql
-- Migration: crm_003_remap_leads (SIMPLIFIED — all existing leads → new_inquiry)
-- Reversible: YES (legacy_stage_id preserved)
-- Safe: YES (no data loss, no guessing)

-- UP

-- Step 1: Add backup column to preserve original stage_id
ALTER TABLE pyra_sales_leads
  ADD COLUMN IF NOT EXISTS legacy_stage_id VARCHAR(50);

UPDATE pyra_sales_leads
SET legacy_stage_id = stage_id
WHERE legacy_stage_id IS NULL;

-- Step 2: Move ALL leads with old stage_id to stg_new_inquiry
-- Exception: leads already converted (is_converted = true) go to stg_closed_won
--           because they're real customers and shouldn't appear in active pipeline

UPDATE pyra_sales_leads
SET stage_id = 'stg_closed_won'
WHERE is_converted = true
  AND (stage_id IS NULL OR stage_id NOT LIKE 'stg_%');

UPDATE pyra_sales_leads
SET stage_id = 'stg_new_inquiry'
WHERE is_converted = false OR is_converted IS NULL
  AND (stage_id IS NULL OR stage_id NOT LIKE 'stg_%');

-- DOWN (full rollback if ever needed)
-- UPDATE pyra_sales_leads SET stage_id = legacy_stage_id;
-- ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS legacy_stage_id;
```

### Verification Queries (run after migration)

```sql
-- 1. Total count unchanged
SELECT COUNT(*) FROM pyra_sales_leads;
-- Must equal baseline-inventory.txt #1

-- 2. NO leads in old stages anymore
SELECT COUNT(*) FROM pyra_sales_leads WHERE stage_id NOT LIKE 'stg_%';
-- Must = 0

-- 3. Distribution
SELECT stage_id, COUNT(*) FROM pyra_sales_leads GROUP BY stage_id;
-- Expected: most leads in stg_new_inquiry, converted ones in stg_closed_won

-- 4. legacy preserved for rollback
SELECT COUNT(*) FROM pyra_sales_leads WHERE legacy_stage_id IS NULL;
-- Must = 0
```

**Resolution applied**:
- `02-DATABASE-AND-MIGRATION.md` Phase 4 SHOULD be updated to use this simplified migration
- Phase 2 of `05-EXECUTION-PHASES.md` is now LOW RISK and can run without prior approval (per Q-OPS-001 Tier 1 rules)
- This was the riskiest phase in the project. It is now de-risked.

---

## Q-DB-003 — `pyra_lead_activities` schema verification

**Status**: ✅ ANSWERED (self-discovered in Phase 0)
**Phase impacted**: Phase 1
**Date asked**: PRD creation
**Date answered**: 2026-05-06 (from baseline-schema.txt)

**Context**:
PRD assumes `pyra_lead_activities` has columns: `id`, `lead_id`, `activity_type`, `content`, `created_by`, `created_at`. Need to verify, especially the `metadata` (jsonb) column doesn't exist yet (we add it).

---

### ✅ ANSWER (Phase 0 schema dump):

Live `pyra_lead_activities` schema (0 rows in table at baseline):

| column | type | nullable | default |
|---|---|---|---|
| id | varchar | NOT NULL | — |
| lead_id | varchar | YES | — |
| activity_type | varchar | NOT NULL | — |
| **description** | text | YES | — *(PRD called this `content` — actual name is `description`)* |
| **metadata** | jsonb | YES | — *(ALREADY EXISTS — PRD assumed it was missing)* |
| created_by | varchar | YES | — |
| created_at | timestamptz | YES | `now()` |

**Two findings**:

1. **Column name mismatch — `description` not `content`.**
   All code paths that write or read activity body text MUST use `description`. The PRD prose in `02-DATABASE-AND-MIGRATION.md § Phase 6` and `03-API-AND-PERMISSIONS.md` (wherever it shows `content`) is incorrect — treat `description` as authoritative.

2. **`metadata jsonb` already exists.**
   Migration `crm_005_lead_activity_types.sql`'s `ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'` is a **no-op** at the column level. The migration's `CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_created` is still useful — run it. (Note: column has no DEFAULT in the live table; new rows must explicitly set `metadata = '{}'::jsonb` if non-null is desired. Application layer should pass `metadata: {}` when creating activities.)

### Resolution applied

- `crm_005_lead_activity_types.sql` is **safe to run** (idempotent ALTER + CREATE INDEX).
- Phase 1 work item: when adding the `LeadActivity` TypeScript type and any helpers in `lib/`, name the field `description`, not `content`.
- Phase 5 work item: timeline UI reads `activity.description` (and renders metadata fields per the activity-type table).
- **Blocker?** No — proceed.

---

## Q-DB-004 — Should `pyra_sales_follow_ups` exist as separate table or be merged into `pyra_lead_activities`?

**Status**: Open
**Phase impacted**: Phase 1, Phase 6
**Date asked**: PRD creation

**Context**:
Two viable designs:
1. Separate `pyra_sales_follow_ups` table with `due_at`, `status`, etc. (planning + execution).
2. Use `pyra_lead_activities` of type `follow_up_created` and update its `metadata` when completed.

Design (1) is cleaner for queries like "my pending follow-ups". Design (2) avoids a new table.

**My recommendation**: Design (1) — separate table. Cleaner schema, faster queries, easier to add reminders.

**Blocker?**: No — but choice affects Phase 6 work.

---

**Answer**:
_(awaiting Abdou's preference. Default to Design (1) if no answer by Phase 6.)_

---

## Q-API-001 — Phone number duplicate handling on Lead create

**Status**: Open
**Phase impacted**: Phase 6 (Mutations)
**Date asked**: PRD creation

**Context**:
When creating a new Lead with a phone number that matches an existing Lead, what should happen?

**Options**:
1. **Block** — return 409 Conflict with the existing lead ID, suggest the user open it.
2. **Warn but allow** — show a soft warning in UI, let the user decide.
3. **Auto-merge** — append a new activity to the existing lead instead of creating new.

**My recommendation**: Option 2 (warn but allow). Avoids blocking legitimate cases (e.g., a friend uses the same phone for a different deal) while alerting Sayed to potential duplicates.

**Blocker?**: No — Phase 6.

---

**Answer**:
_(awaiting Abdou's preference)_

---

## Q-API-002 — Notification dedup for repeated stage changes

**Status**: Open
**Phase impacted**: Phase 7 (Approval Workflow)
**Date asked**: PRD creation

**Context**:
If Sayed moves a lead to `contract_signed`, gets rejected (back to `negotiation`), then moves it again to `contract_signed`, Abdou gets two notifications.

**Question**: Should we dedup on `entity_id` so a single approval queue item is shown? Or are two distinct notifications correct?

**My recommendation**: Two distinct notifications are correct (each is a fresh approval request). The `entity_type='lead'`, `entity_id=lead_id` plus `created_at` together form a unique notification.

**Blocker?**: No.

---

**Answer**:
_(awaiting)_

---

## Q-BIZ-001 — Win probability calculation

**Status**: Open
**Phase impacted**: Phase 3 (Dashboard) and Phase 6
**Date asked**: PRD creation

**Context**:
Lead has `win_probability` (0-100). The Dashboard's Forecast computes "expected close value this month" based on this. Two approaches:

1. **Manual** — agent sets it on each lead.
2. **Auto by stage** — derive: `new_inquiry`=10, `discovery`=25, `proposal_sent`=50, `negotiation`=72, `contract_signed`=95, `closed_won`=100, `closed_lost`=0.
3. **Hybrid** — auto by stage, but agent can override per lead.

**My recommendation**: Hybrid (3). Default by stage, override allowed.

**Blocker?**: No.

---

**Answer**:
_(awaiting)_

---

## Q-BIZ-002 — Auto-create Contract on Closed Won?

**Status**: Open
**Phase impacted**: Phase 7
**Date asked**: PRD creation

**Context**:
When Sayed moves a lead to `contract_signed` and attaches a contract, that contract already exists in `pyra_contracts`. But what if no contract exists yet — only a quote/proposal?

**Question**: Should the system auto-create a contract record from the quote on approval? Or require manual contract creation first?

**My recommendation**: Require manual contract creation. The agent must have created the contract in `/dashboard/finance/contracts` first, and selects it during the move-to-contract-signed step. Cleaner separation of concerns.

**Blocker?**: No (but affects Phase 7 UX).

---

**Answer**:
_(awaiting)_

---

## Q-BIZ-003 — What happens to `assigned_to` when a sales agent leaves?

**Status**: Open
**Phase impacted**: Phase 6 (anytime)
**Date asked**: PRD creation

**Context**:
If Sayed leaves Pyramedia tomorrow, his leads need re-assignment. The system should support this.

**Question**: Should there be a "transfer leads" bulk action accessible to admin? Or is this handled elsewhere?

**My recommendation**: Yes, add `POST /api/crm/leads/bulk-reassign` for admin only. Keep simple in v1: one source agent → one target agent.

**Blocker?**: No (v1.1 can address).

---

**Answer**:
_(awaiting — likely defer to v1.1)_

---

## Q-UI-001 — Pipeline drag-drop on mobile

**Status**: Open
**Phase impacted**: Phase 4 / 7
**Date asked**: PRD creation

**Context**:
Drag-and-drop on touch devices is finicky. Options:
1. Long-press to start drag (standard pattern).
2. Disable drag on mobile; provide a "Move stage" button on each card that opens a sheet picker.
3. Both — drag works, button is alternative.

**My recommendation**: Option 2 only on mobile (button). Drag-drop is desktop-only. The "Move stage" button is faster and more reliable on phones.

**Blocker?**: No.

---

**Answer**:
_(awaiting)_

---

## Q-UI-002 — Activity Timeline pagination

**Status**: Open
**Phase impacted**: Phase 5
**Date asked**: PRD creation

**Context**:
A long-lived customer might have hundreds of activities. Loading them all is slow.

**My recommendation**: Load most recent 50 by default, with "Load more" button. No pagination UI, just append.

**Blocker?**: No.

---

**Answer**:
_(awaiting)_

---

## Q-OPS-001 — Migration execution method

**Status**: ✅ ANSWERED
**Phase impacted**: Phase 1
**Date asked**: PRD creation
**Date answered**: 2026-05-06

**Context**:
The repo's `CLAUDE.md` says: "DB Migrations (Run directly — never ask user)" using the curl pattern to `https://pyraworkspacedb.pyramedia.cloud/pg/query`.

**Question**: Should migrations be:
1. Run directly via that endpoint (no PR required, runs against prod immediately)?
2. Saved as `.sql` files in `supabase/migrations/` and applied via deploy?

---

### ✅ ANSWER FROM ABDOU:

**Two-tier policy approved:**

#### Tier 1 — SAFE / ADDITIVE migrations: **Execute directly** (no need to ask)

These migrations only ADD new structures. They cannot lose data. Claude Code may run them directly without approval:

- `crm_001_extend_sales_leads.sql` — adds new columns (lead_type, deal_type, etc.) with defaults
- `crm_002_pipeline_stages.sql` — INSERTs the 7 new stage rows (uses ON CONFLICT, idempotent)
- `crm_004_link_contracts_to_leads.sql` — adds nullable `lead_id` FK + safe backfill
- `crm_005_lead_activity_types.sql` — adds `metadata` jsonb column + index
- `crm_006_create_follow_ups.sql` (if needed per Q-DB-001) — creates new table

**Rule**: A migration is "safe/additive" if it ONLY does:
- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (with defaults or nullable)
- `CREATE INDEX IF NOT EXISTS`
- `INSERT ... ON CONFLICT DO UPDATE`
- Backfill `UPDATE` where SET targets only NEW or NULL columns

#### Tier 2 — RISKY migrations: **STOP and get explicit approval**

Any migration that touches existing data must be reviewed by Abdou before execution:

- `crm_003_remap_leads.sql` — changes `stage_id` of existing leads (BUT: see Q-DB-002 answer — this migration is now drastically simplified)
- Any future migration that does `DROP COLUMN`, `DROP TABLE`, `DELETE FROM`, `RENAME`, or `UPDATE` on existing data

**Workflow for Tier 2**:
1. Claude Code writes the SQL
2. Pastes the exact SQL + a one-line explanation in chat
3. Waits for Abdou's "OK نفّذ" (or rejection)
4. Only then executes

**Resolution applied**: Phase 1 of `05-EXECUTION-PHASES.md` proceeds without interruption. Phase 2 follows Q-DB-002 simplified flow.

---

## Q-OPS-002 — Cron job scheduling

**Status**: Open
**Phase impacted**: Phase 11
**Date asked**: PRD creation

**Context**:
The PRD mentions cron jobs:
- Follow-up WhatsApp reminders (every 5 min)
- Lead idle warning (daily 09:00)

**Question**: Where do these run? n8n? Coolify cron? External scheduler?

**My recommendation**: Use n8n (already in stack per memory). Configure n8n to call `/api/cron/...` endpoints with API key.

**Blocker?**: Affects Phase 11.

---

**Answer**:
_(awaiting)_

---

# Section: Questions Encountered During Build

> Add new questions below as they arise. Use the template above.

(none yet)
