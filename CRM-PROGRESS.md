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

## CRM Phase 8 — Sales Dashboard Page ⏳
**Status:** Plan in proposal — awaiting Abdou's review before implementation

Page route: `/dashboard/crm` (the main CRM dashboard).

Scope per PRD §05 + §04 + §03:
- 9 components in `components/crm/dashboard/`
- 6 GET endpoints under `app/api/crm/dashboard/`
- Permission: `crm_reports.view` (`crm_reports.team_view` for team perf)
- Exit Gate: matches `pyramedia-dashboard.html` mockup, numbers reconcile
  to underlying queries, AI insight banner shows for relevant conditions,
  team filter visible only to managers

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
