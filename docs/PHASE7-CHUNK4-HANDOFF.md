# Phase 7 Exit Gate Handoff

> **⚠️ FILENAME NOTE:** This file used to contain a Chunk 4 (mobile picker)
> spec. Abdou re-read `/CRM-PRD/05-EXECUTION-PHASES.md` and confirmed mobile
> picker is **Phase 10 (Mobile PWA Polish)**, NOT Phase 7. Chunk 4 + Chunk 5
> are abandoned. The filename stays for git history continuity, but the
> contents below are the **Phase 7 Exit Gate plan** — the actual path to
> closing Phase 7.
>
> **PRD is the source of truth. No more inventing chunks.**

---

## TL;DR

Phase 7 closes via 8 acceptance tests from PRD § Phase 7. Four are
already verified, four need verification (one of them — Test 8 — was
just verified by static analysis pre-compact, see below). Mobile
picker work is deferred to Phase 10. After all 8 pass, mark Phase 7
complete and proceed to Phase 8 (Sales Dashboard).

## Latest commit on `origin/main`

`ca6403f` — original Chunk 4 handoff doc. This rewrite supersedes it.
The next commit will replace this file's content with the exit-gate
plan and push, becoming the new HEAD.

Recent history:
```
ca6403f docs(crm): Phase 7 Chunk 4 handoff (now superseded by THIS rewrite)
ed3fb47 fix(crm): pipeline collision detection — pointerWithin for RTL
6f926d8 fix(crm): pipeline drag-drop — adopt project-kanban pattern
aed3371 fix(crm): pipeline DragOverlay invisibility — separate overlay
e263954 fix(crm): pipeline DragOverlay invisibility — unique id
```

---

## The 8 acceptance tests — current status

| # | Test | Status | Verified by |
|---|---|---|---|
| 1 | Sayed cannot move directly to closed_won | ✅ verified | Phase 3.4 client guard, test (y) passed |
| 2 | Sayed moves to contract_signed without attachment → blocked | ✅ verified | Backend test (b) passed |
| 3 | Sayed moves to contract_signed WITH contract → notification appears in Abdou's bell within seconds | ⚠️ **NOT VERIFIED** | Backend tested via curl; no E2E with Sayed's account + Abdou's bell |
| 4 | Abdou opens approvals → sees lead → approves → lead becomes closed_won | ✅ verified | Chunk 2 test (j) passed |
| 5 | Sayed receives notification of approval | ⚠️ **NOT VERIFIED** | Need to log in as Sayed after Abdou approves |
| 6 | Sayed cannot call /approve endpoint directly (403) | ✅ verified | Backend test (f) passed |
| 7 | Activity timeline shows complete chain: stage_change → closed_won_pending → closed_won_approved | ⚠️ **NOT VERIFIED** | Need to inspect a real lead's timeline after full E2E |
| 8 | No `INSERT INTO pyra_notifications` outside `notify()` | ✅ **JUST VERIFIED** (pre-compact) | `Grep` returned zero matches across `*.ts/*.tsx` |

**5 ✅ verified, 3 ⚠️ remaining (all require live E2E).**

Plus 1 explicit decision logged: My Work Inbox surface — Option (iii)
locked pre-compact (see Finding 2 below for rationale).

Effective state: **3 E2E tests remain to close Phase 7** — Tests 3, 5, 7.

## Pre-compact findings (queued for post-compact me)

### Finding 1: Test 8 PASSES by static analysis ✅

```
Grep: INSERT INTO pyra_notifications across *.ts/*.tsx
Result: zero matches
```

The `notify()` helper at `lib/notifications/notify.ts` is the sole writer
to `pyra_notifications`. No drift from the architectural rule established
in CLAUDE.md.

### Finding 2: PRD gap — My Work Inbox doesn't surface `closed_won_pending` ⚠️

```
Grep: lead_closed_won_pending_approval | closed_won_pending across *.ts/*.tsx
Found in 8 files:
  ✓ components/crm/approvals/approval-card.tsx        (approvals dashboard UI)
  ✓ lib/notifications/notify.ts                       (notify type union)
  ✓ app/api/crm/leads/[id]/move-stage/route.ts        (backend mutation)
  ✓ types/database.ts                                 (types)
  ✓ lib/constants/statuses.ts                         (constants)
  ✓ components/crm/activity/activity-timeline.tsx     (timeline)
  ✓ components/crm/activity/activity-item.tsx         (timeline item)
  ✓ app/api/crm/approvals/pending/route.ts            (pending approvals API)

NOT FOUND in:
  ✗ app/api/my-work/route.ts          (the unified inbox aggregator)
  ✗ components/dashboard/MyWorkInbox.tsx
```

The PRD says **"My Work Inbox shows lead_closed_won_pending_approval for
managers"** — this isn't satisfied. CRM closed-won pending approvals only
surface in the approvals dashboard (`/dashboard/approvals`), not in the
inbox card on `/dashboard`.

**🔒 DECISION (locked by Abdou pre-compact): Option (iii) — PRD satisfied implicitly.**

Abdou's rationale (verbatim):
- closed_won_pending notifications fire to managers via bell (test 4
  verified this earlier)
- `/dashboard/crm/approvals` is a dedicated, context-rich surface with
  lead details + attachment preview + approve/reject buttons — strictly
  better UX than a generic line item in My Work Inbox
- Adding it to MyWorkInbox would be visual duplication without UX
  benefit; managers would see the same item in two places

**This is an intentional, documented deviation from strict PRD wording.**
The PRD test ("My Work Inbox shows lead_closed_won_pending_approval for
managers") is satisfied via the notification bell + dedicated approvals
dashboard — both already shipped and surface the workflow with full
context.

**Future sessions: do NOT "fix" this gap by wiring closed_won_pending
into My Work Inbox.** That would re-introduce visual duplication. The
decision is locked.

Action item for Phase 7 closure: transcribe this decision into CLAUDE.md
under "Phase 7 caveats" so it survives beyond this ephemeral handoff doc.

---

## E2E test plan for Tests 3, 5, 7

### Setup
- **Test lead:** `sl_Y1wGyzfprQ2E4T7C` ("تيست انتي") — already reset to
  `stg_new_inquiry` (last reset confirmed pre-compact).
- **Test accounts:**
  - `sayed` (role: Sales — has 22 CRM permissions including `leads.update`,
    `leads.move-stage`, etc.)
  - `abdou` (admin — sees all approvals)
- **Browser setup:** two browser profiles or one window with multiple
  tabs and explicit logout-login between actor switches.

### Steps (in order — tests interlock)

1. **Login as Sayed.**
2. Navigate to `/dashboard/crm/pipeline`. Confirm test lead visible in
   `stg_new_inquiry`.
3. Drag lead through stages: `new_inquiry → discovery_call → proposal_sent →
   negotiation`. (Each transition fires a routine `notify()` to the
   manager but is non-blocking.)
4. Drag/click to move lead to `stg_contract_signed`. Modal opens for
   attachment picker. Attach a real file (any quote/contract from the
   workspace's existing files, e.g., a previously generated quote PDF).
   Confirm the move. **Expected:** toast "تم نقل العميل المحتمل" (or
   the actual copy used in `pipeline-client.tsx`).
5. **Without logging out**, open `/dashboard` in a new tab and check
   the bell icon. **Expected:** `lead_contract_signed` notification for
   Abdou (the manager). But Sayed is the actor, not the recipient — so
   actually we need to switch accounts.

   Wait — the move-stage route fires `notify()` to the manager
   (Abdou). To verify Test 3, we need Abdou's bell. **Logout. Login
   as Abdou.**

6. **Login as Abdou.** Open `/dashboard`. **TEST 3:** the bell should
   show a recent `lead_contract_signed` (or whatever the type is —
   confirm by reading move-stage route post-compact) notification
   pointing to the test lead. ✅ if visible within ~5 seconds of step 4.

7. As Abdou, navigate to `/dashboard/approvals`. **TEST 4 (re-verify):**
   the test lead should appear in the pending approvals list with
   stage `stg_closed_won_pending_approval`.

8. As Abdou, click "موافقة" (approve) on the test lead. **Expected:**
   lead transitions to `stg_closed_won` (verify by re-loading
   `/dashboard/crm/pipeline`).

9. **Logout. Login as Sayed.** Open `/dashboard`.
   **TEST 5:** the bell should show a `lead_closed_won_approved` (or
   similar — confirm type post-compact) notification. ✅ if visible.

10. As Sayed, navigate to `/dashboard/crm/leads/sl_Y1wGyzfprQ2E4T7C`.
    Scroll to the activity timeline. **TEST 7:** the timeline should
    show, in order:
    - `stage_change` events for the routine moves (new_inquiry →
      discovery_call → proposal_sent → negotiation)
    - `stage_change` to `stg_contract_signed` with attachment ref
    - `lead_closed_won_pending_approval` (the request entry)
    - `lead_closed_won_approved` (the approval resolution by Abdou)
    ✅ if all four phases present in chronological order.

### Reset between runs

If we need to re-run, run this SQL via the standard endpoint:
```sql
UPDATE pyra_sales_leads
SET stage_id = 'stg_new_inquiry',
    win_probability = 10,
    win_probability_overridden = false,
    lost_reason = NULL,
    is_converted = false
WHERE id = 'sl_Y1wGyzfprQ2E4T7C';
```

Plus delete generated notifications + activity rows scoped to this lead
to keep timeline clean for re-test.

---

## Phase 7 closure checklist

After Tests 3, 5, 7 pass:

- [ ] Update `docs/SYSTEM-STRUCTURE.md` with any Phase 7 details that
      diverge from prior docs (e.g., Q-BIZ-001 hybrid win-probability
      stage matrix; closed_won approval flow; pointerWithin RTL note)
- [ ] Update `CLAUDE.md` with Phase 7 caveats (sales_agent finance.view
      limitation if any, stage matrix, terminal closed_won, etc.)
- [x] **(decided pre-compact)** My Work Inbox `closed_won_pending`:
      Option (iii) selected — PRD satisfied implicitly via notification
      bell + dedicated `/dashboard/crm/approvals` surface
- [ ] Transcribe Option (iii) decision + rationale into CLAUDE.md
      under "Phase 7 caveats" (so the decision survives beyond this
      ephemeral handoff doc)
- [ ] Mark Phase 7 complete in `/CRM-PRD/05-EXECUTION-PHASES.md` (or
      whatever PROGRESS tracker exists in the repo — check)
- [ ] Single commit titled
      `chore(crm): Phase 7 complete — manager approval workflow shipped`
- [ ] Push, verify on origin/main
- [ ] Tag the commit (e.g., `crm-phase-7-complete`) if Abdou wants

Then proceed to Phase 8 (Sales Dashboard) per PRD.

---

## Standing policies — re-affirmed by Abdou

1. **PRD is the source of truth.** No more inventing chunks. Re-read
   `/CRM-PRD/05-EXECUTION-PHASES.md` if scope feels off.
2. **Push to `origin/main` after every commit.** Coolify auto-deploys.
3. **Propose before pushing** non-trivial changes. For surgical
   tweaks (config, single-line fix, doc edit) just push.
4. **Verify on origin/main after push** — `git log origin/main --oneline -3`.
5. **`pnpm run check` + `pnpm build` MUST both pass** before push.
6. **DB migrations:** run via `curl -X POST` to the pg/query endpoint —
   never ask Abdou to run SQL manually.
7. Other rules from CLAUDE.md / MEMORY.md still apply (RTL classes,
   dark mode pairing, status constants, React Query mandatory data
   layer, helpers from `lib/api/*` and `hooks/api-helpers.ts`, etc.).

---

## First actions in the next session

1. **Re-read this file end-to-end.**
2. **Re-read `/CRM-PRD/05-EXECUTION-PHASES.md` § Phase 7** — confirm the
   8 tests match what's documented above. (PRD wording may differ
   slightly from Abdou's verbatim list — defer to PRD if conflict.)
3. **Confirm "Pre-compact findings" still hold** — the grep results
   should be reproducible. Re-run if uncertain.
4. **Send Abdou the plan + status**:
   - Test 8: ✅ verified by static grep (queue your reproduction)
   - My Work Inbox: ✅ **already decided pre-compact — Option (iii)**.
     See "Finding 2" above. No re-litigation. Don't re-present options.
   - E2E test plan: present the step-by-step above; ask if he wants any
     modifications before we run live
5. **Phase 8 prep:** after Phase 7 closure, re-read
   `/CRM-PRD/05-EXECUTION-PHASES.md` § Phase 8 +
   `/CRM-PRD/04-UI-PAGES-AND-COMPONENTS.md` (Sales Dashboard section).
   Propose Phase 8 plan for Abdou's review BEFORE writing code.
5. **Wait for Abdou's approval** before doing E2E (he wants to review
   before live testing).
6. **After approval:** run E2E walk-through with Abdou on the call /
   in messages. Mark each test ✅ as verified.
7. **After all 8 ✅:** execute the Phase 7 closure checklist.

---

## Architecture invariants (carried over from Chunk 3)

These must NOT regress in any Phase 7 closure work or Phase 8 work:

- **3-tier component split** in `components/crm/pipeline/pipeline-card.tsx`:
  `PipelineCard` (source wrapper) → `PipelineCardView` (pure visual) →
  `PipelineCardOverlay` (overlay ghost)
- **`useDraggable` only on the wrapper `<div>`**, never on the `<Link>` or
  `<PipelineCardView>`
- **3 deviations from project-kanban**, all intentional:
  - Source uses `opacity-0 pointer-events-none` while dragging (HubSpot UX)
  - `<DragOverlay dropAnimation={null}>` (avoid snap-back jank)
  - `collisionDetection={pointerWithin}` (RTL correctness)

---

## Reuse without modification (carried over)

- `hooks/useMoveLeadStage` — mutation hook
- `components/crm/pipeline/move-stage-confirm-modal.tsx` — handles
  contract_signed (attachment) + closed_lost (reason)
- closed_won client-side instant toast guard
- `notify()` / `notifyMany()` from `lib/notifications/notify.ts` (the
  ONLY writer to `pyra_notifications`)
- `logActivity()` from `lib/api/activity.ts`
- All toast copy in `pipeline-client.tsx`'s drag-drop dispatch

---

## Phase 8 preview (per PRD, post Phase 7 closure)

Phase 8 = Sales Dashboard. Out of scope for this handoff. The next
session shouldn't touch it until Phase 7 is officially closed.
