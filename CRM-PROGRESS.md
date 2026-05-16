# CRM Module — Build Progress

> **🎉 CRM BUILD COMPLETE — 13/13 phases shipped.**
> Phases 0–9 + 10 + 11 + 11 Refinement + 11.5 + 12 + 13 all closed.
> Next: v1.1 maintenance scope (operational + code follow-ups
> documented at the bottom of this file).

Tracks CRM rebuild phases per `/CRM-PRD/05-EXECUTION-PHASES.md`.

> **Phase numbering note:** This is the **CRM-specific** phase tracker.
> The workspace-level `PROGRESS.md` uses its own phase numbering for
> the original ERP build (Phase 1 = Foundation, Phase 7 = Realtime &
> Notifications, Phase 8 = Advanced File Features, etc.) and is
> unrelated. **CRM Phase 7 ≠ Workspace Phase 7.** Don't confuse the two.

> **Execution order note (post-Phase-11):** PRD numbering is kept
> below for traceability, but the actual remaining execution order
> is now: **11 → 11.5 → 10 → 12 → 13.** Phase 11.5 (Lead-Client
> Linking UI) was inserted after Phase 11 closure to address a gap
> revealed by the manual SQL fix done during Phase 11. Phase 10
> (Mobile PWA Polish) was already deferred from Phase 7 per
> Q-UI-001; it now lands after 11.5. Phase 13 (Visual Polish) is
> the visual-only finishing pass.

---

## CRM Phase 0 — Pre-flight & PRD lock-in ✅
**Status:** Complete
- 9 open questions answered, Cardinal Rules locked
- Q-OPS-001 (migrations) + Q-DB-002 (column types) confirmed
- Existing schema audited for compatibility

## CRM Phase 1 — Database (Tier-1 additive migrations) ✅
**Status:** Complete
- New tables / columns added without disturbing existing data
- All migrations executed via the standard `pg/query` endpoint

## CRM Phase 2 — Database (Tier-2 lead-to-stage remap, idempotent) ✅
**Status:** Complete
- Legacy leads (5 created via old module post-Phase-2) caught with
  migration 011 catch-up remap
- Idempotency verified by re-running

## CRM Phase 3 — GET endpoints + React Query hooks ✅
**Status:** Complete
- 12 GET endpoints under `app/api/crm/...`
- React Query hooks in `hooks/`

## CRM Phase 4 — Sidebar + routing + Add Lead modal ✅
**Status:** Complete
- Unified CRM sidebar group
- `+ Lead جديد` button + modal global to all CRM pages

## CRM Phase 5 — Lead Detail page ✅
**Status:** Complete
- `/dashboard/crm/leads/[id]` with tabs: details, activity,
  follow-ups, messages, contracts

## CRM Phase 6 — Follow-ups (with optimistic mark-complete) ✅
**Status:** Complete
- Sidebar follow-up panel + dedicated page
- Optimistic mark-complete with toast + rollback on error

## CRM Phase 7 — Manager Approval Workflow + Drag-Drop Pipeline ✅
**Status:** ✅ **COMPLETE** | **Date:** 2026-05-08

### Chunks delivered
- **Chunk 1** (Backend): manager approval mutation chain + 5 new
  notification types + canApproveFor scope guard on mutations
- **Chunk 2** (Approvals UI): `/dashboard/crm/approvals` dashboard with
  lead summary + attachment preview + approve/reject buttons
- **Chunk 3** (Drag-drop pipeline): @dnd-kit kanban with multiple
  iterations to land the working pattern (3.1 collision detection →
  3.2 optimistic update → 3.3 dispatch routing → 3.4 closed_won client
  guard → DragOverlay-invisibility series ending with adoption of the
  `project-kanban.tsx` working pattern + RTL fix via `pointerWithin`)
- **Chunk 4 + 5 (mobile picker, acceptance tests):** ABANDONED — mobile
  picker scoped to Phase 10 per Q-UI-001 deviation; acceptance was
  satisfied via the 8-test exit gate below

### Exit Gate — 8/8 tests passed ✅

| # | Test | Method | Status |
|---|------|--------|---|
| 1 | Sales agent (Sayed) cannot move directly to closed_won | Client-side guard + UI test (y) | ✅ |
| 2 | Move to contract_signed without attachment → blocked | Backend test (b) via curl | ✅ |
| 3 | Move to contract_signed WITH attachment → manager bell notification | Live E2E (Sayed → Abdou) | ✅ |
| 4 | Manager approves → lead becomes closed_won | Chunk 2 test (j) | ✅ |
| 5 | Sayed receives approval notification | Live E2E | ✅ |
| 6 | Sayed cannot call /approve endpoint directly (403) | Backend test (f) via curl | ✅ |
| 7 | Activity timeline shows full chain (stage_change → closed_won_pending → closed_won_approved) | Live E2E timeline inspection | ✅ |
| 8 | No raw `INSERT INTO pyra_notifications` outside `notify()` helper | Static `Grep` across `*.ts/*.tsx` — zero matches | ✅ |

### Locked deviations (transcribed into CLAUDE.md "CRM Module — Locked Decisions")

1. **Q-UI-001:** Mobile stage picker → deferred to Phase 10
2. **Option (iii):** My Work Inbox `closed_won_pending` satisfied
   implicitly via bell + `/dashboard/crm/approvals`
3. **Pipeline kanban:** 3 architectural deviations from
   `project-kanban.tsx` (opacity-0 source, dropAnimation:null,
   pointerWithin collision)

### Notable commits in Phase 7

```
86e3c8f docs(crm): record Q-UI-001 deviation — mobile stage picker scoped to Phase 10
3c705b3 docs(crm): lock Option (iii) on My Work Inbox closed_won_pending
899c69f docs(crm): redirect handoff — Phase 7 Exit Gate, NOT Chunk 4 mobile picker
ed3fb47 fix(crm): pipeline collision detection — pointerWithin for RTL
6f926d8 fix(crm): pipeline drag-drop — adopt project-kanban pattern
aed3371 fix(crm): pipeline DragOverlay invisibility — separate overlay component
```

---

## CRM Phase 8 — Sales Dashboard Page ✅
**Status:** ✅ **COMPLETE** | **Date:** 2026-05-09 | **Final feature commit:** `441e1af`

Page route: `/dashboard/crm` (the main CRM dashboard).

### Components delivered (9 of 9)

| # | Component | Cluster | Commit |
|---|---|---|---|
| 1 | `dashboard-greeting.tsx` | 1 | `4b409c9` |
| 2 | `dashboard-ai-insight.tsx` | 1 | `4b409c9` |
| 3 | `dashboard-data-sources.tsx` | 1 | `4b409c9` |
| 4 | `dashboard-kpi-cards.tsx` | 2 | `6db16ae` |
| 5 | `dashboard-funnel.tsx` | 2 | `6db16ae` |
| 6 | `dashboard-deals-at-risk.tsx` | 3 | `9e594aa` |
| 7 | `dashboard-activity-feed.tsx` | 3 | `9e594aa` |
| 8 | `dashboard-action-cards.tsx` | 3 | `9e594aa` |
| 9 | `dashboard-team-performance.tsx` | 4 | `5b6ddf2` |

Plus shared util `lib/utils/whatsapp.ts` (Cluster 3) and final assembly
in `app/dashboard/crm/dashboard-client.tsx` (Step 5 commit `441e1af`).

### Backend audit + extensions

All 6 GET endpoints under `app/api/crm/dashboard/` were already
scaffolded by an earlier exploration. Phase 8 audited them (Step 1) and
extended surgically (Step 1.5):
- `kpis/route.ts` — kept as-is (cash-basis revenue from `pyra_payments` verified)
- `funnel/route.ts` — kept as-is
- `deals-at-risk/route.ts` — added `deal_type` to `.select()` (commit `9e594aa`) for the WhatsApp template
- `team-performance/route.ts` — kept as-is
- `recent-activity/route.ts` — kept as-is (`lead_activities.view` permission preserved per Q-AUDIT-3)
- `ai-insights/route.ts` — extended (commit `6271119`):
  - Added `'critical'` to severity union + `SEVERITY_RANK` table
  - Pending approvals: `critical` when count > 5, `high` when 1-5
  - Idle deals: `high` when count >= 3 (was high>=5 / medium>=3)
  - Overdue follow-ups: `high` when count > 5, `medium` when 1-5
  - NEW rule: `followups_today` (medium severity)

### Hooks

`hooks/useCRMDashboard.ts` aligned to "CRM Caching Conventions" in
CLAUDE.md (Step 0 commit `01f3027`, hook update commit `dec275b`):
- `useCRMKPIs`: `staleTime: 60_000` + `refetchInterval: 60_000`
- `useCRMFunnel`: `staleTime: 60_000` + `refetchInterval: 60_000`
- `useDealsAtRisk`: `staleTime: 300_000`, no interval
- `useTeamPerformance`: `staleTime: 300_000`, no interval, accepts `{ enabled }` for permission gating
- `useCRMRecentActivity`: `staleTime: 30_000` + `refetchInterval: 30_000`
- `useCRMInsights`: `staleTime: 120_000`, no interval
- `CRMInsight.severity` widened to include `'critical'`
- `CRMInsight.type` widened to include `'followups_today'`
- `DealAtRisk` extended with `deal_type: string | null`

### Permission gate + sidebar

- `page.tsx`: `requirePermission('crm_reports.view')` (Step 3 commit `d553955`)
- Sidebar label: `'التقارير'` → `'لوحة المبيعات'` (Step 5 commit `441e1af`)
- Sales agents see the page (have `crm_reports.view`); only see action
  cards adapted to 2 tiles (no Approvals card without `leads.approve`),
  and the team performance table is hidden entirely (no `crm_reports.team_view`)

### Exit Gate (per PRD §05 lines 348-353) — ALL PASSED

| Gate | Status |
|---|---|
| Dashboard renders | ✅ |
| All numbers match underlying queries | ✅ Manual SQL sanity passed |
| AI insight banner shows for relevant conditions | ✅ Live test: 25 idle deals → `high` severity surfaced correctly |
| "Show team filter" option visible only to managers | ✅ Gated on `crm_reports.team_view`; hidden for sales_agent |

### Known v1 limitations (deferred to v1.1)

These are intentional defer-decisions that ship Phase 8 honestly. The v1
visual + functional contracts are preserved; v1.1 fills in the data
without breaking changes.

1. **Trend indicators flat (0%)** — `trend_pct`, `vs_target_pct`,
   `vs_prior_pct`, `trend` all return `0` / `'flat'` from the server.
   v1.1 will add prior-period query infrastructure + target tracking
   schema. The KPI card UI already renders `0%` with a flat icon —
   v1.1 swap requires no UI changes.

2. **4 of 7 AI rules implemented.** Phase 8 ships:
   - `idle_warning` (high if count >= 3)
   - `approvals_pending` (critical if > 5, high if 1-5)
   - `overdue_followups` (high if > 5, medium if 1-5)
   - `followups_today` (medium if > 0) — **new in Phase 8**

   Deferred to v1.1:
   - `conversion_dropped` (medium) — requires prior-period KPI
     infrastructure (linked to limitation #1)
   - `closed_won_streak` (low) — needs streak definition (consecutive
     days? wins this week?)
   - `target_exceeded` (low) — needs target tracking schema

3. **Team filter UI-only stub.** Dropdown renders for users with
   `crm_reports.team_view`, accepts selection, but does NOT propagate
   to data hooks. Italic in-line disclaimer "(فلترة لكل موظف — قريباً
   في v1.1)" is honest about the state. v1.1 will:
   - Extend 5 endpoints to accept `?as_user=<username>` query param
     (kpis, funnel, deals-at-risk, recent-activity, ai-insights)
   - Override `getLeadScopeFilter` server-side when admin + as_user provided
   - Thread `agentFilter` state through `dashboard-client` to the hooks
   - State shape already preserved — zero UI churn

### Notable Phase 8 commits

```
441e1af feat(crm): phase 8 step 5 — page assembly + toolbar + sidebar label fix
5b6ddf2 feat(crm): phase 8 cluster 4 — team performance table (manager-only)
9e594aa feat(crm): phase 8 cluster 3 — deals-at-risk + activity feed + action cards
6db16ae feat(crm): phase 8 cluster 2 — KPI cards + funnel viz
1198024 chore(crm): preview cluster 1 components in stub (reversed in step 5)
4b409c9 feat(crm): phase 8 cluster 1 — dashboard page chrome
d553955 fix(crm): phase 8 page permission gate — leads.view → crm_reports.view
dec275b feat(crm): phase 8 hooks — caching alignment + CRMInsight type widening
6271119 feat(crm): phase 8 ai insights — critical severity + followups_today rule
01f3027 docs(crm): phase 8 conventions — AI insights severity + caching strategy
```

---

## CRM Phase 9 — Active Customer Page (Contracts Tab) ✅ COMPLETE
**Date:** 2026-05-09 | **Final feature commit:** `9178d7b` | **Closure commit:** this commit


Customer-detail page at `/dashboard/crm/customers/[id]`. Phase 9 plan
approved with decisions: β (separate route), δ (portal_active flag),
ε (single dossier endpoint), η (pipeline → /customers redirect for
converted leads), Q-A1/A4/A5 implementation choices.

### Step A — Backend foundation ✅ COMPLETE (4/4 commits)

| # | Commit | Scope |
|---|---|---|
| 1 | `5547eaf` | Migration 012 — `pyra_clients.portal_active` boolean flag (default true) + partial index |
| 2 | `ec03097` | `POST /api/crm/leads/[id]/convert-to-customer` (admin only, idempotent) + `PATCH /api/crm/customers/[lead_id]/portal-access` toggle. New `'lead_converted_to_customer'` notification type. |
| 2.1 | `a407515` | Hotfix: removed non-existent `lead.address` column reference (caught during dossier simulation) |
| 3 | `b52b1a6` | `GET /api/crm/customers/[lead_id]/dossier` — 7-query aggregator returning customer + contracts + invoices + payments + milestones + KPIs + 4-factor health score. CLAUDE.md "## CRM Health Score (Phase 9)" section added. |
| 4 | `0b9c088` | `lead_id` query-param filter on `GET /api/finance/contracts` + `lead_id` added to `CONTRACT_FIELDS` const |

**Backend covered:**
- Lead → customer conversion + portal access lifecycle
- Single endpoint to power the Customer Page (avoids 1+N+N×M queries)
- Health score formula locked + documented for v1.1 tuning
- Q-A1 (password in body, no email infra) / Q-A4 (milestones 'invoiced'
  counted as completed) / Q-A5 (health score returned for unconverted
  leads) — all documented in CLAUDE.md

### Steps A-G — all complete

| Step | Commit | Scope |
|---|---|---|
| A.1 | `5547eaf` | Migration 012 — `pyra_clients.portal_active` boolean flag + partial index |
| A.2 | `ec03097` | `POST /api/crm/leads/[id]/convert-to-customer` (admin only, idempotent) + `PATCH /api/crm/customers/[lead_id]/portal-access` toggle. New `'lead_converted_to_customer'` notification type. |
| A.2.1 | `a407515` | Hotfix: removed non-existent `lead.address` column reference (caught during dossier simulation) |
| A.3 | `b52b1a6` | `GET /api/crm/customers/[lead_id]/dossier` — 7-query aggregator returning customer + contracts + invoices + payments + milestones + KPIs + 4-factor health score. CLAUDE.md "## CRM Health Score (Phase 9)" section added. |
| A.4 | `0b9c088` | `lead_id` query-param filter on `GET /api/finance/contracts` + `lead_id` added to `CONTRACT_FIELDS` const |
| A-marker | `cecfcf7` | Step A complete progress marker |
| B | `069ccbb` | `useCustomerDossier` + `useContractMilestones` hooks (+ v1.1 backlog consolidated) |
| C | `3ac7224` | Page chrome — route `app/dashboard/crm/customers/[id]/`, header, stat-strip, health-ring SVG, 7-tab nav with `?tab=` URL state |
| D | `ed75777` | Customer-Contracts Tab + ContractCard (3 variants) + ContractBillingHistory chips + ContractMilestones checklist. Verified live via temporary `ctr_KTynoYtwhjkMYatq.lead_id` backfill (reverted clean). |
| D-marker | `810495c` | Step D complete progress marker |
| E | `399c17b` | Secondary tabs (Overview / Projects / Invoices / Activity / Notes) + portal toggle + convert modal + 2 mutation hooks (`useUpdatePortalAccess`, `useConvertToCustomer`). Dossier extended with `notes` field. |
| F | `9178d7b` | Page assembly polish — pipeline-card redirect (`is_converted=true → /customers/[id]`), customer index list at `/dashboard/crm/customers`, sidebar dedup (Phase 8 leftover bug). Verified live via `is_converted` flip on test lead (reverted clean). |
| G | this | Phase 9 closure marker |

### Exit Gate (per PRD §05 lines 372-377) — ALL PASSED

| Gate | Status |
|---|---|
| Customer page matches `pyramedia-customer.html` mockup | ✅ Mockup file doesn't exist in workspace; built functional version with brand tokens (same fallback as Phase 8 dashboard) |
| At least one converted lead with multiple contracts displayed correctly | ✅ Verified live via temporary backfill of `ctr_KTynoYtwhjkMYatq.lead_id = sl_Y1wGyzfprQ2E4T7C` — emerald-bordered active retainer card rendered with billing history chips + 4-stat block; reverted clean |
| Portal toggle creates/removes pyra_clients row (idempotent) | ✅ Per Q9-2 (δ) — toggle flips `portal_active` boolean on existing `pyra_clients` row; convert-to-customer creates the row with the flag set per request body. Both endpoints idempotent. |
| Existing customers (with no lead) still appear in `/dashboard/finance` flows (not broken) | ✅ Backend changes were additive only: new `lead_id` filter on contracts route is backward-compatible (existing client_id filter unchanged); `pyra_clients.portal_active` defaults to true so legacy clients unaffected |

### Locked v1 deviations (transcribed into CLAUDE.md "CRM Phase 9 — Locked Decisions")

These are **intentional, documented deviations** from the PRD. **Do NOT re-litigate.**

1. **Q-A1: Password in convert body, no automated welcome email**
   PRD §03 line 368 calls for "send portal welcome email (use existing template)". No template/sender infrastructure exists in workspace. v1 matches `/api/clients` POST pattern: admin sets password in body, shares credentials out-of-band (WhatsApp/email). v1.1 adds welcome email automation.

2. **Q-A4: Milestone `status='invoiced'` counts as completed**
   Workspace production data uses `'invoiced'` for done-and-billed milestones. `kpis.milestones_completed` counts both `'completed'` AND `'invoiced'`. Inline icon mapping in `<ContractMilestones>` mirrors. KPI label is "completed" but spirit is "terminal/done".

3. **Q-A5: Health score returned for unconverted leads**
   Dossier endpoint returns the score regardless of `is_converted`. UI gates `/customers/[id]` via the pipeline-card redirect (Step F) — only converted leads land there from the pipeline. Direct API/URL access on a pre-conversion lead returns activity-driven score (recency + engagement contribute; contracts/payment factors return 0). Honest data, not defensive null.

4. **Q-D2: Single "عرض العقد" link button per contract card**
   Workspace has no standalone `/api/finance/contracts/[id]/pdf` route — viewing/PDF download/invoice generation all live on `/dashboard/finance/contracts/[id]`. Originally-approved 2 buttons (View PDF + New Invoice) collapsed to 1 link to detail page. v1.1 may split if a separate PDF route lands.

5. **Q-E2: Notes tab read-only**
   Lead notes editing exists at `/dashboard/crm/leads/[id]` (Phase 5/6). Customer page is read-mostly per "two views of same data" pattern (PRD §04 line 23). v1.1 may add inline-edit on the notes tab if usage shows demand.

6. **Customer index `/dashboard/crm/customers` = basic v1 list (Step F)**
   No per-row aggregated KPIs (LTV/MRR/contracts count). Adding these would require either N dossier calls (bad) or a new bulk `/api/crm/customers` endpoint that joins lead + contracts summary. v1 ships a simple table; v1.1 adds the aggregated endpoint when the customer base is large enough to need richer per-row stats.



### v1.1 backlog (not in Phase 9 scope)

These are intentional v1.1 deferrals — documented now so future sessions
know they're known gaps, not oversights:

#### Carried forward from Phase 8
- **Trend infrastructure for KPIs** — `trend_pct` / `vs_target_pct` /
  `vs_prior_pct` still flat at 0; v1.1 adds prior-period comparison +
  target tracking schema.
- **3 of 7 AI rules** — `conversion_dropped`, `closed_won_streak`,
  `target_exceeded`.
- **CRM team filter functional** — wire `?as_user=` through 5 endpoints
  + the Sales Dashboard `agentFilter` state.

#### From Phase 9
- **Portal welcome email automation** (PRD §03 deviation Q-A1) — template +
  sender infrastructure to remove the "admin shares password out-of-band"
  workflow. Currently convert-to-customer accepts a password in the body
  and admin shares credentials manually.
- **`usePayments` hook + `/api/finance/payments` route** — needed if/when
  a payment reconciliation page or standalone payments-list view is added.
  Phase 9 components consume payments embedded in the dossier, so no
  direct hook is needed for the customer page.
- **Multiple contact persons on customer** — v1 ships single primary
  contact (`<CustomerContactList>`). v1.1 adds an additional-contacts
  table + "+ Add contact" CTA + contact_persons schema or json column.
- **Inline notes editing on `<CustomerNotesTab>`** — v1 is read-only
  (editing lives at `/dashboard/crm/leads/[id]`). v1.1 adds a
  `useUpdateLead` mutation + inline textarea.
- **Aggregated customer KPIs endpoint for `/dashboard/crm/customers`
  index** — v1 ships a basic name+contact list. v1.1 adds a bulk
  `/api/crm/customers` route returning per-row health score / LTV / MRR /
  contracts count for richer table cells.
- **Bulk backfill of legacy contracts with `lead_id`** — 3 Etmam
  contracts (`ctr_KTynoYtwhjkMYatq`, `ctr_bP3VR8hWEbkPhHuL`,
  `ctr_Yey3TzyyrSvg2Gh5`) link only via `client_id = c_1771242560_inj1`.
  Same pattern likely true for Mootasem, Injazat, and other pre-CRM
  clients. Once matching closed_won leads exist (manually created or
  retrofitted), set `pyra_contracts.lead_id` to surface them in the CRM
  customer view.
- **Customer index search server-side filter** — v1 ships client-side
  filter over the loaded list (limit 50). v1.1 wires the existing
  useLeads `search` query param if list grows.
- **Files tab implementation** — currently "قريباً" empty state per
  Q-C3 (γ). v1.1 wires actual file source (likely
  `pyra_files WHERE client_id = customer.client_id` or similar).
- **Gradient cover banner in `<CustomerHeader>`** — v1 ships solid
  `bg-card + border-b` per Q-C2 (α). Phase 13 visual polish item.
- **`<ContractCard>` second action** — v1 ships single "عرض العقد" link
  per Q-D2. v1.1 splits to 2 buttons (View PDF + New Invoice) once a
  separate `/api/finance/contracts/[id]/pdf` route lands.
- **Portal access UI improvements** — currently a single switch + Arabic
  description. v1.1 may add: last-login timestamp ("آخر دخول منذ X"),
  re-send-credentials action, force-password-reset button.
- **Pipeline-card visual marker for converted leads** — currently the
  card looks identical regardless of `is_converted`. v1.1 may add a
  subtle ✓ indicator or bg-tint to differentiate converted-but-still-in-
  closed-won-column leads visually before clicking.



## CRM Phase 11 — Cron Jobs + WhatsApp Integration ✅ (5/5)

**Status:** Complete. All 5 sub-steps green; routability verified
post-hotfix. Live exit-gate tests deferred to post-deploy ops
(n8n PyraCRM_Cron workflow + API key minting — checklist below).

### Sub-step commits

| # | Sub-step | Commit | What landed |
|---|---|---|---|
| 1 | Migration 013 | `a388d16` | `reminder_at`, `whatsapp_reminder_sent`, `send_whatsapp_reminder` cols + partial index `idx_follow_ups_pending_reminders` on `pyra_sales_follow_ups` |
| 2 | Follow-ups POST persists | `9dd8e5b` | POST defaults `reminder_at = due_at - 30min`, `send_whatsapp_reminder = true`; GET returns 3 new cols; `FollowUp` interface widened in `hooks/useFollowUps.ts` |
| 3 | Cron endpoints | `13a0e26` | `/api/cron/follow-up-reminders` (5-min tick, agent-WA destination per Q-C3-1 a) + `/api/cron/lead-idle-check` (daily Dubai 09:00, 7-day dedup per Q-11-2, daily-grouped notif per Q-11-3) |
| — | Hotfix middleware | `4fcd2a5` | Whitelist `/api/cron` in CSRF + session-required exemptions (route was returning workspace's `Unauthorized` instead of route handler's Arabic 401) |
| 4 | Webhook activity logging | `cc15917` | Additive ~35 LOC after `pyra_whatsapp_messages.insert`: `pyra_lead_activities` row per matched-lead WA message (`whatsapp_inbound`/`whatsapp_outbound`) |
| 5 | Phase 11 closure | (this commit) | CRM-PROGRESS.md + CLAUDE.md docs + v1.1 backlog + Phase 11.5 spec + post-deploy ops checklist |

### Manual data fix (out-of-band, during Phase 11)

Lead `sl_tFTPtCSnL6WGCkEj` linked to client `cl_fNmkTFThd3rSvM-p`
+ name corrected from "Dr. Ahmed Mohamed" → "Dr. Ahmed Mamoun".
Audit row `la_5a8173108128e943` (`activity_type='field_updated'`,
`metadata.source='manual_link_pre_phase_11_5'`,
`created_by='elharm'`). Lead stayed mid-pipeline
(`stg_discovery_call`, `is_converted=false`).

This fix surfaced the gap that **Phase 11.5 (Lead-Client Linking
UI)** addresses — see below.

### Exit gate (5 tests)

1. ✅ `curl /api/cron/follow-up-reminders` with bogus `x-api-key`
   → `401 {"error":"مفتاح API غير صالح أو مفقود"}` (verified
   post-hotfix; was returning workspace's `Unauthorized` before
   `4fcd2a5`)
2. ✅ `curl /api/cron/lead-idle-check` with bogus `x-api-key`
   → same Arabic 401 (verified post-hotfix)
3. ⏳ Insert test follow-up with `reminder_at = NOW()`; curl with
   valid key → row processed, `whatsapp_reminder_sent = true`,
   agent in-app notif arrives (deferred to post-deploy ops)
4. ⏳ Insert idle test lead (`last_contact_at = NOW() - 8d`); curl
   with valid key → `idle_warning` activity inserted, agent
   grouped notif arrives (deferred to post-deploy ops)
5. ⏳ Send WA message to a matched lead → `pyra_lead_activities`
   row appears with `activity_type = 'whatsapp_inbound'`
   (deferred to post-deploy ops; ready for live test now)

### Locked decisions (see CLAUDE.md)

6 decisions + 4 implementation invariants + 5-item v1.1 backlog
locked in `CLAUDE.md` → "## CRM Phase 11 — Locked Decisions".

### Post-deploy ops checklist (Abdou)

After Commit 5 lands, the following are required to bring the
crons live:

1. **Mint API key** in `pyra_api_keys` with permissions
   `['cron.follow-up-reminders', 'cron.lead-idle-check']`.
   - Default method: admin UI at `/dashboard/api-keys` (if
     functional)
   - Fallback: `pg/query` direct INSERT
   - Send the key securely (or hold it; n8n is the only
     consumer)
2. **Create new n8n workflow** named `PyraCRM_Cron` (separate
   from `PyraWhatsapp_Agent` / workflow ID `XswCOuU2T3gaExUk`).
3. **Schedule Trigger every 5 min** → HTTP Request POST
   `https://workspace.pyramedia.cloud/api/cron/follow-up-reminders`
   with header `x-api-key: <key>`.
4. **Schedule Trigger daily 09:00 Asia/Dubai** → HTTP Request
   POST
   `https://workspace.pyramedia.cloud/api/cron/lead-idle-check`
   with same header.
5. **Activate** the workflow.
6. **Manual first-tick verification:** check both endpoints
   return `200` with the expected JSON shape
   (`{processed, sent, ...}` for follow-up-reminders,
   `{leads_checked, leads_idle, ...}` for lead-idle-check).

### v1.1 backlog (discovered during ops setup)

In addition to the 5 items in CLAUDE.md "## CRM Phase 11 — Locked
Decisions" → "Phase 11 v1.1 backlog":

- [ ] **`AVAILABLE_PERMISSIONS` in `app/dashboard/settings/settings-client.tsx`
  is manually maintained.** Should be auto-derived from a central
  permissions registry to prevent drift between code permission
  strings (used by `getExternalAuth()` + route-handler `.includes()`
  checks) and UI checkboxes shown to admins minting API keys.
  Phase 11 ops setup added the 2 cron permissions inline (commit
  `6cd17d2`), but the underlying pattern issue persists for
  every future permission addition. Symptom: cron permissions
  existed in production code from `13a0e26` (4 days before ops
  setup) but weren't surfacable in the UI without `*` wildcard
  workaround until `6cd17d2`.

---

## CRM Phase 11 Refinement — Agent WhatsApp Settings Layer ✅ (6/6)

**Status:** Complete. Decouples "which Evolution instance sends" from
"which agent receives" so a single shared instance can serve multiple
agents, each routed to their own WhatsApp number. Resolves the silent-
skip bug where Phase 11's cron required each agent to OWN a connected
`pyra_whatsapp_instances` row (in production only `elharm`/admin owned
`pyraai`; sayed's reminders never reached WhatsApp under the old model).

### Origin

Surfaced during Phase 11 ops setup (n8n PyraCRM_Cron + first-tick
verification). The architectural decision — separate
`pyra_agent_whatsapp_settings` table + Settings UI + cron logic update,
preserving `pyra_whatsapp_instances` as the Evolution-API wiring layer
untouched — was locked before any code was written.

### Sub-step commits

| # | Sub-step | Commit | What landed |
|---|---|---|---|
| 1 | Migration 014 | `4a4b03f` | `pyra_agent_whatsapp_settings` table — `agent_username UNIQUE FK→pyra_users ON DELETE CASCADE`, partial index on `is_active=true`, BEFORE UPDATE trigger for `updated_at` |
| 2 | API routes + hook | `851b70e` | GET (list, enriched) + POST + PATCH `[id]` + DELETE `[id]`; hook `useAgentWhatsAppSettings` (4 functions); routability probes confirmed 401 gates fire |
| 3 | Settings UI tab | `fe82a8a` | "إعدادات WhatsApp للفريق" tab + section component split into `section.tsx` + `list.tsx` + `dialog.tsx` (file-split debt paydown). Built via orchestra (Implementer A + B parallel + Reviewer flagged 4 issues, all fixed pre-push) |
| 4 | Cron logic update | `1ca221d` | Two-step lookup: settings (active=true) → instance (status=connected). Counter rename: `skipped_no_instance` → `skipped_no_setting` + new `skipped_instance_offline`. All graceful-degradation paths preserved. Built via orchestra (Implementer + Reviewer FIRST CLEAN PASS, zero findings) |
| 5 | Test feedback fixes | (skipped) | Reviewer in Commit 4 found zero actionable issues; no targeted fixes needed. Any organic issues that surface during real usage become v1.1 backlog items |
| 6 | Closure | (this commit) | CRM-PROGRESS.md + CLAUDE.md docs + 6-item v1.1 backlog |

### Multi-agent orchestra adoption

This was the first phase to use the new orchestra operating mode end-to-end:

- **Commit 3 orchestra:** 2 Implementers parallel (`list.tsx` + `dialog.tsx`) → Reviewer (`feature-dev:code-reviewer`, independent context) flagged **4 issues**:
  1. `isActive` form default = `true` violated Q-R-3 (Critical)
  2. `+{recipient_phone}` display caused copy-paste-into-Edit corruption risk (High)
  3. `as unknown as FetchedUser[]` cast unnecessary (High)
  4. `addOpen` / `editTarget` not mutually exclusive — race risk on rapid double-click (High)
  
  All 4 addressed in Lead synthesis before push. Reviewer also flagged 2 medium-priority items: one verified-false-positive (server message IS surfaced via `mutateAPI`'s `pickServerMessage`), one v1.1-deferred (`usePermission` loading flicker).

- **Commit 4 orchestra:** Single Implementer + Reviewer → **first clean pass, zero findings** across all 5 focus areas (graceful degradation, counter rename consistency, Q-11-1 preservation, parameter binding safety, idempotency semantics). Reviewer self-corrected a flagged-then-withdrawn issue on the lead-not-found branch — transparent reasoning, not rubber-stamping.

The 4-vs-0 ratio across the two orchestra rounds confirms calibration: Reviewer surfaces real issues when they exist (Commit 3) and doesn't manufacture noise when they don't (Commit 4).

### Locked decisions (see CLAUDE.md)

7 Q-R answers + 5 implementation invariants are locked in `CLAUDE.md` →
"## CRM Phase 11 Refinement — Locked Decisions".

### v1.1 backlog (6 items)

- [ ] **`usePermission` loading-state flicker** — admin sees write
  actions briefly hidden on every settings page load. Requires
  distinguishing 'loading' from 'definitively no permission' in the
  hook return shape. Touches all settings sections.
- [ ] **Settings-client.tsx subsection extraction** — apply the
  `components/settings/agent-whatsapp-settings/` directory pattern
  to the existing inline `ApiKeysSection` + `ModuleSettingsTab` so
  the file shrinks toward CLAUDE.md's "<300 LOC" target.
- [ ] **Combobox-with-status-badge for instance dropdown** — replace
  the HTML5 datalist (plain-text suggestions only) with a Popover +
  Command Combobox that renders inline status badges
  ("pyraai 🟢 connected").
- [ ] **E.164 regex validation for `recipient_phone`** — deferred
  from Q-R-4. Pyramedia is UAE-primary (`+971xxxxxxxxx`); regex
  `/^\d{10,15}$/` covers it.
- [ ] **Warning banner: "agent has follow-ups but no active
  setting"** — deferred from Q-R-5. Surface at the top of the
  Settings tab and/or My Work Inbox to prevent silent-skip surprises.
- [ ] **Sayed personal WhatsApp number setup** — operational task,
  not code. Once Sayed's WA number is captured, admin populates the
  routing row via the new UI and Phase 11's exit-gate test 3
  (follow-up reminder fires WA to agent) becomes end-to-end
  verifiable.

---

## CRM Phase 11.5 — Lead-Client Linking UI ✅ DONE

**Status:** Complete. UI exposes the "ربط بعميل موجود" workflow that
previously required SQL manual intervention. Replaces the manual
Dr. Ahmed Mamoun precedent (activity row `la_5a8173108128e943`).

### Sub-step commits

| # | Sub-step | Commit | What landed |
|---|---|---|---|
| 1 | API + UI + integration | `fb7da8a` | 6 files: new POST endpoint (`leads.update` + `canAccessLead()`); new modal component (Dialog + Command + debounced search via `useDebounce`); GET response extended with `client_name`; new `useLinkClient` hook; lead header gets linked-client badge (sky-500 palette, clickable to `/dashboard/clients/[id]`) + admin actions row with "ربط بعميل موجود" button; lead-detail-client wires modal state + handler (conditional mount). |
| 2 | Closure | (this commit) | CRM-PROGRESS.md + CLAUDE.md docs + locked architectural principle (action_type + metadata.source separation) |

### Multi-agent orchestra results

- **Investigator** (`feature-dev:code-explorer`): 5-task report verified spec consistency with the Dr. Ahmed Mamoun manual fix; identified the picker UI pattern (Dialog + Command + CommandInput with `useClients({ search })`); surfaced 5 open questions for Lead Architect (all resolved before Phase 3).
- **Implementer A** (`general-purpose`): API endpoint (`app/api/crm/leads/[id]/link-client/route.ts`).
- **Implementer B** (`general-purpose`, parallel with A): modal component (`components/crm/lead-detail/link-client-modal.tsx`).
- **Reviewer** (`feature-dev:code-reviewer`, independent context): **3 findings, all 3 applied:**
  1. `logActivity` action_type pattern consistency — initially rejected by Lead Architect (favoured audit specificity), **reverted to APPLY per user override** for pattern consistency. Action_type now uses `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`; specificity lives in `metadata.source = 'manual_link_via_ui'`.
  2. Conditional modal mount in `lead-detail-client.tsx` (`{linkClientOpen && <LinkClientModal ... />}`) — prevents `useClients` query firing on every lead detail page load when the modal is closed.
  3. Drop `aria-selected={isSelected}` on `CommandItem` — cmdk uses `data-[selected]` for its keyboard-cursor semantic; conflating with our chosen-row state confuses screen readers. Visual cue via border + Check icon suffices.

The Reviewer's first-finding override was the most valuable: it surfaced an architectural pattern decision (action_type uses constants; metadata.source carries specificity) that's now locked in `CLAUDE.md` → "## CRM Phase 11.5 — Locked Decisions" for future activity-log writes.

### Why it exists (original justification)

The manual SQL fix done during Phase 11 (linking lead
`sl_tFTPtCSnL6WGCkEj` to client `cl_fNmkTFThd3rSvM-p`) revealed
there's no admin UI for the "this lead is actually our existing
client X" workflow. Convert-to-customer creates a NEW client; this
is for matching to an EXISTING one.

**Position in execution order:** between Phase 11 and Phase 10
(see "Execution order note" at the top of this file).

### Scope (~45-60 min)

1. Lead detail page → new "ربط بعميل موجود" button in lead header
   (next to Convert-to-Customer)
2. Modal with client search picker (reuse `useClients` hook +
   `Combobox` primitive)
3. POST `/api/crm/leads/[id]/link-client` body
   `{ client_id: string }`
   - Permission: `leads.update` + `canAccessLead()`
   - Validates client exists and `lead.client_id IS NULL` (use
     a separate POST `/unlink-client` for re-link — out of
     scope, v1.1)
   - UPDATE lead SET `client_id`, `updated_at`; INSERT
     `pyra_lead_activities` `type='field_updated'` with
     `metadata.source='manual_link_via_ui'`
   - Does **NOT** flip `is_converted` (lead stays mid-pipeline;
     convert is a separate flow)
4. Lead header shows "🔗 مرتبط بـ [client_name]" badge when
   linked, click → `/dashboard/clients/[id]`
5. Activity timeline shows the link event (uses existing
   `field_updated` label)

### Out of scope (deferred to v1.1)

- Unlinking — admin can SQL-manual if needed; UI deferred
- Bulk link from leads list
- Auto-suggest based on phone match

### Test plan

1. Open un-linked lead → click "ربط بعميل" → search → pick →
   modal closes → header shows badge → activity timeline gets
   row
2. Try same flow on already-linked lead → button hidden (or
   shows "تغيير" — TBD with user during execution)
3. Permission test: non-admin without `leads.update` → button
   hidden
4. SQL audit: `client_id` set, `is_converted` unchanged

---

## CRM Phase 10 — Mobile PWA Polish ✅ (5/5)

**Status:** Complete. The CRM is now mobile-functional end-to-end:
the kanban can move leads via a Sheet picker, lead detail's sidebar
is reachable through a slide-out Sheet, PWA support is iOS-ready
(pending icon asset upload), and the FilterBar meets WCAG 2.5.5
touch compliance. **Q-UI-001 — deferred from Phase 7 — is finally
resolved.**

### Sub-step commits

| # | Sub-step | Commit | What landed |
|---|---|---|---|
| 1 | Mobile stage picker (Q-UI-001) | `48c2ef4` | New `MobileStageSheet` + `useMoveLeadStageWithToasts` hook extracted from pipeline-client. Bottom Sheet on mobile cards; ACCENT_DOT relocated to `lib/constants/pipeline-colors.ts`. Phase 7 Chunk 3 invariants preserved. |
| 2 | Lead detail mobile sidebar Sheet | `fb0cc5e` | Slide-out Sheet for `<LeadSidebar>` at max-md (visible via "معلومات إضافية" button above tabs); desktop renders inline unchanged. `side="right"` anchors at visual LEFT in RTL — matches desktop sidebar position. |
| 3 | PWA polish | `414c990` | New `/offline` Server-Component page (static prerender ○); manifest PNG icon entries (192/512/512-maskable) + SVG fallback retained; Apple `appleWebApp` metadata + Next.js 15 `viewport` export with `viewportFit:cover`; sw.js explicit `STATIC_CACHE` lookup for the offline fallback path. |
| 4 | Pipeline FilterBar mobile polish | `1389d1c` | Touch targets bumped to `h-11` (44px) on all interactive trigger elements; mobile-only active-filter chip strip (read-only, matches the follow-ups pattern). |
| 5 | Closure | (this commit) | CRM-PROGRESS.md + CLAUDE.md docs + 8-item v1.1 backlog. |

### Orchestra retrospective

| # | Mode | Reviewer findings | Outcome |
|---|---|---|---|
| 1 | HIGH (2× parallel Implementers + Reviewer) | 2 → APPLIED + 1 Lead refinement | ACCENT_DOT initially exported from board file; further relocated to `lib/constants/pipeline-colors.ts` per user's pattern-consistency override (matches Phase 11.5 action_type principle) |
| 2 | LIGHT (Lead solo + Reviewer) | 2 → REJECTED with documented rationale | RTL conventions + Commit 1 precedent. Path A: push as-is, organic verification post-deploy |
| 3 | LIGHT | 2 → APPLIED | sw.js explicit STATIC_CACHE lookup made load-bearing by new `/offline`; viewport-fit:cover required for black-translucent status bar |
| 4 | LIGHT | 0 — **FIRST CLEAN PASS** across all 5 focus points | Pushed as-is |

The **2-2-2-0** ratio across 4 rounds shows the orchestra is
calibrated correctly: Reviewer catches real issues when they exist
(Commits 1 + 3), accepts architectural reasoning when documented
(Commit 2 — overridden with pattern precedent), and doesn't
manufacture noise when work is clean (Commit 4).

### PWA Lighthouse score

Expected improvement once Abdou uploads the 4 PNG icon assets to
`public/icons/`:
- **Before Phase 10:** ~55/100 (per Investigator estimate)
- **After Phase 10 + icon upload:** ~90-95/100 (PNG icons + Apple
  meta tags + working `/offline` fallback)

**Pending operational (out of code scope):** upload
`icon-192.png`, `icon-512.png`, `icon-512-maskable.png`,
`apple-touch-icon.png` to `public/icons/`. Until then, the manifest
and Apple-icon links 404 gracefully — browsers fall back to SVGs
(manifest) or the favicon (apple-touch).

### Locked decisions

7 architectural patterns locked in `CLAUDE.md` →
"## CRM Phase 10 — Locked Decisions":

1. Mobile stage picker uses bottom Sheet (not Combobox/Select)
2. Per-card `useState` for sheet open (no prop drilling)
3. `useMoveLeadStageWithToasts` hook extraction (single source of truth)
4. Mobile sidebar `side="right"` anchors at visual LEFT in RTL (matches desktop)
5. `ACCENT_DOT` in `lib/constants/pipeline-colors.ts` (visual constants in `lib/constants/`)
6. PWA: explicit `STATIC_CACHE` lookup for `/offline` fallback
7. Touch target minimum: `h-11` (44px) on mobile (WCAG 2.5.5 + Apple HIG)

### v1.1 backlog (8 items)

- [ ] **PWA icon PNG upload** — operational, awaiting Abdou. Files:
  `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`,
  `apple-touch-icon.png` in `public/icons/`.
- [ ] **next-pwa plugin migration** — current hand-written `sw.js`
  works but refactor to next-pwa would gain workbox sophistication
  + automatic precache asset detection.
- [ ] **Push notifications via SW** — requires backend VAPID keys +
  a permission-flow UX.
- [ ] **Dashboard widget per-component mobile audit** — Phase 10
  Investigator flagged dashboard as P2 (heavy widgets pull Recharts
  statically; mobile responsiveness depends on each widget's
  internals).
- [ ] **Code-split heavy charts via `dynamic()`** — Recharts adds
  ~70-80kB to any page that imports it statically.
- [ ] **Per-chip × removal on FilterBar chip strip** — current strip
  is read-only; per-chip remove requires mapping each chip back to
  its URL param key.
- [ ] **Vertical compactness on 375px admin filter bar** — admin
  mode at 375px viewport produces 3 wrapping rows above the kanban.
  Fix requires layout rethink (compact mobile grid OR Sheet
  collapse).
- [ ] **Visual verification on real device for Commit 2 RTL
  choices** — `side="right"` + ChevronLeft on the lead detail
  sidebar Sheet were chosen via reasoning, not visual test on a
  real device. If either feels wrong, one-line swap.

## CRM Phase 12 — Old Sales Module Sunset ✅ (3/3)

**Status:** Complete. The legacy `/dashboard/sales/*` surface is now
either REDIRECTed (5 routes) or PROTECTED (5 routes). All internal
references migrated to the new CRM paths; 17 dead page/component
files deleted (-1586 LOC); rbac.ts comment markers updated. The CRM
is now the canonical module.

### Sub-step commits

| # | Commit | What landed |
|---|---|---|
| 1 | `78063b7` | Cross-reference cleanup — 25 files modified, +52/-64 LOC. Internal references migrated from `/dashboard/sales/*` REDIRECT routes → `/dashboard/crm/*` equivalents. **CRITICAL email URL fix** at `lib/email/notify.ts:368` (email links bypass middleware). 4 Implementer deviations accepted (semantic upgrades + module-guide collision resolution). Orchestra HIGH (Investigator → Implementer → Reviewer; OVERALL PASS, 1 pre-existing flag for v1.1). |
| 2 | `272619d` | Page file deletion — 17 files deleted, -1586 LOC. 5 REDIRECT-route page.tsx + 12 sales-only supporting components (5 components/sales/lead-* + 4 sales-overview + 3 leads-list). Middleware redirects survived deletion (3 post-deploy probes PASS). Orchestra LIGHT (Lead solo + Reviewer; OVERALL PASS). |
| 3 | (this commit) | rbac.ts comment cleanup + closure docs. Legacy `sales.*` permissions retained per Q5 — only the stale "preserved until Phase 12 sunset" comment markers updated to reflect post-sunset PROTECTED-route gating. |

### Classification — final state

| Route | Class | Status |
|---|---|---|
| `/dashboard/sales` (root) | REDIRECT | ✅ 307 → `/dashboard/crm` (page file deleted) |
| `/dashboard/sales/leads` | REDIRECT | ✅ 307 → `/dashboard/crm/pipeline` |
| `/dashboard/sales/leads/[id]` | REDIRECT | ✅ 307 → `/dashboard/crm/leads/[id]` |
| `/dashboard/sales/follow-ups` | REDIRECT | ✅ 307 → `/dashboard/crm/follow-ups` |
| `/dashboard/sales/reports` | REDIRECT | ✅ 307 → `/dashboard/crm` |
| `/dashboard/sales/chat` | KEEP | ✅ preserved — WhatsApp shared inbox (no CRM equivalent) |
| `/dashboard/sales/whatsapp-analytics` | KEEP | ✅ preserved — CSAT + SLA analytics |
| `/dashboard/sales/whatsapp-campaigns` | KEEP | ✅ preserved — bulk WA campaign manager |
| `/dashboard/sales/approvals` | KEEP | ✅ preserved — `pyra_quote_approvals` workflow (categorically distinct from `/dashboard/crm/approvals`) |
| `/dashboard/sales/settings` | KEEP → FOLD v1.1 | ✅ preserved this phase; FOLD design decision deferred to v1.1 |

### Routability verification — 3/3 probes PASS post-deploy

```
GET /dashboard/sales/leads          → 307 Location: /dashboard/crm/pipeline       ✅
GET /dashboard/sales/leads/sl_test  → 307 Location: /dashboard/crm/leads/sl_test  ✅
GET /dashboard/sales/follow-ups     → 307 Location: /dashboard/crm/follow-ups     ✅
```

Middleware behaviour fully intact after page deletion — the only operational risk for this phase, and it survived cleanly.

### Critical safeguard: email URL fix (Commit 1)

`lib/email/notify.ts:368` previously built lead-assignment email URLs
as `/dashboard/sales/leads/<id>`. **Email URLs do NOT pass through
Next.js middleware** (mail clients follow URLs directly to the
origin). Without Commit 1's update, every lead-assignment email sent
after Commit 2's page deletion would have landed users on a 404. This
was the single most-load-bearing line of the entire phase.

### Orchestra retrospective

| Commit | Mode | Reviewer findings | Outcome |
|---|---|---|---|
| 1 | HIGH | OVERALL PASS (6/6 focus areas); 1 pre-existing flag for v1.1 (approvals/route.ts:20 GET-handler logActivity) | Implementer caught 7 files beyond Investigator's flagged set; 4 deviations accepted (all semantic upgrades or collision resolution) |
| 2 | LIGHT | OVERALL PASS (4/4 focus areas) | Independent Grep confirmed zero orphan imports + zero stragglers |
| 3 | DOCS only | — | This commit |

### v1.1 backlog (consolidated)

**Carry-forward from prior phases:**
- usePermission loading-state flicker
- Settings-client.tsx subsection extraction
- Combobox-with-status-badge for instance dropdown
- E.164 regex validation for recipient_phone
- Warning banner: "agent has follow-ups but no active setting"
- Sayed personal WhatsApp number setup (operational, awaiting Abdou)
- next-pwa plugin migration
- Push notifications via SW
- Dashboard widget per-component mobile audit
- Code-split heavy charts via `dynamic()`
- Per-chip × removal on FilterBar chip strip
- Vertical compactness on 375px FilterBar
- PWA icon PNG upload (operational, awaiting Abdou)
- Real-device RTL verification for Phase 10 Commit 2 (`side="right"` + ChevronLeft)

**NEW from Phase 12:**
- **Audit-log hygiene sweep** — remove `logActivity()` calls from GET handlers (trigger example: `approvals/route.ts:20`). Holistic audit across all API routes.
- **`/dashboard/sales/approvals` rename** — disambiguate from `/dashboard/crm/approvals` (quote workflow vs lead-pipeline approval). Q1 deferred.
- **`/dashboard/sales/settings` FOLD decision** (Path B from Phase 12 Q2) — move `SalesSettingsContent` into `/dashboard/crm/settings` (new route) OR fold into `/dashboard/settings` existing tabs. Design-heavy, benefits from user input.
- **`sales.*` permission renaming in rbac.ts** — Q5 deferred. Renaming touches many call sites; better as a holistic refactor.

## CRM Phase 13 — Visual Polish ✅ (3/3)

**Status:** Complete. Final phase of the CRM rebuild. Visual polish
pass on the now-stable CRM surfaces. **Phase 9 Q-C2 (gradient cover
banner deferral) closed in Commit 2.** All P0 + P1 findings shipped;
P2 deferred to v1.1.

### Sub-step commits

| # | Commit | What landed |
|---|---|---|
| 1 | `d73f9b5` | **P0 empty states (3 swaps).** `lead-notes-tab.tsx` + `lead-overview-tab.tsx` (contracts section) + `lead-deals-tab.tsx` (invoices section): inline `<p>` empty stubs replaced with `<EmptyState>` from `@/components/ui/empty-state`. Full-tab notes case uses default `py-16`; subsection cases use `className="py-8"` for visual hierarchy. Inline typo fix: `سينظهر` → `سيظهر`. Reviewer OVERALL PASS. |
| 2 | `555213c` | **P1 polish bundle (4 fixes).** Sidebar Tags card stripped of "Phase 6" developer language (Q-001a Path B inline compact stub — EmptyState component swap rejected by Reviewer due to visual size mismatch in compact sidebar context). Customer header light warm gradient overlay (Q-002c — closes Phase 9 Q-C2 deferral). Yellow badge dark-mode border pair. Follow-up row hover state (Q-003a). Reviewer CONDITIONAL PASS → Path B applied per established Reviewer-override pattern (Phase 11.5 + Phase 12 precedent). |
| 3 | (this commit) | Closure docs — CLAUDE.md "## CRM Phase 13 — Locked Decisions" + CRM-PROGRESS.md ✅ section + consolidated v1.1 backlog. **Marks CRM rebuild complete.** |

### Phase 13 audit summary

Investigator NORMAL SCOPE verdict — credibly close in 3 commits.

| Tier | Items | Status |
|---|---|---|
| P0 (visible inconsistency) | 3 (all Lead Detail empty states) | ✅ shipped Commit 1 |
| P1 (perceived quality) | 6 (sidebar Tags + customer gradient + dark-mode pair + follow-up hover + Phase 9 Q-C2 deferral) | ✅ shipped Commit 2 |
| P2 (subtle refinements) | 6 (typography micro, spacing micro, brand color drift, etc.) | ⏳ deferred to v1.1 |

### Orchestra retrospective (full Phase 13)

| Commit | Mode | Reviewer outcome |
|---|---|---|
| 1 | LIGHT | OVERALL PASS — 4/4 focus points clean |
| 2 | LIGHT | CONDITIONAL PASS — 3/4 clean, 1 flagged (EmptyState size mismatch) → Path B applied |
| 3 | DOCS | — |

The 1 Reviewer flag in Commit 2 followed the established orchestra-deviation pattern (Phase 11.5 action_type + Phase 12 audit-log semantic upgrades): Reviewer surfaces visual/semantic quality concern, Lead Architect synthesizes correction, user adjudicates with documented rationale.

### Q-UI-001 timeline closed

- **Phase 7:** deferred to Phase 10
- **Phase 10:** mobile stage picker (Q-UI-001) shipped as functional Sheet
- **Phase 13:** no residual visual polish needed (Phase 10 Commit 1 was clean from a visual standpoint)

### Phase 9 Q-C2 deferral closed

Customer Header gradient cover banner was deferred to Phase 13 visual polish (Phase 9 closure section). Phase 13 Commit 2 shipped the gradient with Q-002c approval: light warm overlay (`from-orange-500/5 via-amber-500/[0.03] to-transparent`) — subtle, doesn't compete with KPI cards + health ring.

---

## Phase 14.1 — Observability ✅ (3/3)

**Status:** Complete. Post-CRM-rebuild infrastructure work. Self-contained error log layer replaces external Sentry — no DSN, no third-party service, no egress. All server-side errors funnel through `logError()` into `pyra_error_logs`; admin viewer at `/dashboard/admin/error-logs` provides triage + resolve workflow.

### Sub-step commits

| # | Commit | What landed |
|---|---|---|
| 1 | `2b0924e` | **Schema + logger.** Migration 015 — `pyra_error_logs` (16 cols, 3 indexes, 2 CHECK constraints, COMMENTs, NO trigger — append-mostly). `lib/observability/log-error.ts` — fire-and-forget IIFE, 5-layer PII redaction (noise drops → email regex → phone regex → sensitive key fragments → sensitive header allowlist), cron-safe (never propagates), recursive-safe (insert failures use raw `console.error`, no recursion). Reviewer PASSED 4/4. |
| 2 | `9a45a12` + `26a490c` | **Server capture + client beacon + middleware hotfix.** `apiServerError(message?, err?, request?)` backwards-compat extension (all 722 existing callers unaffected). Beacon route `/api/observability/log-client-error` accepts both dashboard Supabase Auth AND portal cookie sessions. Both error boundaries (`app/dashboard/error.tsx`, `app/portal/(main)/error.tsx`) fire-and-forget POST through the beacon. 8 high-risk catch blocks explicitly instrumented: 2 crons (follow-up-reminders + lead-idle-check) + 2 webhooks (Evolution + Stripe) + 3 CRM state-change routes (convert-to-customer + link-client + move-stage) + 1 Stripe checkout. Post-deploy surfaced + immediately fixed: middleware Supabase-Auth block needed `/api/observability/*` exemption so portal cookie auth reaches the beacon. Reviewer LIGHT PASSED 4/4. |
| 3 | `e7d9de0` | **Admin viewer.** `/dashboard/admin/error-logs` — filter chips (severity / environment / resolved / 7d/30d/all / user) + paginated list (50/page) + Sheet detail panel with stack trace + PII-redacted metadata pretty-print + resolve form. Two new RBAC permissions (`error_logs.view` + `error_logs.manage` — admin-only by role assignment, NOT by name prefix). Sidebar nav under "الأمان والمراقبة" group with `permission: 'error_logs.view'`. Module guide entry. Reviewer HIGH PASSED 4/4 strict checks; two flagged observations adjudicated as non-issues (chevron pattern matches Phase 10 RTL lock; double-resolve UX already protected by `isPending` + conditional unmount). |

### Defense-in-depth verified post-deploy

| Layer | Gate | Verified |
|---|---|---|
| 1 | CSRF (middleware) — POST/PATCH/PUT/DELETE without matching Origin → 403 | ✅ |
| 2 | Supabase Auth (middleware) — anonymous to `/api/admin/*` → 401 | ✅ |
| 3 | Route-level `requireApiPermission` — `error_logs.view` (GET) / `error_logs.manage` (PATCH) | ✅ |
| 4 | DB CHECK constraints — severity enum + environment enum | ✅ |
| **Table state** | 0 anonymous rows from probes | ✅ |

### PII guarantee end-to-end (smoke-tested in Commit 2)

- Email regex → `[EMAIL]`
- Phone regex (with lookbehind/ahead) → `[PHONE]`
- Sensitive metadata keys (`phone`/`email`/`password`/`token`/`secret`/`apikey`) → `[REDACTED]`
- Sensitive headers (`authorization`/`x-api-key`/`stripe-signature`/`cookie`) → `[REDACTED]`
- Substring matches in non-sensitive keys also caught by regex
- Admin viewer renders verbatim — NO de-redaction path

### Architectural invariants locked

- **Append-mostly DB shape** — no `updated_at` column, no trigger. The only mutation path is admin marking a row resolved (writes `resolved_*` columns explicitly).
- **Service-role client is server-only** — Client Component error boundaries CANNOT call `logError()` directly. They POST through the beacon. Middleware exemption is required for `/api/observability/*` to let portal cookie sessions reach the beacon's own auth gate.
- **`apiServerError(message?, err?, request?)` is backwards-compat** — 722 existing callers untouched. When `err` is passed, logError fires; when not, behavior is identical to v0.
- **Cron-safe contract** — `logError()` never throws, never propagates. Cron per-row try blocks are still self-contained; top-level cron catches wire `logError`.
- **`error_logs.{view,manage}` permission naming** — drops the `admin.` prefix per codebase convention (matches `sessions.view`, `activity.view`).
- **Sheet detail panel** uses `side="right"` — visual LEFT in RTL, matching Phase 10 + Phase 14.1 Sheet convention.

---

## Phase 15.2 — Mobile Experience Completion ✅ (2/3 — Commit 3 deferred)

**Status:** Camera + image attachments (Commit 1) AND voice notes (Commit 2) shipped. **Commit 3 (Push notifications) deferred to v1.1** pending the Q-B-004 iOS prerequisite check on Sayed's device (iOS 16.4+ required for web push on Safari).

### Sub-step commits

| # | Commit | What landed |
|---|---|---|
| 1 | `796029d` | **Lead image attachments.** Migration 016 — `pyra_lead_attachments` (lead_id FK + CASCADE, `file_type` CHECK enum, `size_bytes` CHECK > 0, 2 indexes). POST `/api/crm/leads/[id]/attachments` — 14-layer validation cascade (rate-limit → permission → scope → multipart body → size ≤ 5MB → MIME allowlist {jpg/png/webp/heic/heif; SVG REJECTED for XSS} → extension allowlist → per-lead cap ≤ 10 → server-generated storage path → upload → DB insert with orphan-cleanup on failure → public URL → activity dual-write). DELETE — admin OR uploader gate; cross-lead deletion blocked. GET — list with public URLs. `lib/utils/image-resize.ts` — Canvas 1920×1920 / JPEG 0.82, EXIF stripped as side effect, HEIC transparently converted on iOS. `LeadAttachmentsTab` (replaces v1.1-promised `LeadFilesTab` placeholder) — Camera + Gallery buttons, grid view, Sheet detail. Reviewer HIGH PASSED 5/7 outright; 2 ship-blockers found + applied (MIME_TO_EXT hard-error fallback to defend "storage path is 100% server-controlled" invariant against future map drift; useDeleteAttachment migrated from raw fetch to mutateAPI per CLAUDE.md rule). |
| 2 | `e3cf2ce` | **Lead voice notes (mixed grid).** `hooks/useVoiceRecorder.ts` (NEW) — MediaRecorder wrapper with 5-min hard cap + auto-stop + 4:30 warning toast + Safari/iOS audio/mp4 fallback + MediaStream cleanup on unmount (no leaked iOS mic indicator). POST endpoint extended with `file_type` form field (defaults `'image'` for backwards compat) + audio MIME allowlist {webm/mp4/ogg/mpeg} + duration_seconds validation (≤ 300s). `useUploadAttachment` signature widened to `UploadInput = { file, fileType?, durationSeconds? }`. `LeadAttachmentsTab` extended — third "صوت" button, RecordingPanel (pulsing red indicator + live MM:SS / 05:00 + progress bar + stop/cancel), mixed grid (voice cells render Volume2 icon + duration badge), native `<audio controls>` playback in detail Sheet. `components/sales/chat/chat-input.tsx` UNTOUCHED (Q4(a) lock — pre-existing WhatsApp chat voice recorder remains as-is; v1.1 may consolidate). Reviewer LIGHT PASSED 6/6 focus areas; 2 low-priority v1.1 backlog items filed. |
| 3 | — | **Push notifications — DEFERRED to v1.1** (Q-B-004 iOS prerequisite). Web Push on iOS Safari requires iOS 16.4+; if Sayed's device runs older iOS, Push is gated until OS upgrade. Workspace-side infrastructure (VAPID keys + service-worker push handler + permission UI) blocked behind that confirmation. |

### Q-B-004 iOS prerequisite for Push (v1.1 unblocker)

Push notifications via Service Worker require **iOS 16.4 or higher** on Safari (Apple's web push support shipped March 2023). The Phase 15.2 Commit 3 work is blocked on confirming Sayed's device is on a compatible iOS version. If Sayed needs to upgrade OS, the path is:

1. Verify iOS version: Settings → General → About → Software Version
2. If < 16.4: update via Settings → General → Software Update (typically requires device on Wi-Fi + charging)
3. Confirm Phase 15.2 Commit 3 readiness in v1.1 scoping session

Workspace-side TODOs gated behind this confirmation:
- VAPID key generation + storage (`VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` env vars)
- `web-push` npm package installation
- Service worker `push` event listener in `public/sw.js`
- Permission UI ("Enable notifications" toggle in profile/settings)
- DB column for storing push subscriptions per user (or reuse `pyra_notifications` infrastructure)

### Architectural invariants locked

- **Public bucket + obscure path** is the v1 security model (matches existing workspace pattern for invoices, contracts, WhatsApp media). v1.1 backlog: bucket RLS policies + signed URLs if security model evolves.
- **Client Canvas resize** strips EXIF as a side effect — zero new server-side dependencies (no `sharp` install). 1920×1920 max, JPEG 0.82.
- **5 MB per file + 10 per lead** are HARD caps. The 10-item cap covers BOTH file types combined (mixed grid, shared budget — Q1(a) lock).
- **SVG explicitly REJECTED** via MIME allowlist (XSS via embedded `<script>`).
- **Storage path is 100% server-controlled.** No part of `file.name` ever appears in the storage path; extension comes from validated MIME via `MIME_TO_EXT` map with hard-error on miss (Reviewer-flagged defense in Commit 1 against future map drift).
- **Voice notes share the same surface** as images (`LeadAttachmentsTab`, same cap, same Sheet detail pattern). Q1(a) decision was a mixed grid — voice cells render with audio-icon thumbnail + duration badge.
- **5-min voice cap is enforced BOTH client AND server** — `MAX_DURATION_SEC` (client) auto-stops at 300s with 4:30 warning toast; `MAX_VOICE_DURATION_SEC` (server) rejects with 422 if `duration_seconds > 300`. v1.1 backlog: extract to shared constant to eliminate drift risk.
- **`useVoiceRecorder` hook is NEW**, NOT extracted from `chat-input.tsx`. Q4(a) lock — chat-input.tsx remains untouched; v1.1 may consolidate.
- **Native `<audio controls>` playback** — Q5(a) lock; zero JS, browser handles play/pause/seek. v1.1: custom waveform player.
- **`canAccessLead` enforcement** identical between image + voice upload paths — no divergence.

---

## Phase 14.2 — DB Migrations Strategy ✅ (3/3)

**Status:** Complete. Post-rebuild infrastructure work that closes the
"how do we know the DB is at the right version + how do we rollback if
a migration breaks something" gap surfaced when the rebuild reached
17 numbered migrations. Forward-only philosophy, LF-normalized SHA-256
drift detection, append-mostly schema-version table, pre-migration
backup script. Self-hosted Supabase (32 MB DB, PG 15.8) makes pg_dump
restore-as-rollback cheap and fast.

### Sub-step commits

| # | Commit | What landed |
|---|---|---|
| 1 | `34294b2` | **Template + runbook + .gitignore.** `supabase/migrations/_template.sql` (84 LOC) locks the header conventions all 15 existing migrations already follow (Phase + Author + Date + Reversible + Touches-data + Risk-tier). `docs/MIGRATIONS.md` (393 LOC, 15 sections) — full operational runbook: writing, pre-flight, applying (Bash + PowerShell env-setup snippets), Common Migration Patterns (5.5 — NOT NULL on populated table, CHECK with NOT VALID + VALIDATE, FK with NOT VALID + VALIDATE, safe DROP COLUMN), manual verification (mandatory before record), drift detection (LF-normalized rationale documented), fresh-DB bootstrap, backup procedure, rollback strategy, concurrent protection (v1 trusts single dev), order enforcement (advisory), Windows + Git Bash requirements, troubleshooting. `.gitignore` patch adds `backups/`. Reviewer LIGHT PASSED 3/4 + 2 findings applied (Bash export quote-stripping; `rg --type ts` covers both `.ts` + `.tsx`). |
| 2 | `56d7f61` | **Schema version tracking + history scripts.** Renamed `scripts/migration-employee-system.sql` → `supabase/migrations/001_employee_system_bootstrap.sql` via `git mv` (preserves history, fills the 001 number gap, adds bootstrap header). Migration 017 — `pyra_schema_migrations` (version PK + applied_at + applied_by + checksum + notes) + index + COMMENT directives + backfill of 16 historical rows (001-016) with LF-normalized SHA-256 checksums embedded as literal hex strings, `ON CONFLICT (version) DO NOTHING` for idempotency. `scripts/db-record-migration.ts` (`pnpm db:record <version> [--by] [--notes] [--force]`) reads SUPABASE_SERVICE_ROLE_KEY from `.env.local` ONLY (never CLI / process env — shell history exposure risk). `scripts/db-check-drift.ts` (`pnpm db:check-drift`) compares stored checksums vs current files, reports DRIFT / MISSING / ORPHAN with distinct emoji + remediation hints. Both scripts use identical LF-normalization (`replace(/\r\n/g, '\n')`). Applied to production: 17 rows in `pyra_schema_migrations`, drift check reports "✅ All migrations clean (17 tracked, no drift)". Reviewer MEDIUM PASSED 4/4 + 1 clarifying comment on `ABDOU_USERNAME` env fallback (intentional asymmetry — username is non-sensitive). |
| 3 | `9e24b7f` | **Pre-migration backup script.** `scripts/db-backup.sh` (~110 LOC, mode 100755) — `pnpm db:backup [<label>]`. Label regex `^[a-zA-Z0-9._-]+$` + extra `..` check (defense in depth). Validates pg_dump on PATH with 3-OS install instructions (macOS brew, Linux apt, Windows postgresql.org installer). Reads SUPABASE_DB_URL from `.env.local` with quote-stripping. `pg_dump --no-owner --no-acl --schema=public --exclude-table-data='pyra_error_logs' --exclude-table-data='pyra_activity_log' \| gzip > backups/{TS}_{LABEL}.sql.gz`. Audit-table data excluded (schema retained, data regenerable). package.json invokes `bash scripts/db-backup.sh` (explicit bash, not `./scripts/...`) so PNPM-on-Windows routes through bash correctly. Reviewer LIGHT PASSED 2/2 (portability + shell injection). Six inline injection-attempt tests all rejected before pg_dump invocation. |
| 4 | (this commit) | Closure docs — CLAUDE.md "## Phase 14.2 — Locked Decisions" + this CRM-PROGRESS.md ✅ section + v1.1 backlog additions. |

### What's in production now

```
pnpm db:check-drift
> Tracked in pyra_schema_migrations: 17
> Found on disk:                     17
> ✅ All migrations clean (17 tracked, no drift)
```

### Tooling commands available

```bash
pnpm db:backup [<label>]                                    # pre-migration pg_dump snapshot
pnpm db:record <version> [--by=<u>] [--notes="…"] [--force] # record after manual verify
pnpm db:check-drift                                          # 3-category triage
```

### Architectural invariants locked

- **Forward-only migrations.** No automated down-scripts. Rollback via new migration OR `pg_dump` restore.
- **`pyra_schema_migrations` is the canonical version tracker.** Drift detection compares LF-normalized SHA-256 (handles Windows CRLF without false positives).
- **Append-mostly schema.** No `updated_at`, no trigger on `pyra_schema_migrations`. The only mutation path is explicit `--force` re-record.
- **Backup-before-migrate workflow.** `pnpm db:backup pre-NNN` for every Risk tier 2 migration; recommended for tier 1 too (cost is trivial).
- **Apply-then-verify-then-record.** `pyra_schema_migrations` is a historical record, not a confirmation of success. Manual verification of the changed schema must happen BEFORE `pnpm db:record`.
- **001 bootstrap migration** for fresh DB setup. Production DB has it applied via pre-Pyra deployment; `applied_by='bootstrap'` row records it retroactively.
- **Staging deferred to v1.1.** Triggered by: destructive migration OR multi-developer workflow. 32 MB DB + 1-dev + high idempotency hygiene makes staging cost > value today.
- **Single-developer assumption.** No advisory locks on `pnpm db:record`. v1.1 adds `pg_advisory_lock` when a second developer joins.
- **Order enforcement is advisory.** `pyra_schema_migrations` doesn't reject out-of-order INSERTs. v1.1 adds gap-detection warnings to `db-check-drift`.

---

## 🎉 CRM BUILD COMPLETE — phase index

13 phases, 13/13 complete. Execution order ran:
**0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 11 → 11 Refinement → 11.5 → 10 → 12 → 13**

(PRD numbering preserved for traceability; actual execution reordered
Phase 10 after 11.5 per Phase 11 closure decision, and inserted
Phase 11 Refinement + Phase 11.5 as gap-fill phases revealed during
ops setup.)

### Architectural decisions locked (Phases 7-15.2)

Single-source-of-truth principles documented in `CLAUDE.md`:
- **Phase 7:** Kanban architecture invariants (3-tier component split, opacity-0 source, pointerWithin collision, single useDraggable per lead.id, dropAnimation={null})
- **Phase 8:** AI Insights severity scheme + CRM caching conventions
- **Phase 9:** Health Score formula (recency 30 + payment 30 + active contracts 20 + engagement 20)
- **Phase 11:** Cron architecture (Option β — separate n8n PyraCRM_Cron workflow; idempotency trade-off; daily-Dubai-grouped notifications)
- **Phase 11 Refinement:** Settings layer as canonical routing source; two-step cron lookup with hard validation at fire time
- **Phase 11.5:** action_type + metadata.source separation pattern (constants in lib/api/activity.ts; specificity in metadata)
- **Phase 10:** Mobile Sheet primitive standard; per-card useState (no prop drilling); ACCENT_DOT in lib/constants/pipeline-colors.ts; touch target h-11 (44px)
- **Phase 12:** Email URL bypass-middleware invariant; module-guide collision-resolution pattern; audit-log target_path semantic upgrades
- **Phase 13:** EmptyState scope (full-page only — sidebar contexts use inline compact stubs); user-facing language ("قريباً" / "قريباً في v1.1" — never "Phase X" / "TODO"); gradient subtlety standard; non-link card hover (hover:bg-muted/30 transition-colors)
- **Phase 14.1:** Self-contained observability layer (pyra_error_logs + logError + admin viewer); 5-layer PII redaction pattern; beacon endpoint for Client Component error boundaries; service-role-client-is-server-only + middleware exemption for portal cookie sessions; append-mostly DB shape
- **Phase 15.2:** Lead attachment pattern (Canvas resize + server-generated paths + public bucket + obscure path security model + MIME_TO_EXT hard-error fallback); MediaRecorder hook abstraction (5-min cap + auto-stop + iOS-safe stream cleanup + Safari audio/mp4 fallback); mixed-type attachment grid pattern (images + voice notes share surface + shared 10-item cap); native `<audio controls>` playback
- **Phase 14.2:** Forward-only migrations (no auto-down); pyra_schema_migrations as canonical version tracker; LF-normalized SHA-256 for drift detection (Windows CRLF-safe); apply-then-verify-then-record workflow (manual verification prevents fake success rows); backup-before-migrate via `pnpm db:backup`; 001 bootstrap migration for fresh-DB setup; staging deferred to v1.1 (trigger: destructive migration OR multi-dev); single-developer assumption documented for concurrent-apply race window

---

## v1.1 Consolidated Backlog

Single ordered list of all v1.1 items carried forward from Phases 7-13. Operational items (await Abdou) listed first.

### Operational (await Abdou)

- [ ] **PWA icon PNG upload** (Phase 10) — `public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png`. Bumps Lighthouse PWA score from ~55 → ~90+.
- [ ] **Sayed Evolution instance setup** (Phase 11) — capture Sayed's WhatsApp number, admin populates routing row via the new Phase 11 Refinement Settings UI. Enables end-to-end live verification of Phase 11 exit-gate test 3.
- [ ] **Real-device RTL verification** for Phase 10 Commit 2 (`side="right"` + ChevronLeft on lead detail sidebar Sheet). One-line swap if either feels wrong.

### Code (future maintenance)

- [ ] **usePermission loading-state flicker** — admin sees write actions briefly hidden on every settings page load (Phase 11 Refinement)
- [ ] **Settings-client.tsx subsection extraction** — apply `components/settings/agent-whatsapp-settings/` pattern to existing `ApiKeysSection` + `ModuleSettingsTab` (Phase 11 Refinement)
- [ ] **Combobox-with-status-badge for instance dropdown** — replace HTML5 datalist with Popover + Command Combobox to show inline status badges (Phase 11 Refinement)
- [ ] **E.164 regex validation for `recipient_phone`** — Phase 11 Refinement Q-R-4 deferred
- [ ] **Warning banner: "agent has follow-ups but no active setting"** — Phase 11 Refinement Q-R-5 deferred
- [ ] **next-pwa plugin migration** — replace hand-written sw.js with workbox sophistication (Phase 10)
- [ ] **Push notifications via SW** — requires backend VAPID keys (Phase 10)
- [ ] **Dashboard widget per-component mobile audit** — Phase 10 Investigator flagged P2 (heavy widgets pull Recharts statically)
- [ ] **Code-split heavy charts via `dynamic()`** — Recharts adds ~70-80kB to any page importing statically (Phase 10)
- [ ] **Per-chip × removal on FilterBar chip strip** — Phase 10 Commit 4 deferred
- [ ] **Vertical compactness on 375px FilterBar** — admin mode produces 3 wrapping rows above kanban (Phase 10 P2)
- [ ] **Tags feature implementation** — Phase 13 Q-001a placeholder; the Tags slot in lead-sidebar currently shows "قريباً في v1.1"
- [ ] **EmptyState `size="compact"` variant** — Phase 13 Commit 2 flag — would have made strict Q-001a EmptyState swap viable for sidebar contexts
- [ ] **Phase 13 P2 polish** — typography refinements, spacing micro-adjustments, brand color drift cleanup (orange-* variants), empty-state lottie animations exploration, loading-skeleton refinements per surface
- [ ] **Phase 8 trend indicators backend wiring** — `TrendBadge` exists in `dashboard-kpi-cards.tsx`; backend always returns `trendPct=0`. Wire delta calculation.
- [ ] **GET-handler logActivity audit sweep** — remove `logActivity()` calls from read endpoints (trigger example: `app/api/dashboard/sales/approvals/route.ts:20`)
- [ ] **`/dashboard/sales/approvals` rename** — disambiguate from `/dashboard/crm/approvals` (quote workflow vs lead-pipeline approval; same Arabic label in sidebar). Phase 12 Q1 deferred.
- [ ] **`/dashboard/sales/settings` FOLD decision** — Path B from Phase 12 Q2: move SalesSettingsContent into `/dashboard/crm/settings` (new route) OR fold into `/dashboard/settings` existing tabs. Design-heavy, benefits from user input.
- [ ] **`sales.*` permission renaming in rbac.ts** — Phase 12 Q5 deferred. Touches many call sites; better as holistic refactor.
- [ ] **Webhook notifications use direct INSERT** (lines 352, 364 of `app/api/dashboard/sales/whatsapp/webhook/route.ts`) — pre-Phase-11 violation of "central `notify()` helper" rule. Migrate to `notify()`.
- [ ] **Promise.all batching with concurrency cap** for follow-up-reminders cron (Phase 11) — only if production volume exceeds ~50 reminders / 5-min tick
- [ ] **24h-window reminder UI flag** in follow-up create form (Phase 11) — let agent set custom `reminder_at` instead of default `due_at - 30min`
- [ ] **Agent-instance-down notification** (Phase 11) — when cron finds 0 connected instances, surface one-time admin alert
- [ ] **Retry mechanism for failed Evolution sends** (Phase 11) — currently flagged as sent regardless of outcome; v1.1 could add retry queue
- [ ] **`AVAILABLE_PERMISSIONS` auto-derive** from a central permissions registry in `settings-client.tsx` (Phase 11) — currently manually maintained; drifted between code and UI for 4 days before being noticed
- [ ] **Unlink mechanism for Lead↔Client** (Phase 11.5) — admin UI to detach. v1 only supports linking; unlink is SQL-manual
- [ ] **Bulk link from leads list** (Phase 11.5) — multi-select leads + assign to single client
- [ ] **Auto-suggest based on phone match** (Phase 11.5) — when opening Link-Client modal, pre-select likely matches based on `lead.phone` vs `pyra_clients.phone` similarity
- [ ] **Audit-log action_type pattern sweep** (Phase 11.5) — migrate any pre-Phase-11.5 `logActivity()` call sites that used hardcoded strings to the `${ENTITY_TYPES}_${ACTIVITY_ACTIONS}` + `metadata.source` pattern

### Phase 14.1 v1.1 items

- [ ] **TTL / prune cron for `pyra_error_logs`** — table is unbounded growth in v1 (acceptable: ~14k rows/year typical for low-traffic CRM). Add nightly cron that prunes `resolved=true` rows older than 90 days + `severity='info'` rows older than 30 days.
- [ ] **Severity grouping / dedup** — repeat identical errors create N rows; v1.1 could group by `(message, error_type, stack_trace)` and increment a `count` column.
- [ ] **`apiServerError` user-context plumbing** — currently 722 callers don't pass auth context. The 8 high-risk routes pass it explicitly via `logError`. v1.1 could add an optional `user` param to `apiServerError` to opportunistically include user context across more sites — but only if/when it stops being a 30-site touch (more than 30 hand-edits is too brittle).
- [ ] **`useDeleteAttachment`-style audit on other React Query mutations** — sweep `hooks/use*.ts` for raw `fetch()` calls in `useMutation` that should be `mutateAPI`. The Phase 14.1 Reviewer found one such (DELETE-attachment) but a broader codebase audit may find more.
- [ ] **Magic-byte file validation for attachments + uploads** — currently we trust `file.type` (browser-supplied MIME) + extension. v1.1 could read first ~16 bytes and verify against a magic-bytes table (PNG starts with `\x89PNG\r\n\x1a\n`, JPEG with `\xff\xd8\xff`, etc.). Adds robustness against MIME spoofing.

### Phase 15.2 v1.1 items

- [ ] **Push notifications via Service Worker (Commit 3)** — requires Sayed's device on iOS 16.4+ (Apple's web push support shipped March 2023). Workspace TODOs gated behind that: VAPID keys, `web-push` package, sw.js `push` event listener, permission UI, push-subscription storage.
- [ ] **Bucket RLS policies + signed URLs** — currently `pyraai-workspace` is public + obscure-path security model (matches existing workspace pattern for invoices/contracts). v1.1 could add RLS policies to `storage.objects` + switch to `createSignedUrl()` for lead attachments specifically.
- [ ] **Server-side thumbnail generation** — v1 uses the same 1920×1920 image for both grid + detail. Acceptable: ~150-300KB typical × 10 = max 3MB/lead. v1.1 could add `sharp` server-side resize for grid-sized thumbnails (e.g., 400×400) to reduce bandwidth.
- [ ] **Orphan storage sweep cron** — DB CASCADE clears `pyra_lead_attachments` rows when a lead is deleted, but storage objects in the bucket stay. v1.1: nightly cron compares `pyra_lead_attachments` rows vs storage `list()` results and removes orphans.
- [ ] **`chat-input.tsx` + `useVoiceRecorder` consolidation** — Phase 15.2 Q4(a) lock left `components/sales/chat/chat-input.tsx`'s pre-existing voice recorder untouched. If both surfaces converge on identical requirements (duration cap, MIME negotiation, etc.), v1.1 can migrate `chat-input.tsx` to consume `useVoiceRecorder`.
- [ ] **Custom waveform audio player** — v1 uses native `<audio controls>` (Q5(a) lock). v1.1 may add a WhatsApp-style waveform player (~200 LOC + new library).
- [ ] **Shared `MAX_VOICE_DURATION_SEC` constant** — currently declared independently in `hooks/useVoiceRecorder.ts` (client = 300) and `app/api/crm/leads/[id]/attachments/route.ts` (server = 300). v1.1: extract to `lib/constants/crm.ts` to eliminate drift risk.
- [ ] **shadcn `AlertDialog` for delete confirmations** — Commit 1 + Commit 2 use `window.confirm()` for attachment delete. CLAUDE.md mandates "toast from sonner; NEVER alert()" — confirm() is a different surface but the spirit of the rule favors consistent shadcn dialogs.
- [ ] **HEIC server-side decode for thumbnail generation** — currently HEIC is transparently converted to JPEG by client Canvas. If desktop browsers (non-iOS) can't decode HEIC for createImageBitmap, upload fails on those browsers. v1.1: add `sharp` + `libheif` server-side fallback path.
- [ ] **Per-file size warning during recording** — v1 only warns on duration (5-min cap). A 3-min stereo audio recording can hit the 5MB file-size cap before the duration cap. v1.1: monitor blob size during recording, warn at 4MB, auto-stop at 5MB.

### Phase 14.2 v1.1 items

- [ ] **Staging environment provisioning** — Coolify second Supabase stack at $0 (free tier, separate from prod). Triggered by: a destructive migration entering scope OR a second developer joining the codebase. Documented in `docs/MIGRATIONS.md` as the gate.
- [ ] **`pnpm db:apply` wrapper** — single command that runs `db:backup pre-NNN` + the curl `/pg/query` apply + `db:record NNN`. Removes the manual ordering risk (forget to backup → migration fails → no rollback). v1 explicit-step workflow is intentional (manual verification step between apply and record); the wrapper would still pause for verification.
- [ ] **`pnpm db:bootstrap` script for fresh DB setup** — applies 001 → highest existing migration in order, then runs `db:record` for each. Removes the manual loop from `docs/MIGRATIONS.md` §9.
- [ ] **Advisory lock via `pg_advisory_lock`** for concurrent migration safety — triggered when a second developer joins. Until then, the single-dev workflow eliminates the race.
- [ ] **Order-gap warnings in `db-check-drift`** — flag when version 020 exists in `pyra_schema_migrations` but 019 doesn't (without failing the check — warning only). Document as v1.1 in `docs/MIGRATIONS.md` §13.
- [ ] **Offsite backup to S3** via Coolify's object-storage integration. Currently `backups/` is local-only + gitignored. Offsite is Abdou's call; the backup script itself is unchanged — only the post-dump upload step is added.
- [ ] **pg_dump availability check** at `pnpm dev` startup or first-migration time — currently the dev hits the error only when they try `pnpm db:backup`. A pre-flight check at install time would surface the missing-tool sooner.
- [ ] **Pre-commit hook** that runs `pnpm db:check-drift` against the working tree — catches drift before pushing rather than after. Optional opt-in via husky.

### Phase 14.3 v1.1 items — security audit remaining findings

**Across two fix-bundle sessions (2026-05-15 + 2026-05-16):** shipped 5 of 8 P1 findings from `docs/SECURITY-AUDIT-2025-01.md` + 1 Reviewer-surfaced bonus bug fix. Commits: `4eaaa70` (WhatsApp timing), `7abad17` (sales-leads injection), `125104e` (password constant), `0825f54` (countQuery), `fa30e3a` (task XSS).

**Remaining P1 findings (3) — all deferred with explicit business rationale:**

- [ ] **🟠 P1 — 2FA secret stored unencrypted in DB** (`app/api/auth/two-factor/route.ts:38,73,131-142`) — `pyra_users.two_factor_secret` is raw text. A DB-read breach exposes valid TOTP codes for every user. **Business deferral reason:** Pyramedia is not using 2FA yet. When 2FA usage is enabled, this becomes the first fix to ship — alongside the enforcement gap below (they're two halves of the same problem). Fix shape: encrypt via separate `TWO_FACTOR_ENCRYPTION_KEY` env var (NaCl/age/AES-GCM); migrate existing rows. Estimated time: M.
- [ ] **🟠 P1 — 2FA not enforced at login** (`app/api/auth/login/route.ts:44-66`) — `signInWithPassword` succeeds without checking `pyra_users.two_factor_enabled`. Users with 2FA enabled get password-only login (security theater). **Business deferral reason:** Same dependency as 2FA encrypt above — no point enforcing an unencrypted secret; no point encrypting an unenforced secret. Ship both together when 2FA roll-out is approved. Fix shape: 2-step flow when `two_factor_enabled=true`; partial-auth response → TOTP verification → full session. Estimated time: M.
- [ ] **🟠 P1 — No GDPR data export + client self-erasure** — UAE PDPL + GDPR Articles 17 + 20 compliance gap. **Business deferral reason:** Pyramedia operates in UAE/GCC market, not EU. UAE PDPL has similar provisions but is less prescriptive. Admin can manually export/delete via existing user-DELETE endpoint until either (a) an EU client is onboarded or (b) UAE enforcement becomes more proactive. Fix shape: `/api/users/[username]/export` (JSON/ZIP) + `/api/portal/profile/delete-account` (email-confirm soft-delete with PII scrub). Estimated time: L (each).

**Deferred (lower-priority P1):**

- [ ] **🟠 P1 — No rate limit on `/api/crm/leads` POST** — authenticated abuse only (sales agent could spam-create leads). Lower priority than the others; add `apiWriteLimiter` when convenient. Estimated time: XS.

**Remaining P2 findings (10) — full list in `docs/SECURITY-AUDIT-2025-01.md` Risk Matrix:**

- [ ] **🟡 P2 — `extra_permissions` field accepts any string** (admin foot-gun: phished admin → set `["*"]` → instant super-admin). Fix: whitelist against `PERMISSIONS` constants. Time: S.
- [ ] **🟡 P2 — In-memory rate limiter** non-shared across processes. Switch to Redis (ioredis or upstash/ratelimit) when scaling horizontally. Time: L.
- [ ] **🟡 P2 — `pyra_error_logs` no retention TTL** — Phase 14.1 left this open. Add cron `/api/cron/error-logs-cleanup` for 90-day prune. Time: S.
- [ ] **🟡 P2 — PII regex misses Arabic-numeral phones** (`٠٥٦٥٧٩٩٥٠٥`) + parens-formatted phones. Add normalization pass before regex. Time: S.
- [ ] **🟡 P2 — Dev-mode forgot-password leaks raw reset token** — `NODE_ENV` check is too easy to misconfigure. Replace with explicit `ENABLE_TEST_RESET_TOKEN=true` flag. Time: XS.
- [ ] **🟡 P2 — Local backups unencrypted at rest** — `backups/` relies on filesystem encryption. Add `gpg --symmetric` or `age` wrapper. Time: S.
- [ ] **🟡 P2 — WhatsApp conv search partial sanitization** — strips commas/parens but not dots. Switch to `escapePostgrestValue` like the just-fixed sales-leads route. Time: XS.
- [ ] **🟡 P2 — No 2FA rate limit** on `/api/auth/two-factor` POST/PATCH/DELETE — brute force 6-digit TOTP in seconds without limiter. Add `apiWriteLimiter`. Time: XS.
- [ ] **🟡 P2 — No per-account login lockout** (only per-IP) — distributed brute-force via proxy rotation bypasses the IP limiter. Add per-email secondary limiter. Time: S.
- [ ] **🟡 P2 — External-auth helper hash compare not constant-time** (`lib/api/external-auth.ts:14-28`) — theoretical timing leak on the SHA-256 digest. Switch to `timingSafeEqual` (defense in depth). Time: S.

**⚠️ Unknown (operational verification needed):**

- [ ] **Coolify-managed Postgres auto-backup encryption** — out of codebase audit scope. Needs Abdou confirmation: is Coolify auto-backing-up the Postgres instance? Are those backups encrypted at rest? Documented in CLAUDE.md Phase 14.2 locked decisions as "needs Abdou confirmation".

**Reviewer-surfaced bug (NOT in original audit) — RESOLVED:**

- [x] ~~`countQuery` mutation-without-reassignment~~ **✅ FIXED** in commit `0825f54` (2026-05-16 quick-win session). The bug was real: pre-fix, with 29 total leads / sayed=27 / elharm=2, BOTH non-admin agents saw `total=29` in pagination. Post-fix, each sees their own count.
