# CRM Module — Build Progress

Tracks CRM rebuild phases per `/CRM-PRD/05-EXECUTION-PHASES.md`.

> **Phase numbering note:** This is the **CRM-specific** phase tracker.
> The workspace-level `PROGRESS.md` uses its own phase numbering for
> the original ERP build (Phase 1 = Foundation, Phase 7 = Realtime &
> Notifications, Phase 8 = Advanced File Features, etc.) and is
> unrelated. **CRM Phase 7 ≠ Workspace Phase 7.** Don't confuse the two.

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

## CRM Phase 9 — Active Customer Page (Contracts Tab) ⏳
Pending. Customer-detail page at `/dashboard/crm/customers/[id]`.

## CRM Phase 10 — Mobile PWA Polish ⏳
Pending. **Scope expanded** to include mobile stage picker (deferred
from Phase 7 per Q-UI-001 deviation).

## CRM Phase 11 — Cron Jobs + WhatsApp Integration ⏳
Pending.

## CRM Phase 12 — Old Sales Module Sunset ⏳
Pending.
