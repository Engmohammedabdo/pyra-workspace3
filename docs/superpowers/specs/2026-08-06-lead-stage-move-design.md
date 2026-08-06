# Move a lead to another stage from the lead detail page

**Date:** 2026-08-06
**Status:** Design approved, ready for planning
**Owner ask:** «عاوز اضيف خيار نقل الليد لمرحلة اخرى بطريقة سهله» — from the lead
detail page, without going back to the pipeline and dragging the card.

---

## 1. Problem

`/dashboard/crm/leads/[id]` shows the lead's stage as a read-only pill. The only
way to change it is to navigate back to `/dashboard/crm/pipeline` and drag the
card across columns (or use the mobile bottom sheet on the card). An agent
working a lead — reading its activity, making the call, writing the note — has
to leave the page to record the outcome of that work.

## 2. What already exists (reused, not rebuilt)

| Piece | Location | State |
|---|---|---|
| Move-stage endpoint | `app/api/crm/leads/[id]/move-stage/route.ts` | Complete: permission gate, row scope, per-stage validation matrix, win-probability recompute, activity row, notifications, audit log |
| Mutation + optimistic update | `useMoveLeadStage` in `hooks/useLeads.ts` | Complete, incl. cache invalidation of the single-lead query |
| Toast-wrapped runner | `useMoveLeadStageWithToasts` in `hooks/useLeads.ts` | Complete: 4 success variants, 5 error variants |
| Extra-data modal | `components/crm/pipeline/move-stage-confirm-modal.tsx` | Two modes: `contract_signed` (attachment picker), `closed_lost` (reason chips + textarea) |
| Stage list UI | `components/crm/pipeline/mobile-stage-sheet.tsx` | Bottom sheet, colored dots, bilingual stage names, RTL-correct |
| Stage catalogue | `usePipelineStages()`, `PIPELINE_STAGE_IDS` | Complete |

**No backend work is required.**

## 3. Constraints the API imposes (source: the route's validation matrix)

| Target stage | Requirement |
|---|---|
| `stg_closed_won` | **Always rejected.** Owned by the approval flow (`/dashboard/crm/approvals`) |
| `stg_contract_signed` | Requires an `attachment` — a contract or invoice, verified server-side to belong to this lead/client |
| `stg_closed_lost` | Requires a non-empty `lost_reason` |
| Any target, when the lead is currently at `stg_closed_won` | Requires `leads.manage` **and** a `reopen_reason` |

### 3.1 Two live gaps this design closes

**Gap A — reopen is unreachable from anywhere in the product.**
`MoveStageInput` (hooks/useLeads.ts:141) declares `reopen_reason?: string`, but
`runMoveStage` only forwards `attachment` and `lost_reason` — `RunMoveStageExtras`
has no `reopen_reason` field, so the value can never be supplied. A lead that
reaches «فوز بالصفقة» therefore cannot be moved anywhere: the pipeline drag
returns 422 `reopenReasonRequired` and no UI exists to satisfy it. (Same class of
one-way door as the pipeline-task approval lock.)

**Gap B — the attachment picker is unusable for sales agents.**
`MoveStageConfirmModal`'s `contract_signed` mode reads `/api/finance/contracts`
(gated `finance.view`) and `/api/invoices` (gated `invoices.view`). Neither is in
`sales_agent`'s `ROLE_EXTRAS` (lib/auth/rbac.ts:828-860), so an agent opening that
mode sees the `loadFailed` state. Documented as a Phase 7 known gap.
**Owner decision (2026-08-06): do not build lead-scoped finance sub-endpoints
now — disable the stage for non-finance users with an explicit reason instead.**

## 4. Design

### 4.1 Entry point

A **«نقل لمرحلة»** button in the lead header's quick-action row, positioned
after «متابعة» and before «إنشاء عرض سعر» (grouping the deal-advancing actions).

Visibility and state:

| Condition | Result |
|---|---|
| No `leads.move_stage` permission | Button not rendered |
| `lead.archived_at` is set | Button disabled — an archived lead is out of the pipeline |
| Lead at `stg_closed_won`, user lacks `leads.manage` | Button disabled with reason «الصفقة مغلقة — الأدمن فقط يقدر يعيد فتحها» |
| Otherwise | Enabled |

### 4.2 Stage picker

`components/crm/pipeline/mobile-stage-sheet.tsx` is generalized into a shared
`StagePickerSheet` used by **both** the pipeline card and the lead detail page —
one component, one behavior, no duplicated list rendering.

Generalization required: the current props take a pipeline `Lead` object. Replace
with the two values actually used — `currentStageId: string | null` and
`leadName: string` — plus a new `options` prop carrying per-stage enablement.
`PipelineCard`'s call site is updated accordingly.

Each row renders enabled, or disabled with a short reason line underneath.

### 4.3 Enablement rules

Extracted to a pure function so the decision logic is testable without React:

```ts
// lib/crm/stage-options.ts
buildStageOptions({
  stages,            // PipelineStage[] from usePipelineStages()
  currentStageId,    // lead.stage_id
  canAttachFinance,  // finance.view || invoices.view
  isArchived,        // !!lead.archived_at
}): StageOption[]    // { id, disabled, disabledReasonKey }[]
```

Rules:

- The current stage is omitted from the list.
- `stg_closed_won` — always disabled, reason `closedWonViaApproval`.
- `stg_contract_signed` — disabled when `!canAttachFinance`, reason
  `contractNeedsAdmin`.
- When `isArchived` — every option disabled (the button is already disabled; this
  is defence in depth for a re-render race).
- Everything else — enabled.

Note: when the lead is at `stg_closed_won`, `canReopen` gates the **button**, not
individual options — an admin reopening the deal may send it to any valid stage.

### 4.4 Selection behaviour

| Selected stage | Action |
|---|---|
| Lead currently at `stg_closed_won` | Open `MoveStageConfirmModal` in the new `reopen` mode (see 4.5) — regardless of target |
| `stg_closed_lost` | Open the existing `closed_lost` mode |
| `stg_contract_signed` | Open the existing `contract_signed` mode |
| Anything else | Call `runMoveStage(leadId, toStageId, fromStageId)` directly; the hook owns the toast |

### 4.5 New `reopen` mode on `MoveStageConfirmModal`

A third variant beside `contract_signed` and `closed_lost`:

- Textarea for the reason, minimum 5 characters (mirrors `MIN_LOST_REASON`).
- An explicit warning that reopening will remove the deal from the customers list
  and reset its win probability — because that is exactly what the route does
  (`is_converted = false`, `converted_at = null`,
  `win_probability_overridden = false`, `win_probability` reset to the target
  stage default).
- Confirm button uses the destructive variant.

`MoveStageConfirmPayload` gains `{ mode: 'reopen'; reopen_reason: string }`.
`MoveStageConfirmTargetId` widens from the two-stage union to `string`, since a
reopen can target any stage — the modal already receives `targetStageId` and only
uses it to select the variant.

### 4.6 Wiring the dropped field

- `RunMoveStageExtras` gains `reopen_reason?: string`.
- `runMoveStage` forwards it: `...(extras?.reopen_reason ? { reopen_reason: extras.reopen_reason } : {})`.
- `pipeline-client.tsx`'s `handleDropChangeStage` gains a branch: when the source
  lead is at `stg_closed_won`, open the reopen modal instead of firing the
  mutation. This makes dragging out of the «فوز بالصفقة» column work for the
  first time.

### 4.7 Cache and refresh

No new cache work. `useMoveLeadStage.onSettled` already invalidates
`['crm','leads',id]`, which is the lead detail page's query — the header pill
refreshes on settle. The optimistic rewrite in `onMutate` deliberately skips
single-lead queries, so the detail page's pill updates after the round trip
rather than instantly. Accepted: the toast fires immediately and the round trip
is short.

## 5. Audience impact (the 4-audience gate)

| Audience | Effect |
|---|---|
| **Admin** | Full: every stage, attachment picker works, reopen enabled |
| **Employee** | No change — lacks `leads.move_stage`, button never renders |
| **Sales agent** | Button visible; routine stages and «خسارة» work; «تم توقيع العقد» and «فوز بالصفقة» disabled with reasons; reopen unavailable (no `leads.manage`) |
| **Client (portal)** | No change — the portal has no lead surface |

## 6. Testing

`__tests__/crm-stage-options.test.ts` covers `buildStageOptions` for:

- current stage omitted from the returned list
- `stg_closed_won` always disabled
- `stg_contract_signed` disabled without finance permission, enabled with it
- archived lead disables everything
- a custom (`ps_*`) stage is enabled and carries no reason

UI paths are exercised manually in both locales and both themes.

## 7. Out of scope

- Moving a lead from the customer page or the leads list — the ask was the lead
  detail page.
- Lead-scoped finance sub-endpoints that would let an agent attach a contract
  themselves (Gap B's root fix). Explicitly deferred by the owner.
- Localizing seeded stage names — DB data, unchanged.

## 8. Files

**New (3)**
- `lib/crm/stage-options.ts`
- `__tests__/crm-stage-options.test.ts`
- `components/crm/pipeline/stage-picker-sheet.tsx` (generalized from `mobile-stage-sheet.tsx`)

**Modified (6)**
- `components/crm/lead-detail/lead-header.tsx` — the button
- `app/dashboard/crm/leads/[id]/lead-detail-client.tsx` — state, permissions, modal wiring
- `components/crm/pipeline/move-stage-confirm-modal.tsx` — `reopen` mode
- `components/crm/pipeline/pipeline-card.tsx` — call site of the generalized sheet
- `app/dashboard/crm/pipeline/pipeline-client.tsx` — reopen branch on drag
- `hooks/useLeads.ts` — forward `reopen_reason`

**Messages**
- `messages/ar/crm.json` + `messages/en/crm.json` — `crm.lead.moveStage.*` and the
  `reopen` keys under `crm.pipeline.moveStageConfirmModal.*`
- `scripts/i18n-check.ts` — no manifest change needed (all touched paths are
  already migrated)
