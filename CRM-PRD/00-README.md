# Pyramedia CRM — PRD Package

> **Version**: 1.0
> **Target Codebase**: `pyra-workspace3` (Next.js 15 + Supabase + shadcn/ui)
> **Production URL**: `https://workspace.pyramedia.cloud`
> **Owner**: Abdou (Sales Manager + Pyramedia Founder)
> **Implementer**: Claude Code

---

## ⚠️ READ THIS FIRST — NON-NEGOTIABLE RULES

This PRD describes the rebuild of the Sales Module inside `pyra-workspace3`. The **current** sales module is considered "زي الزفت ومعقد" by the owner — but its **DATA IS PRODUCTION** and must be preserved.

### The 5 Cardinal Rules

1. **NO DATA LOSS** — Every existing row in `pyra_sales_leads`, `pyra_lead_activities`, `pyra_sales_pipeline_stages`, `pyra_sales_labels`, `pyra_lead_labels` must remain accessible after migration. Drops are forbidden. Renames require a rollback plan.

2. **NO PARALLEL DATABASE** — Do not create a new schema, separate auth, or separate user table. Everything extends the existing `pyra_*` tables in the existing Supabase instance. Single source of truth.

3. **NO ASSUMPTIONS — IF UNSURE, STOP** — When this PRD lacks a detail, when a column shape doesn't match, when an existing helper behaves unexpectedly, **stop and write the question to `06-OPEN-QUESTIONS.md`**. Do not improvise. Abdou is reachable through Claude (the conversational AI assistant) — questions get answered.

4. **PHASE GATES ARE MANDATORY** — Every phase in `05-EXECUTION-PHASES.md` ends with verification queries. Run them. If a single check fails, do not advance to the next phase. Roll back, fix, then re-verify.

5. **MATCH EXISTING CONVENTIONS** — All code follows the conventions in the repo's existing `CLAUDE.md`. This means:
   - React Query hooks (NEVER raw `fetch()`)
   - `apiSuccess()` / `apiError()` for API responses
   - `requireApiPermission()` for API gates
   - `notify()` for notifications (NEVER direct INSERT into `pyra_notifications`)
   - `canApproveFor()` for approval scope
   - `hasPermission()` for permission checks
   - `logActivity()` for audit trail
   - Status constants from `lib/constants/statuses.ts`
   - RTL rules: `ms-`/`me-`/`ps-`/`pe-` (NEVER `ml-`/`mr-`/`pl-`/`pr-`)
   - Permission naming: `*.view` / `*.create` / `*.approve` / `*.manage`

---

## Files in This Package

| # | File | Purpose | Read When |
|---|------|---------|-----------|
| 00 | `00-README.md` | This file. Index + safety rules. | First. Always. |
| 01 | `01-OVERVIEW-AND-SCOPE.md` | Product vision, audiences, success metrics, what's out-of-scope. | Before any planning. |
| 02 | `02-DATABASE-AND-MIGRATION.md` | Full schema changes, new tables, column extensions, RLS, migration scripts with rollback. | Before any DB work. |
| 03 | `03-API-AND-PERMISSIONS.md` | Every API endpoint, permission gate, RBAC additions, notification types. | Before writing API routes. |
| 04 | `04-UI-PAGES-AND-COMPONENTS.md` | Page routes, hooks needed, component breakdown, tabs, modals. | Before writing UI. |
| 05 | `05-EXECUTION-PHASES.md` | The phased rollout plan with checkpoints and rollback triggers. | Continuously, throughout build. |
| 06 | `06-OPEN-QUESTIONS.md` | Where Claude Code MUST stop and ask the owner. | Whenever in doubt. |

---

## How to Use This PRD

**Phase 0: Pre-Build (1–2 hours)**
1. Read `00-README.md` (this file) + `01-OVERVIEW-AND-SCOPE.md` end-to-end.
2. Read the existing repo's `CLAUDE.md`, `DATABASE-SCHEMA.md`, and `docs/ARCHITECTURE.md` again — these are your authoritative references for conventions.
3. **Verify your understanding** by answering these questions to yourself (don't write code yet):
   - Why does Lead = Customer Account in this design? (See `01-OVERVIEW...` § Architectural Model)
   - What happens to `pyra_sales_leads` rows during migration? (See `02-DATABASE...` § Migration)
   - Who can approve a "Closed Won" status change? (See `03-API...` § Approval Workflow)
4. Run the **Pre-Build Inventory Queries** at the bottom of this file. Save results. They form the baseline for verification.

**Phase 1+: Build**
- Follow `05-EXECUTION-PHASES.md` strictly. Each phase has entry checks, work items, and exit verification.
- After each work item: run `pnpm tsc --noEmit && pnpm build`. If either fails, stop and fix before continuing.
- If you hit a question not answered in the PRD: add it to `06-OPEN-QUESTIONS.md` with full context, then ask Abdou through Claude.

---

## Pre-Build Inventory Queries (RUN BEFORE STARTING)

Run these against the live DB at `pyraworkspacedb.pyramedia.cloud` and save outputs to `/CRM-PRD/baseline-inventory.txt`. This gives you the exact "before" state for verification.

```sql
-- 1. Existing sales lead count + breakdown
SELECT
  COUNT(*) AS total_leads,
  COUNT(*) FILTER (WHERE is_converted = true) AS converted,
  COUNT(*) FILTER (WHERE is_converted = false OR is_converted IS NULL) AS active,
  COUNT(DISTINCT assigned_to) AS unique_owners,
  COUNT(DISTINCT source) AS unique_sources
FROM pyra_sales_leads;

-- 2. Lead activities count
SELECT
  COUNT(*) AS total_activities,
  COUNT(DISTINCT lead_id) AS leads_with_activity
FROM pyra_lead_activities;

-- 3. Existing pipeline stages
SELECT id, name, name_ar, sort_order, is_default
FROM pyra_sales_pipeline_stages
ORDER BY sort_order;

-- 4. Existing labels
SELECT id, name, name_ar, color FROM pyra_sales_labels;

-- 5. Sales agents
SELECT username, display_name, role, manager_username, status
FROM pyra_users
WHERE role = 'sales_agent' OR 'sales_agent' = ANY(SELECT jsonb_array_elements_text(extra_permissions));

-- 6. Existing follow-ups (if table exists)
SELECT COUNT(*) AS total_followups FROM pyra_sales_follow_ups;

-- 7. Contracts/invoices linked to clients (will be linked to leads post-migration)
SELECT
  (SELECT COUNT(*) FROM pyra_contracts) AS contracts,
  (SELECT COUNT(*) FROM pyra_invoices) AS invoices,
  (SELECT COUNT(*) FROM pyra_clients) AS clients;
```

**Save the output. You will compare against it after every migration step.**

---

## When to Stop and Ask

You **MUST** stop work and ask the owner via `06-OPEN-QUESTIONS.md` when:

- A column referenced in this PRD doesn't exist in the live DB exactly as described.
- A migration step would change row counts in unexpected ways (e.g., a JOIN reduces rows).
- An existing helper (`notify`, `canApproveFor`, `hasPermission`) behaves differently than this PRD describes.
- You discover existing code that contradicts something in this PRD.
- You're about to make an irreversible change (DROP, DELETE, RENAME without a rollback path).
- You're tempted to "just guess" something. **Especially then.**

**Format for asking**:

```markdown
## Q-NNN — [short title]

**Context**: What I'm trying to do
**Where I'm stuck**: What's missing/unclear/contradictory
**Affected files/tables**: ...
**My best guess** (if any): ...
**Blocker?**: Yes/No — does this prevent me from continuing?
```

---

## Definition of Done (overall)

The CRM is "done" when:

- [ ] All existing `pyra_sales_leads` data migrated with row count match (lossless)
- [ ] All 5 audiences from existing CLAUDE.md served correctly (Admin / Employee / Sales Agent / Manager / Client)
- [ ] All UI pages from `04-UI...` render with no console errors
- [ ] All API endpoints from `03-API...` pass their acceptance tests
- [ ] Manager Approval workflow for "Closed Won" enforces both conditions (approver scope + attachment requirement)
- [ ] Sales agent (Sayed) can only see own leads on `/dashboard/crm/pipeline` (verified with non-admin login)
- [ ] Mobile PWA works: tested on a real iPhone or Android Chrome adding the page to home screen
- [ ] All notification types fire via `notify()` (no direct INSERTs)
- [ ] `pnpm build` passes with zero errors
- [ ] `pnpm tsc --noEmit` passes
- [ ] At least one full Lead lifecycle (New Inquiry → Closed Won → Active Customer) tested end-to-end
- [ ] Old Sales Module pages either removed OR redirected to new pages (no dead links)

---

## Rollback Strategy (if something goes catastrophically wrong)

Each phase in `05-EXECUTION-PHASES.md` has a "Rollback" section. The general principle:

- **Schema changes** → keep the OLD column/table around for one full release cycle. Don't drop until verified.
- **Data migrations** → write migrations as **idempotent** (can be re-run safely). Always include the inverse.
- **Breaking changes** → never; every API change must support old behavior for one cycle.
- **If rollback needed** → restore from Supabase point-in-time backup (available for 7 days), then re-plan.

---

> **Remember**: this is not a greenfield rebuild. It's surgery on a living system. Move carefully, verify often, ask when unsure.
