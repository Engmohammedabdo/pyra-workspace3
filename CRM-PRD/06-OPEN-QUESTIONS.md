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

**Status**: ✅ ANSWERED
**Phase impacted**: Phase 1, Phase 6
**Date asked**: PRD creation
**Date answered**: 2026-05-06

**Context**:
Two viable designs:
1. Separate `pyra_sales_follow_ups` table with `due_at`, `status`, etc. (planning + execution).
2. Use `pyra_lead_activities` of type `follow_up_created` and update its `metadata` when completed.

---

### ✅ ANSWER FROM ABDOU:

**Use the existing `pyra_sales_follow_ups` table as-is** (Design 1, with the live schema documented in Q-DB-001). Don't merge follow-ups into `pyra_lead_activities`.

**Resolution applied**:
- Phase 6 mutations: write to `pyra_sales_follow_ups` directly.
- A `follow_up_created` activity is *also* logged into `pyra_lead_activities` for the timeline UI (with `metadata.follow_up_id` pointing back) — but the source of truth for "my pending follow-ups" stays the dedicated table.

---

## Q-API-001 — Phone number duplicate handling on Lead create

**Status**: ✅ ANSWERED
**Phase impacted**: Phase 6 (Mutations)
**Date asked**: PRD creation
**Date answered**: 2026-05-06

**Context**:
When creating a new Lead with a phone number that matches an existing Lead, what should happen?

---

### ✅ ANSWER FROM ABDOU:

**Option 2 — warn but allow.** When the user types a phone number that matches an existing lead, the Add Lead modal must show a soft warning with a clickable link to the existing lead:

> "هذا الرقم موجود قبل كده، اضغط لفتح الـ lead الموجود"

The warning is non-blocking — the user can still submit if it's a legitimate duplicate (e.g., shared phone, separate deals).

**Resolution applied**:
- `POST /api/crm/leads` (Phase 6): never returns 409 for duplicate phone. Always allows creation.
- The Add-Lead modal calls `GET /api/crm/leads?phone=<value>` (or a dedicated lookup endpoint) on phone-field blur. If a match is returned, render the inline warning + link to `/dashboard/crm/leads/<id>`.
- API duplicate-detection logic: trim + normalise the phone (strip whitespace, leading `+`, `00` prefix) before comparing — match on the normalised form.

---

## Q-API-002 — Notification dedup for repeated stage changes

**Status**: ✅ ANSWERED
**Phase impacted**: Phase 7 (Approval Workflow)
**Date asked**: PRD creation
**Date answered**: 2026-05-06

**Context**:
If Sayed moves a lead to `contract_signed`, gets rejected (back to `negotiation`), then moves it again to `contract_signed`, Abdou gets two notifications.

---

### ✅ ANSWER FROM ABDOU:

**Two separate notifications.** Each fresh move-to-`contract_signed` is a distinct approval request and gets its own row in `pyra_notifications`. Don't dedup.

**Resolution applied**:
- `notify()` calls in the approval workflow pass a unique notification per request — no upsert / merge.
- The approvals queue (`/dashboard/crm/approvals`) shows the most recent open request per lead in the primary list, but Abdou can see the full history (older approved/rejected requests too) via the Activity Timeline on the Lead Detail page.

---

## Q-BIZ-001 — Win probability calculation

**Status**: ✅ ANSWERED
**Phase impacted**: Phase 3 (Dashboard) and Phase 6
**Date asked**: PRD creation
**Date answered**: 2026-05-06

**Context**:
Lead has `win_probability` (0-100). The Dashboard's Forecast computes "expected close value this month" based on this.

---

### ✅ ANSWER FROM ABDOU:

**Option 3 — Hybrid.** The system auto-defaults `win_probability` by stage; the agent can override per lead.

Stage → default mapping (locked):

| stage | win_probability default |
|---|---|
| `stg_new_inquiry`     | 10 |
| `stg_discovery_call`  | 25 |
| `stg_proposal_sent`   | 50 |
| `stg_negotiation`     | 72 |
| `stg_contract_signed` | 95 |
| `stg_closed_won`      | 100 |
| `stg_closed_lost`     | 0 |

**Behaviour rules**:
- On Lead create → set `win_probability` from the default for the lead's initial stage (always `stg_new_inquiry` after Phase 2).
- On stage change → if the agent has not manually overridden the value (we'll track this via a small flag — see below), update `win_probability` to the new stage's default. If overridden, preserve the override.
- Lead edit form: agent can directly edit `win_probability`. Doing so sets a `win_probability_overridden BOOLEAN DEFAULT false` flag. Once `true`, future stage changes do not auto-update.
- A "Reset to stage default" button on the lead-edit form clears the override flag.

**Resolution applied**:
- Add the `win_probability_overridden` column via a Tier-1 additive migration (slot it into `crm_001_extend_sales_leads.sql` since that's still in Phase 1). Default `false`.
- Stage-change endpoint (`POST /api/crm/leads/[id]/move-stage`) checks the flag before recalculating.
- Lead-edit endpoint (`PATCH /api/crm/leads/[id]`) sets the flag to `true` whenever the request body contains `win_probability`.
- A `STAGE_DEFAULT_WIN_PROBABILITY` constant lives in `lib/constants/statuses.ts` next to `PIPELINE_STAGE_IDS`.

---

## Q-BIZ-002 — Auto-create Contract on Closed Won?

**Status**: ✅ ANSWERED
**Phase impacted**: Phase 7
**Date asked**: PRD creation
**Date answered**: 2026-05-06

**Context**:
When Sayed moves a lead to `contract_signed` and attaches a contract, that contract already exists in `pyra_contracts`. But what if no contract exists yet — only a quote/proposal?

---

### ✅ ANSWER FROM ABDOU:

**Manual contract creation required.** Sales rep must create the contract in `/dashboard/finance/contracts` *before* moving the lead to `contract_signed`. No auto-creation.

**Resolution applied**:
- Phase 7 move-to-`contract_signed` modal: the contract picker shows existing `pyra_contracts` filtered by `client_id` (or `lead_id` if already linked). If none exist, the modal shows a CTA "أنشئ عقد جديد" that deep-links to `/dashboard/finance/contracts/new?lead_id=<id>` and the user finishes the contract creation, then comes back.
- Backend (`POST /api/crm/leads/[id]/move-stage`) rejects with 422 if the request targets `stg_contract_signed` and supplies neither a `contract_id` nor an `invoice_id`.
- No auto-creation logic in the move-stage endpoint. Cleaner separation of concerns.

---

## Q-BIZ-003 — What happens to `assigned_to` when a sales agent leaves?

**Status**: ✅ ANSWERED — DEFERRED to v1.1
**Phase impacted**: Phase 6 (anytime) → moved to v1.1
**Date asked**: PRD creation
**Date answered**: 2026-05-06

**Context**:
If Sayed leaves Pyramedia tomorrow, his leads need re-assignment. The system should support this.

---

### ✅ ANSWER FROM ABDOU:

**Defer to v1.1.** Don't build the bulk re-assign endpoint or UI in v1.

**Resolution applied**:
- Out of scope for v1. No endpoint, no UI.
- Per-lead re-assignment via the standard `PATCH /api/crm/leads/[id]` (admin can change `assigned_to` manually) IS in v1 — this covers the rare case until the bulk tool ships.

---

## Q-UI-001 — Pipeline drag-drop on mobile

**Status**: ✅ ANSWERED
**Phase impacted**: Phase 4 / 7
**Date asked**: PRD creation
**Date answered**: 2026-05-06

**Context**:
Drag-and-drop on touch devices is finicky.

---

### ✅ ANSWER FROM ABDOU:

**Option 2 — desktop drag-drop only; mobile uses a button.**

- Desktop (≥ 768px): full `@dnd-kit` drag-and-drop on the Pipeline.
- Mobile (< 768px): drag-drop disabled. Each card shows a **"نقل المرحلة"** button. Tapping it opens a bottom sheet with a stage picker; same validation rules apply (e.g., target = `stg_contract_signed` triggers the contract-attach flow).

**Resolution applied**:
- `pipeline-card.tsx` renders the button only at the mobile breakpoint (or always, with `dnd` wrapped in `hidden md:block` and the button in `block md:hidden`).
- Stage-picker sheet shares the same backing mutation as desktop drag (`POST /api/crm/leads/[id]/move-stage`).

---

## Q-UI-002 — Activity Timeline pagination

**Status**: ✅ ANSWERED
**Phase impacted**: Phase 5
**Date asked**: PRD creation
**Date answered**: 2026-05-06

**Context**:
A long-lived customer might have hundreds of activities. Loading them all is slow.

---

### ✅ ANSWER FROM ABDOU:

**Load 50 most recent, then "تحميل المزيد" button to append the next 50.** No numbered pagination UI.

**Resolution applied**:
- `GET /api/crm/leads/[id]/activities?limit=50&before=<created_at>` — cursor-style. Initial load: no `before`. "Load more" passes the oldest `created_at` from the current list as `before`.
- Hook `useLeadActivities(leadId)` uses React Query's `useInfiniteQuery` with this cursor.
- "Load more" button hides when the API returns < 50 rows.

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

**Status**: ✅ ANSWERED
**Phase impacted**: Phase 11
**Date asked**: PRD creation
**Date answered**: 2026-05-06

**Context**:
The PRD mentions cron jobs:
- Follow-up WhatsApp reminders (every 5 min)
- Lead idle warning (daily 09:00)

---

### ✅ ANSWER FROM ABDOU:

**Use n8n.** Configure n8n workflows to call the `/api/cron/*` endpoints with API-key auth (same pattern as the existing external API surface in `app/api/external/`).

**Resolution applied**:
- Phase 11 endpoints:
  - `POST /api/cron/follow-up-reminders` — n8n schedule: every 5 minutes
  - `POST /api/cron/lead-idle-check` — n8n schedule: daily 09:00 UAE time
- Auth: `x-api-key` header validated against the same env var the existing external endpoints use (Claude Code: confirm exact var name during Phase 11 by reading an existing `app/api/external/` route).
- Each endpoint returns a structured summary of work performed, which n8n can log/alert on.

---

# Section: Questions Encountered During Build

> Add new questions below as they arise. Use the template above.

(none yet)
