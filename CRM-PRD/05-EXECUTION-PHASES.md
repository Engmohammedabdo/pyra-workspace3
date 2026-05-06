# 05 — Execution Phases

> The phased rollout plan. **Each phase has entry conditions, work items, and exit verification gates.** Do not advance until exit verification passes.

---

## Operating Principles

1. **One phase at a time.** Don't start Phase N+1 until Phase N is fully verified.
2. **Each phase ends with a checkpoint.** The checkpoint is a list of verification queries/checks. **Every check must pass.** A single failure → halt and investigate.
3. **Commit at every milestone.** Each phase has 2–4 commits. Push to remote after every commit (Coolify auto-deploys).
4. **Verify on the live system after each commit** (Coolify deploys to `workspace.pyramedia.cloud`). If something breaks live, roll back immediately.
5. **Open Questions are blocking.** If a question in `06-OPEN-QUESTIONS.md` is unanswered and you need that answer to proceed → STOP and wait.

---

## Phase 0 — Pre-Build Setup

**Duration estimate**: 2–4 hours
**Goal**: Establish baseline, read PRD, verify environment.

### Work Items

- [ ] Read all 7 files in `/CRM-PRD/` end to end.
- [ ] Re-read `/CLAUDE.md`, `/DATABASE-SCHEMA.md`, `/docs/ARCHITECTURE.md` from the repo. These are your authoritative references.
- [ ] Run **all queries** in `00-README.md` § Pre-Build Inventory Queries. Save output to `/CRM-PRD/baseline-inventory.txt`.
- [ ] Run **all queries** in `02-DATABASE-AND-MIGRATION.md` § Phase 1. Save output to `/CRM-PRD/baseline-schema.txt`.
- [ ] Compare baseline to PRD assumptions. **Any mismatch** → write a Q-DB-NNN entry in `06-OPEN-QUESTIONS.md`. **Do not proceed** until answered.
- [ ] Confirm production URL is accessible: `https://workspace.pyramedia.cloud` returns valid response.
- [ ] Confirm DB is accessible via the migration endpoint:
  ```bash
  curl -X POST "https://pyraworkspacedb.pyramedia.cloud/pg/query" \
    -H "Content-Type: application/json" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -d '{"query": "SELECT 1 as ok;"}'
  ```
  Expected: `[{"ok":1}]`.
- [ ] Create a feature branch: `git checkout -b feat/crm-rebuild-v1`
- [ ] Commit baseline files: `git add CRM-PRD/baseline-*.txt && git commit -m "chore(crm): baseline inventory before rebuild"`

### Exit Gate

- [ ] All baseline files saved
- [ ] No unanswered Q-DB or Q-API in `06-OPEN-QUESTIONS.md`
- [ ] Feature branch created and pushed
- [ ] `pnpm tsc --noEmit && pnpm build` passes on `main` (sanity)

---

## Phase 1 — Database Foundation (Schema Extensions)

**Duration estimate**: 3–5 hours
**Goal**: Apply additive schema changes. **No data movement yet.**

### Entry Conditions

- [ ] Phase 0 complete
- [ ] No blocking Q-DB questions

### Work Items

- [ ] Run migration `crm_001_extend_sales_leads.sql` (see `02-DATABASE...`)
- [ ] Run verification queries
- [ ] Run migration `crm_002_pipeline_stages.sql`
- [ ] Run verification queries
- [ ] Run migration `crm_004_link_contracts_to_leads.sql`
- [ ] Run verification queries (some contracts will remain unlinked — that's OK)
- [ ] Run migration `crm_005_lead_activity_types.sql`
- [ ] Update `lib/constants/statuses.ts` with `LEAD_ACTIVITY_TYPES`, `LEAD_ACTIVITY_LABELS_AR`, `PIPELINE_STAGE_IDS`
- [ ] Update `lib/notifications/notify.ts` `NotificationType` union with new types
- [ ] Add `lib/auth/lead-scope.ts` with `canAccessLead` and `getLeadScopeFilter`
- [ ] `pnpm tsc --noEmit && pnpm build` passes
- [ ] Commit: `chore(crm): phase 1 — schema extensions and helpers`
- [ ] Push and verify deploy succeeds

### Exit Gate

- [ ] Row count in `pyra_sales_leads` unchanged from baseline
- [ ] All new columns present per `02-DATABASE...` § Phase 2
- [ ] All 7 new pipeline stages present
- [ ] `pyra_contracts` has nullable `lead_id` column with FK
- [ ] `pyra_lead_activities` has `metadata` jsonb column
- [ ] TypeScript types updated (`types/database.ts` reflects new columns)
- [ ] Build passes; deploy succeeds
- [ ] **DO NOT REMAP LEADS YET — that is Phase 2**

### Rollback (if exit gate fails)

- Run DOWN sections of each migration in reverse order
- Verify `pyra_sales_leads` row count = baseline
- Restore TypeScript types

---

## Phase 2 — Lead Stage Remap (NOW LOW RISK — see Q-DB-002 answer)

**Duration estimate**: 30 minutes
**Goal**: Move all existing leads to `stg_new_inquiry` (or `stg_closed_won` if already converted). Sales agents will manually re-stage leads after launch.

### Entry Conditions

- [ ] Phase 1 complete and verified
- [ ] Q-DB-002 answer applied: simplified migration (no mapping needed)
- [ ] Q-OPS-001 answer applied: this migration is now Tier 1 SAFE — execute directly

### Work Items

- [ ] Run `crm_003_remap_leads.sql` directly (per Q-OPS-001 Tier 1 — no approval needed because it's deterministic)
- [ ] Run all verification queries from `02-DATABASE...` § Phase 4 Verification
- [ ] Show distribution to Abdou: "X leads in stg_new_inquiry, Y leads in stg_closed_won" — for awareness, not approval
- [ ] Commit migration file: `feat(crm): phase 2 — move all leads to new_inquiry, converted to closed_won`
- [ ] DO NOT delete `legacy_stage_id` or old stage rows. Cleanup deferred to v1.1.
- [ ] After full deployment: communicate to Sayed (in WhatsApp or in-app) that he needs to review his leads and re-stage them

### Exit Gate

- [ ] 0 leads with `stage_id` not starting with `stg_`
- [ ] Total lead count unchanged (matches baseline-inventory.txt #1)
- [ ] All leads have `legacy_stage_id` populated (for rollback)
- [ ] Build passes

### Rollback (if ever needed)

```sql
UPDATE pyra_sales_leads SET stage_id = legacy_stage_id;
ALTER TABLE pyra_sales_leads DROP COLUMN IF EXISTS legacy_stage_id;
```

---

## Phase 3 — Backend APIs (Read-Only First)

**Duration estimate**: 1–2 days
**Goal**: Build all GET endpoints. UI cannot work without these.

### Entry Conditions

- [ ] Phase 2 complete
- [ ] No blocking Q-API questions

### Work Items

#### 3.1 — Permission additions

- [ ] Add CRM permissions to `lib/auth/rbac.ts` (see `03-API...` § New RBAC Permissions)
- [ ] Update `ROLE_EXTRAS.sales_agent` with new permissions
- [ ] Verify Sayed's actual user record loads with new permissions:
  ```sql
  SELECT username, role, permissions FROM pyra_users WHERE username = 'sayed';
  -- The `permissions` jsonb may need refresh — clear his session if needed.
  ```

#### 3.2 — GET endpoints (read-only)

Build in this order (each is a separate commit + push):

1. [ ] `GET /api/crm/pipeline-stages` (the simplest)
2. [ ] `GET /api/crm/leads` (list with filters and scope)
3. [ ] `GET /api/crm/leads/[id]` (single)
4. [ ] `GET /api/crm/leads/[id]/activities`
5. [ ] `GET /api/crm/follow-ups`
6. [ ] `GET /api/crm/dashboard/kpis`
7. [ ] `GET /api/crm/dashboard/funnel`
8. [ ] `GET /api/crm/dashboard/deals-at-risk`
9. [ ] `GET /api/crm/dashboard/team-performance`
10. [ ] `GET /api/crm/dashboard/recent-activity`
11. [ ] `GET /api/crm/dashboard/ai-insights`
12. [ ] `GET /api/crm/approvals/pending`

**Test each one with curl** before moving on:

```bash
# Sayed's session (sales_agent — should see only own leads)
curl https://workspace.pyramedia.cloud/api/crm/leads \
  -H "Cookie: ..." | jq '.data.leads[] | .assigned_to' | sort | uniq

# Should print only "sayed" (one value).

# Abdou's session (admin)
curl https://workspace.pyramedia.cloud/api/crm/leads \
  -H "Cookie: ..." | jq '.data.leads[] | .assigned_to' | sort | uniq

# Should print all assignees.
```

#### 3.3 — React Query hooks

- [ ] Create all hooks listed in `04-UI...` § Required Hooks
- [ ] Each hook follows the exact pattern in `hooks/useClients.ts`

### Exit Gate

- [ ] All 12 GET endpoints return valid responses
- [ ] Sayed gets scoped responses; Abdou gets full responses
- [ ] All hooks compile
- [ ] `pnpm tsc --noEmit && pnpm build` passes
- [ ] No raw `fetch()` in any new component (existing eslint guard catches)

---

## Phase 4 — Pipeline UI (Read-Only)

**Duration estimate**: 2–3 days
**Goal**: First user-visible page. Pipeline view + filters + clickable cards.

### Entry Conditions

- [ ] Phase 3 GET endpoints all working

### Work Items

- [ ] Build sidebar updates (CRM section)
- [ ] Build `/dashboard/crm` route (server + client components)
- [ ] Build `/dashboard/crm/pipeline/page.tsx` + `pipeline-client.tsx`
- [ ] Build all components under `components/crm/pipeline/`
- [ ] Build all components under `components/crm/lead/` (badges, pills, icons)
- [ ] Pipeline cards link to (placeholder) `/dashboard/crm/leads/[id]`
- [ ] Drag-and-drop is **disabled** in this phase (visual only)
- [ ] Filter bar fully functional (search, owner filter for admin, source, date)

### Exit Gate

- [ ] Pipeline page renders for Abdou (admin)
- [ ] Pipeline page renders for Sayed with own-only leads
- [ ] Sidebar items hidden for Sayed where appropriate
- [ ] Filter bar updates query params and re-fetches
- [ ] No console errors
- [ ] Mobile (responsive) view: stage tabs work, cards stack vertically
- [ ] Visual matches `pyramedia-crm.html` mockup
- [ ] Visual matches `pyramedia-mobile.html` mockup for mobile breakpoint

---

## Phase 5 — Lead Detail Page (Read-Only)

**Duration estimate**: 2 days

### Work Items

- [ ] Build `/dashboard/crm/leads/[id]` route
- [ ] Build `lead-header.tsx`, `lead-stat-cards.tsx`, `lead-tabs.tsx`
- [ ] Build all 5 tab components (Overview, Activities, Deals, Files, Notes)
- [ ] Build `activity-timeline.tsx` and `activity-item.tsx`
- [ ] Sidebar with contact info, follow-up, tags
- [ ] Tab switching via URL query param (`?tab=activity`)

### Exit Gate

- [ ] Clicking pipeline card opens lead detail
- [ ] All 5 tabs render correctly
- [ ] Timeline shows correct activity types with icons
- [ ] Filter chips on Activity tab work
- [ ] Visual matches `pyramedia-crm.html` § Lead Detail modal

---

## Phase 6 — Mutations (Create + Update)

**Duration estimate**: 2 days

### Work Items

- [ ] `POST /api/crm/leads` (create)
- [ ] `PATCH /api/crm/leads/[id]`
- [ ] `POST /api/crm/leads/[id]/activities` (manual notes/calls/meetings)
- [ ] `POST /api/crm/follow-ups`
- [ ] `POST /api/crm/follow-ups/[id]/complete`
- [ ] `useCreateLead`, `useUpdateLead`, `useCreateLeadActivity` hooks
- [ ] Add Lead modal component (`add-lead-modal.tsx` + sub-components)
- [ ] Activity composer on Lead Detail (note/call/meeting/file)
- [ ] Quick-action buttons in Lead Header (WhatsApp, Call, Email, Note, Schedule)

### Acceptance Tests

Manually run through these:

1. [ ] Open Add Lead from any CRM page → fill form → submit → see new lead in pipeline
2. [ ] Edit lead name on detail page → save → reflected on pipeline card
3. [ ] Add a note → appears at top of activity timeline
4. [ ] Schedule follow-up → appears in `/dashboard/crm/follow-ups`
5. [ ] Complete a follow-up → status changes, activity logged

### Exit Gate

- [ ] All mutations work
- [ ] Activities log correctly for each mutation
- [ ] Notifications fire (check `pyra_notifications` table after each test)
- [ ] No console errors

---

## Phase 7 — Stage Movement + Approval Workflow (HIGH RISK)

**Duration estimate**: 2 days

### Work Items

- [ ] Enable drag-and-drop on Pipeline (with `@dnd-kit`)
- [ ] `POST /api/crm/leads/[id]/move-stage` endpoint with all validation logic
- [ ] `useMoveLeadStage` hook
- [ ] Drag handler validates target stage; shows confirmation modal for `contract_signed`
- [ ] Modal: "Attach contract or invoice" picker
- [ ] `POST /api/crm/leads/[id]/approve-close-win` endpoint
- [ ] `/dashboard/crm/approvals` page
- [ ] Approval queue card with one-click approve/reject
- [ ] Reject modal asks for reason
- [ ] Notifications wired up via `notify()`:
  - On move to `contract_signed` → notify(manager, 'lead_closed_won_pending_approval')
  - On approve → notify(sales_agent, 'lead_closed_won_approved')
  - On reject → notify(sales_agent, 'lead_closed_won_rejected', message: reason)
- [ ] My Work Inbox shows `lead_closed_won_pending_approval` for managers

### Critical Acceptance Tests

These are **MANDATORY** before exit gate. If any fails, do not proceed.

1. [ ] **Sayed cannot move directly to closed_won** (drag is blocked or returns 422)
2. [ ] **Sayed moves to contract_signed without attachment** → blocked
3. [ ] **Sayed moves to contract_signed with contract** → notification appears in Abdou's bell within seconds
4. [ ] **Abdou opens approvals page → sees the lead → clicks approve** → lead becomes closed_won
5. [ ] **Sayed receives notification** of approval
6. [ ] **Sayed cannot call /approve endpoint directly** (403)
7. [ ] **Activity timeline shows complete chain**: stage_change → closed_won_pending → closed_won_approved
8. [ ] **No `INSERT INTO pyra_notifications` outside `notify()`** (grep the codebase to confirm)

### Exit Gate

- [ ] All 8 acceptance tests pass
- [ ] No `console.error` during the flow
- [ ] Notifications appear correctly in Abdou's and Sayed's bells

---

## Phase 8 — Sales Dashboard Page

**Duration estimate**: 2 days

### Work Items

- [ ] Build `/dashboard/crm` (the dashboard)
- [ ] All 9 dashboard components from `04-UI...`
- [ ] AI Insights server-side rules in `/api/crm/dashboard/ai-insights`
- [ ] Greeting based on time of day
- [ ] All KPI cards animate trend indicators
- [ ] Funnel viz with click-through to filtered Pipeline
- [ ] Deals-at-risk list with WhatsApp reminder action

### Exit Gate

- [ ] Dashboard matches `pyramedia-dashboard.html` mockup
- [ ] All numbers match the underlying queries (sanity check 2-3 manually)
- [ ] AI insight banner shows for relevant conditions
- [ ] "Show team filter" option visible only to managers

---

## Phase 9 — Active Customer Page (Contracts Tab)

**Duration estimate**: 2 days

### Work Items

- [ ] Build `/dashboard/crm/customers/[id]`
- [ ] All customer-detail components from `04-UI...`
- [ ] **Critical**: Contracts tab pulls multiple contracts under one lead
- [ ] Billing history mini-grid for retainer contracts
- [ ] Milestones display for project contracts
- [ ] Health Score ring (SVG)
- [ ] Portal Access toggle (calls a new tiny endpoint to set/unset `pyra_clients` linkage)
- [ ] `POST /api/crm/leads/[id]/convert-to-customer` endpoint

### Exit Gate

- [ ] Customer page matches `pyramedia-customer.html` mockup
- [ ] At least one converted lead with multiple contracts displayed correctly
- [ ] Portal toggle creates/removes pyra_clients row (idempotent)
- [ ] Existing customers (with no lead) still appear in `/dashboard/finance` flows (not broken)

---

## Phase 10 — Mobile PWA Polish

**Duration estimate**: 1–2 days

### Work Items

- [ ] Add `manifest.json`
- [ ] Mobile-specific components (bottom nav, FAB)
- [ ] Test on real devices: iPhone Safari + Android Chrome
- [ ] Test "Add to Home Screen" flow
- [ ] Verify all CRM pages render correctly < 768px
- [ ] Test stage tab horizontal scroll
- [ ] Test pipeline card actions (call, WhatsApp)

### Exit Gate

- [ ] Sayed installs PWA on his phone successfully
- [ ] All key actions (view leads, add note, mark follow-up complete) work on mobile
- [ ] WhatsApp deep links work (tap WhatsApp button → opens WhatsApp with prefilled context)

---

## Phase 11 — Cron Jobs + WhatsApp Integration

**Duration estimate**: 1 day

### Work Items

- [ ] `POST /api/cron/follow-up-reminders` endpoint with API-key auth
- [ ] `POST /api/cron/lead-idle-check` endpoint
- [ ] Configure cron schedule (existing infra: n8n or external scheduler)
- [ ] WhatsApp webhook update: match phone → log activity to lead

### Exit Gate

- [ ] Manually triggering follow-up reminder cron sends WhatsApp message via Evolution
- [ ] Manually triggering idle check creates `idle_warning` activities
- [ ] WhatsApp message from a known lead's number creates an inbound activity within 30 sec

---

## Phase 12 — Old Sales Module Sunset

**Duration estimate**: 0.5 days

### Work Items

- [ ] Add 301 redirects from `/dashboard/sales/leads` → `/dashboard/crm/leads`, etc.
- [ ] Remove sidebar links to old pages
- [ ] Add deprecation banner to old pages (if not redirecting): "This page is deprecated, please use [new route]"
- [ ] Do NOT delete old code yet (defer to v1.1)

### Exit Gate

- [ ] No dead links from any visible nav
- [ ] Old URLs redirect cleanly

---

## Phase 13 — Documentation + Handoff

**Duration estimate**: 0.5 days

### Work Items

- [ ] Update `/CLAUDE.md` with CRM section (architecture overview, helpers, route map)
- [ ] Update `/DATABASE-SCHEMA.md` with all new columns
- [ ] Update `/docs/SYSTEM-STRUCTURE.md` with new routes
- [ ] Update `/docs/FEATURE-IMPACT-MAP.md` with CRM connections
- [ ] Add a CRM Module Guide to `lib/config/module-guide.ts`
- [ ] Final commit: `docs(crm): update architecture documentation for v1`

### Exit Gate

- [ ] All docs updated
- [ ] Final `pnpm build` clean
- [ ] PR description summarizes all phases
- [ ] Production deploy successful
- [ ] **Final smoke test by Abdou** — sign off needed

---

## Phase Summary Timeline (rough)

| Phase | Days | Cumulative |
|-------|------|------------|
| 0. Setup | 0.25 | 0.25 |
| 1. Schema foundation | 0.5 | 0.75 |
| 2. Lead remap | 0.25 | 1 |
| 3. Backend APIs (read) | 2 | 3 |
| 4. Pipeline UI | 2.5 | 5.5 |
| 5. Lead Detail | 2 | 7.5 |
| 6. Mutations + Add Lead | 2 | 9.5 |
| 7. Stage movement + Approval | 2 | 11.5 |
| 8. Dashboard | 2 | 13.5 |
| 9. Active Customer | 2 | 15.5 |
| 10. Mobile PWA | 1.5 | 17 |
| 11. Crons + WhatsApp | 1 | 18 |
| 12. Sunset old module | 0.5 | 18.5 |
| 13. Docs + handoff | 0.5 | 19 |

**Total: ~3–4 weeks of focused build time** for a single experienced developer + AI assistant pairing.

---

## Final Sign-off Checklist (before declaring v1 complete)

Run through this with Abdou before closing the PR:

- [ ] Can Sayed log in and see only his leads?
- [ ] Can Abdou see all leads in his Pipeline view?
- [ ] Does the existing customer (متحف الإمارات or similar with multiple contracts) show all contracts on the new Customer page?
- [ ] Can Sayed add a new lead via mobile?
- [ ] Can Sayed move a lead through stages via drag-drop?
- [ ] When Sayed moves to Contract Signed, does Abdou get a notification within 30 seconds?
- [ ] Can Abdou approve from `/dashboard/crm/approvals`?
- [ ] Does Sayed receive an "approved" notification?
- [ ] Does the new lead's data round-trip correctly (Pipeline → Lead Detail → Activity Timeline → after Closed Won → Customer Detail with contracts)?
- [ ] Are old leads' data accessible (legacy_stage_id preserved)?
- [ ] Does WhatsApp message auto-log to the right lead?
- [ ] Does the Sales Dashboard show real numbers (not zeros)?

If all checked → **v1 is done.** Celebrate (briefly), then plan v1.1.
