# Move a Lead Between Stages From Its Own Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a «نقل لمرحلة» button to the lead detail page that opens a stage picker, and close the reopen dead-end that currently makes a lead at «فوز بالصفقة» immovable everywhere in the product.

**Architecture:** No backend work. The `POST /api/crm/leads/[id]/move-stage` route, the `useMoveLeadStage` mutation and the `useMoveLeadStageWithToasts` runner already exist and are reused verbatim. The existing mobile-only stage sheet is generalized into a shared `StagePickerSheet` consumed by both the pipeline card and the lead detail page. The per-stage enable/disable decision moves into a pure, unit-tested helper. The existing confirm modal gains a third `reopen` mode, and the hook is fixed to forward the `reopen_reason` field it currently drops.

**Tech Stack:** Next.js 15 App Router, React Query, next-intl, Radix (Sheet/Dialog) via shadcn/ui, Tailwind (RTL logical properties), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-06-lead-stage-move-design.md`

## Global Constraints

- Package manager is **pnpm**, never npm.
- Code in English, UI strings in Arabic + English via next-intl. No hardcoded Arabic in migrated paths — `pnpm i18n:check` gates it.
- RTL only: `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`/`text-end`. Never `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`.
- Dark mode: every `bg-{c}-50` pairs with `dark:bg-{c}-950/30`, `text-{c}-600` with `dark:text-{c}-400`, etc. `text-{c}-500` and `bg-{c}-500/10` need no pair.
- No raw `fetch()` in components — React Query hooks only.
- Message files: ONE top-level namespace per file. Catalogs must never contain JSON arrays.
- `pnpm run check` (tsc + i18n:check) and `pnpm build` MUST pass before push.
- Branch is `integrate-pending-fixes`, which tracks `origin/main` — a bare `git push` deploys production. Do NOT push in this plan; the final task stops at local verification.

---

### Task 1: Pure stage-enablement helper

The decision of which stages are offered, and why one is refused, is business logic. It goes in a pure function so it is testable without mounting React.

**Files:**
- Create: `lib/crm/stage-options.ts`
- Create: `__tests__/crm-stage-options.test.ts`
- Modify: `docs/superpowers/specs/2026-08-06-lead-stage-move-design.md` (§4.3 signature)

**Interfaces:**
- Consumes: `PIPELINE_STAGE_IDS` from `@/lib/constants/statuses`.
- Produces: `buildStageOptions(input: BuildStageOptionsInput): StageOption[]`, plus the exported types `StageOption` (`{ id: string; disabled: boolean; reason: StageDisabledReason | null }`) and `StageDisabledReason` (`'closedWonViaApproval' | 'contractNeedsAdmin' | 'leadArchived'`). Tasks 2, 4 and 5 import all three.

- [ ] **Step 1: Write the failing test**

Create `__tests__/crm-stage-options.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildStageOptions } from '@/lib/crm/stage-options';

const STAGES = [
  { id: 'stg_reshuffle' },
  { id: 'stg_new_inquiry' },
  { id: 'stg_discovery_call' },
  { id: 'stg_proposal_sent' },
  { id: 'stg_negotiation' },
  { id: 'stg_contract_signed' },
  { id: 'stg_closed_won' },
  { id: 'stg_closed_lost' },
];

const base = {
  stages: STAGES,
  currentStageId: 'stg_new_inquiry',
  canAttachFinance: true,
  isArchived: false,
};

function byId(opts: ReturnType<typeof buildStageOptions>, id: string) {
  const found = opts.find((o) => o.id === id);
  if (!found) throw new Error(`option ${id} missing`);
  return found;
}

describe('buildStageOptions', () => {
  it('omits the stage the lead is already in', () => {
    const opts = buildStageOptions(base);
    expect(opts.some((o) => o.id === 'stg_new_inquiry')).toBe(false);
    expect(opts).toHaveLength(STAGES.length - 1);
  });

  it('always refuses closed_won — it belongs to the approval flow', () => {
    const opts = buildStageOptions(base);
    expect(byId(opts, 'stg_closed_won')).toEqual({
      id: 'stg_closed_won',
      disabled: true,
      reason: 'closedWonViaApproval',
    });
  });

  it('refuses contract_signed without finance permission', () => {
    const opts = buildStageOptions({ ...base, canAttachFinance: false });
    expect(byId(opts, 'stg_contract_signed')).toEqual({
      id: 'stg_contract_signed',
      disabled: true,
      reason: 'contractNeedsAdmin',
    });
  });

  it('allows contract_signed with finance permission', () => {
    const opts = buildStageOptions(base);
    expect(byId(opts, 'stg_contract_signed').disabled).toBe(false);
  });

  it('allows the routine stages', () => {
    const opts = buildStageOptions(base);
    for (const id of ['stg_reshuffle', 'stg_discovery_call', 'stg_proposal_sent', 'stg_negotiation', 'stg_closed_lost']) {
      expect(byId(opts, id)).toEqual({ id, disabled: false, reason: null });
    }
  });

  it('disables every stage when the lead is archived', () => {
    const opts = buildStageOptions({ ...base, isArchived: true });
    expect(opts.every((o) => o.disabled && o.reason === 'leadArchived')).toBe(true);
  });

  it('treats a custom ps_* stage as routine', () => {
    const opts = buildStageOptions({
      ...base,
      stages: [...STAGES, { id: 'ps_custom_demo' }],
    });
    expect(byId(opts, 'ps_custom_demo')).toEqual({
      id: 'ps_custom_demo',
      disabled: false,
      reason: null,
    });
  });

  it('returns every stage when the lead has no stage yet', () => {
    const opts = buildStageOptions({ ...base, currentStageId: null });
    expect(opts).toHaveLength(STAGES.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test crm-stage-options`
Expected: FAIL — `Failed to resolve import "@/lib/crm/stage-options"`.

- [ ] **Step 3: Write the implementation**

Create `lib/crm/stage-options.ts`:

```ts
import { PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';

/**
 * Why a stage is not offered. Each value maps to a message key under
 * `crm.pipeline.stagePicker.disabledReasons.*`.
 */
export type StageDisabledReason =
  | 'closedWonViaApproval'
  | 'contractNeedsAdmin'
  | 'leadArchived';

export interface StageOption {
  id: string;
  disabled: boolean;
  reason: StageDisabledReason | null;
}

export interface BuildStageOptionsInput {
  /** Stage rows from usePipelineStages(). Only `id` is read. */
  stages: Array<{ id: string }>;
  /** The lead's current stage — omitted from the result. */
  currentStageId: string | null;
  /** finance.view OR invoices.view — the attachment picker needs one of them. */
  canAttachFinance: boolean;
  /** An archived lead is out of the pipeline; nothing is offered. */
  isArchived?: boolean;
}

/**
 * Decide which stages a lead can be moved to, and why one is refused.
 *
 * Mirrors the server's validation matrix in
 * app/api/crm/leads/[id]/move-stage/route.ts so the UI never offers a move
 * the API will reject:
 *
 *   - stg_closed_won is ALWAYS rejected by the route — the approval flow
 *     (/dashboard/crm/approvals) owns that transition.
 *   - stg_contract_signed requires an attachment, and the picker that supplies
 *     it reads /api/finance/contracts + /api/invoices. A sales_agent has
 *     neither finance.view nor invoices.view (lib/auth/rbac.ts ROLE_EXTRAS),
 *     so offering the stage would only produce a load error.
 *
 * Reopening (moving a lead OUT of stg_closed_won) is gated at the button, not
 * here: an admin reopening a deal may send it to any offered stage.
 */
export function buildStageOptions({
  stages,
  currentStageId,
  canAttachFinance,
  isArchived = false,
}: BuildStageOptionsInput): StageOption[] {
  return stages
    .filter((stage) => stage.id !== currentStageId)
    .map<StageOption>((stage) => {
      if (isArchived) {
        return { id: stage.id, disabled: true, reason: 'leadArchived' };
      }
      if (stage.id === PIPELINE_STAGE_IDS.CLOSED_WON) {
        return { id: stage.id, disabled: true, reason: 'closedWonViaApproval' };
      }
      if (stage.id === PIPELINE_STAGE_IDS.CONTRACT_SIGNED && !canAttachFinance) {
        return { id: stage.id, disabled: true, reason: 'contractNeedsAdmin' };
      }
      return { id: stage.id, disabled: false, reason: null };
    });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test crm-stage-options`
Expected: PASS — 8 tests.

- [ ] **Step 5: Correct the spec's helper signature**

The spec's §4.3 lists a `canReopen` parameter. It is not used: reopening gates the button, not the individual options. In `docs/superpowers/specs/2026-08-06-lead-stage-move-design.md`, delete this line from the code block in §4.3:

```
  canReopen,         // leads.manage
```

- [ ] **Step 6: Commit**

```bash
git add lib/crm/stage-options.ts __tests__/crm-stage-options.test.ts docs/superpowers/specs/2026-08-06-lead-stage-move-design.md
git commit -m "feat(crm): decide offerable stages in one tested place

The UI offered every stage and let the server reject the impossible ones,
which is how a sales agent reaches the contract-signed attachment picker
and meets a load error for two finance endpoints they cannot read.

Mirrors the route's validation matrix so a refused stage explains itself
before it is tapped."
```

---

### Task 2: Share the stage sheet between the pipeline and the lead page

`MobileStageSheet` already renders exactly the list the lead page needs. Generalize it rather than writing a second list: it takes a pipeline `Lead` object today but only reads two fields off it.

**Files:**
- Create: `components/crm/pipeline/stage-picker-sheet.tsx`
- Delete: `components/crm/pipeline/mobile-stage-sheet.tsx`
- Modify: `components/crm/pipeline/pipeline-card.tsx` (import + call site, around lines 55 and 403-413)
- Modify: `messages/ar/crm.json` (rename the `mobileStageSheet` block, add `disabledReasons`)
- Modify: `messages/en/crm.json` (same)

**Interfaces:**
- Consumes: `StageOption`, `StageDisabledReason` from Task 1; `PipelineStage` from `@/hooks/usePipelineStages`; `ACCENT_DOT` from `@/lib/constants/pipeline-colors`.
- Produces: default export `StagePickerSheet` with props `{ open: boolean; onOpenChange: (open: boolean) => void; leadName: string; stages: PipelineStage[]; options: StageOption[]; onSelectStage: (toStageId: string) => void }`. Task 4 mounts it.

- [ ] **Step 1: Create the shared sheet**

Create `components/crm/pipeline/stage-picker-sheet.tsx`:

```tsx
'use client';

/**
 * StagePickerSheet — the one stage list in the product.
 *
 * Generalized from the pipeline-card-only MobileStageSheet so the lead detail
 * page's «نقل لمرحلة» button and the pipeline card's mobile button render the
 * same rows with the same rules. It takes `leadName` + `options` instead of a
 * pipeline `Lead`, so it has no dependency on the board's data shape.
 *
 * A refused stage renders disabled with its reason underneath rather than
 * vanishing — a sales agent who cannot reach «تم توقيع العقد» should learn why,
 * not wonder where the stage went.
 */

import { useTranslations, useLocale } from 'next-intl';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ACCENT_DOT } from '@/lib/constants/pipeline-colors';
import type { PipelineStage } from '@/hooks/usePipelineStages';
import type { StageOption } from '@/lib/crm/stage-options';

export interface StagePickerSheetProps {
  /** Sheet visibility — controlled by the parent. */
  open: boolean;
  /** Called on ESC, backdrop, X, AND after the user picks a stage. */
  onOpenChange: (open: boolean) => void;
  /** Shown in the sheet description for context. */
  leadName: string;
  /** Stage rows — supplies the display name and colour for each option. */
  stages: PipelineStage[];
  /** Which stages to offer and why one is refused. From buildStageOptions(). */
  options: StageOption[];
  /** Fired with the chosen stage id. The sheet closes itself afterwards. */
  onSelectStage: (toStageId: string) => void;
}

export default function StagePickerSheet({
  open,
  onOpenChange,
  leadName,
  stages,
  options,
  onSelectStage,
}: StagePickerSheetProps) {
  const t = useTranslations('crm.pipeline.stagePicker');
  const locale = useLocale();
  // Stage rows are bilingual DB data (name + name_ar) — pick by locale.
  const stageName = (s: { name: string; name_ar: string }) =>
    locale === 'ar' ? s.name_ar : (s.name || s.name_ar);

  const rows = options
    .map((option) => ({ option, stage: stages.find((s) => s.id === option.id) }))
    .filter((row): row is { option: StageOption; stage: PipelineStage } => !!row.stage);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Override the default `p-6` from sheetVariants with `p-0` so the body
          controls its own padding. Bottom sheet rounds only the TOP corners. */}
      <SheetContent
        side="bottom"
        className="h-auto max-h-[80vh] rounded-t-2xl p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-3">
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>
            {t('description', { name: leadName })}
          </SheetDescription>
        </SheetHeader>

        {rows.length === 0 ? (
          <div className="px-6 pb-6 pt-2 text-center text-sm text-muted-foreground">
            {t('noOtherStages')}
          </div>
        ) : (
          <div className="px-2 pb-4 max-h-[55vh] overflow-y-auto">
            {rows.map(({ option, stage }) => (
              <button
                key={stage.id}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  onSelectStage(stage.id);
                  onOpenChange(false);
                }}
                aria-label={t('moveToAria', { stage: stageName(stage) })}
                className={cn(
                  'w-full px-4 py-3 rounded-lg transition-colors flex items-center gap-3',
                  option.disabled
                    ? 'opacity-60 cursor-not-allowed'
                    : 'hover:bg-muted/60',
                )}
              >
                <span
                  className={cn(
                    'size-2.5 rounded-full shrink-0',
                    ACCENT_DOT[stage.color] ?? 'bg-current',
                  )}
                  aria-hidden
                />
                <span className="flex-1 min-w-0 text-start">
                  <span className="block font-medium text-sm">{stageName(stage)}</span>
                  {option.reason && (
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {t(`disabledReasons.${option.reason}`)}
                    </span>
                  )}
                </span>
                {/* ChevronLeft = visual "forward" arrow in RTL (points toward
                    the row's end, since text flows right-to-left). Phase 15.1
                    §7 lock: LTR-semantic icon name + rtl:rotate-180 utility so
                    the icon mirrors correctly if this sheet renders LTR (EN
                    locale) — SVGs don't auto-mirror on their own. */}
                {!option.disabled && (
                  <ChevronLeft
                    className="size-4 text-muted-foreground shrink-0 rtl:rotate-180"
                    aria-hidden
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Point the pipeline card at the shared sheet**

In `components/crm/pipeline/pipeline-card.tsx`, replace the import on line 55:

```tsx
import MobileStageSheet from './mobile-stage-sheet';
```

with:

```tsx
import StagePickerSheet from './stage-picker-sheet';
import { buildStageOptions } from '@/lib/crm/stage-options';
import { useAnyPermission } from '@/hooks/usePermission';
```

- [ ] **Step 3: Compute options in the card and pass them down**

In the same file, inside the `PipelineCard` component body, add below the existing `showMobileStageButton` line (~321):

```tsx
  // The board's mobile picker now refuses impossible stages up front instead
  // of letting the tap round-trip and come back as an error toast.
  const canAttachFinance = useAnyPermission(['finance.view', 'invoices.view']);
  const stageOptions = useMemo(
    () =>
      buildStageOptions({
        stages: stages ?? [],
        currentStageId: lead.stage_id ?? null,
        canAttachFinance,
      }),
    [stages, lead.stage_id, canAttachFinance],
  );
```

Ensure `useMemo` is in the `react` import at the top of the file; add it if absent.

Then replace the sheet block at ~403-413:

```tsx
      {showMobileStageButton && stages && onChangeStage && (
        <StagePickerSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          leadName={lead.name}
          stages={stages}
          options={stageOptions}
          onSelectStage={(toStageId) =>
            onChangeStage(lead.id, toStageId, lead.stage_id ?? null)
          }
        />
      )}
```

- [ ] **Step 4: Delete the old component**

```bash
git rm components/crm/pipeline/mobile-stage-sheet.tsx
```

- [ ] **Step 5: Rename and extend the Arabic messages**

In `messages/ar/crm.json`, replace the `"mobileStageSheet"` block (currently at ~line 213) with:

```json
      "stagePicker": {
        "title": "نقل المرحلة",
        "description": "لا يصل العميل إشعارًا — هذه عملية داخلية. سيتم نقل \"{name}\" إلى مرحلة جديدة.",
        "noOtherStages": "لا توجد مراحل أخرى متاحة",
        "moveToAria": "نقل إلى {stage}",
        "disabledReasons": {
          "closedWonViaApproval": "يتم من صفحة الاعتمادات بعد توقيع العقد",
          "contractNeedsAdmin": "المدير هو من يرفق العقد",
          "leadArchived": "الصفقة مؤرشفة"
        }
      },
```

- [ ] **Step 6: Rename and extend the English messages**

In `messages/en/crm.json`, find the `"mobileStageSheet"` block under `crm.pipeline` and replace it with:

```json
      "stagePicker": {
        "title": "Move stage",
        "description": "The client is not notified — this is an internal action. \"{name}\" will move to a new stage.",
        "noOtherStages": "No other stages available",
        "moveToAria": "Move to {stage}",
        "disabledReasons": {
          "closedWonViaApproval": "Done from the approvals page after the contract is signed",
          "contractNeedsAdmin": "An admin attaches the contract",
          "leadArchived": "This deal is archived"
        }
      },
```

- [ ] **Step 7: Verify the rename left nothing behind**

Run: `grep -rn "mobileStageSheet\|mobile-stage-sheet\|MobileStageSheet" --include="*.ts" --include="*.tsx" --include="*.json" .`
Expected: no matches.

- [ ] **Step 8: Type-check**

Run: `pnpm run check`
Expected: zero errors.

- [ ] **Step 9: Commit**

```bash
git add -A components/crm/pipeline messages/ar/crm.json messages/en/crm.json
git commit -m "refactor(crm): one stage picker for the board and the lead page

The sheet took a pipeline Lead but read two fields off it, which is the only
reason the lead detail page could not reuse it. It now takes a name and a
list of options, so both surfaces render the same rows under the same rules.

The board's mobile picker also stops offering stages the server will refuse."
```

---

### Task 3: Reopen mode, and the field the hook was dropping

`MoveStageInput` declares `reopen_reason`, but `RunMoveStageExtras` has no such field and `runMoveStage` never spreads it — so no caller can ever satisfy the route's reopen guard. This task supplies both the UI to collect the reason and the wiring to send it.

**Files:**
- Modify: `hooks/useLeads.ts` (`RunMoveStageExtras` ~line 226, `runMoveStage` body ~line 274-279)
- Modify: `components/crm/pipeline/move-stage-confirm-modal.tsx`
- Modify: `messages/ar/crm.json` + `messages/en/crm.json` (`moveStageConfirmModal` block)

**Interfaces:**
- Consumes: nothing new.
- Produces: `MoveStageConfirmMode = 'contract_signed' | 'closed_lost' | 'reopen'` replacing the removed `MoveStageConfirmTargetId`; `MoveStageConfirmPayload` gains the `{ mode: 'reopen'; reopen_reason: string }` member; the modal's props become `{ open, onOpenChange, lead, mode, submitting?, onConfirm }`. Tasks 4 and 5 consume all of these.

- [ ] **Step 1: Forward the dropped field**

In `hooks/useLeads.ts`, extend `RunMoveStageExtras` (~line 226):

```ts
export interface RunMoveStageExtras {
  attachment?: { type: 'contract' | 'invoice'; id: string };
  lost_reason?: string;
  /**
   * Required by the route when the lead is currently at stg_closed_won.
   * MoveStageInput has always declared it; this wrapper used to drop it,
   * which made a won deal immovable in every surface.
   */
  reopen_reason?: string;
}
```

and add the spread inside `runMoveStage`'s `mutateAsync` call (~line 274), after the `lost_reason` line:

```ts
          ...(extras?.reopen_reason ? { reopen_reason: extras.reopen_reason } : {}),
```

- [ ] **Step 2: Switch the modal from a target-id union to an explicit mode**

In `components/crm/pipeline/move-stage-confirm-modal.tsx`, replace the type block at lines 106-124:

```tsx
export type MoveStageConfirmPayload =
  | { mode: 'contract_signed'; attachment: AttachmentSelection }
  | { mode: 'closed_lost'; lost_reason: string }
  | { mode: 'reopen'; reopen_reason: string };

/**
 * Which variant renders. Replaces the old target-stage union: a reopen can
 * target ANY stage, so the variant can no longer be derived from the target.
 */
export type MoveStageConfirmMode = 'contract_signed' | 'closed_lost' | 'reopen';

interface MoveStageConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The lead being moved — name shown in title; client_id used to narrow lists. */
  lead: PyraSalesLead | null;
  /** Decides which modal variant renders. null while closed/transitioning. */
  mode: MoveStageConfirmMode | null;
  /** True while the parent's mutation is in flight (after confirm). */
  submitting?: boolean;
  onConfirm: (payload: MoveStageConfirmPayload) => void;
}
```

- [ ] **Step 3: Rework the component body for three modes**

In the same file, change the component signature (line ~126-133) from `targetStageId` to `mode`:

```tsx
export function MoveStageConfirmModal({
  open,
  onOpenChange,
  lead,
  mode,
  submitting,
  onConfirm,
}: MoveStageConfirmModalProps) {
```

Replace the reset effect and the two mode booleans (lines ~155-164) with:

```tsx
  // Reset everything whenever the modal opens or the mode changes
  // — prevents state from one variant leaking into the next.
  useEffect(() => {
    if (open) {
      setTab('contract');
      setSelected(null);
      setReason('');
    }
  }, [open, mode]);

  const isContractSigned = mode === 'contract_signed';
  const isClosedLost = mode === 'closed_lost';
  const isReopen = mode === 'reopen';
```

`stg_closed_lost` and `reopen` both collect free text with the same 5-character floor, so they share the `reason` state. Replace the confirm gates and handler (lines ~188-199) with:

```tsx
  // ── Confirm gates
  const trimmedReason = reason.trim();
  const canConfirmAttachment = !!selected && !submitting;
  const canConfirmText = trimmedReason.length >= MIN_LOST_REASON && !submitting;

  function handleConfirm() {
    if (isContractSigned && selected) {
      onConfirm({ mode: 'contract_signed', attachment: selected });
    } else if (isClosedLost && trimmedReason.length >= MIN_LOST_REASON) {
      onConfirm({ mode: 'closed_lost', lost_reason: trimmedReason });
    } else if (isReopen && trimmedReason.length >= MIN_LOST_REASON) {
      onConfirm({ mode: 'reopen', reopen_reason: trimmedReason });
    }
  }
```

Replace the header config (lines ~201-211) with:

```tsx
  // Header config differs per variant.
  const title = isContractSigned
    ? t('titleContractSigned')
    : isReopen
      ? t('titleReopen')
      : t('titleClosedLost');
  const description = isContractSigned
    ? t('descriptionContractSigned')
    : isReopen
      ? t('descriptionReopen')
      : t('descriptionClosedLost');
  const TitleIcon = isContractSigned
    ? FileSignature
    : isReopen
      ? RotateCcw
      : XCircle;
  const titleIconColor = isContractSigned
    ? 'text-orange-500'
    : isReopen
      ? 'text-amber-500'
      : 'text-red-500';
```

Add `RotateCcw` to the `lucide-react` import at line ~48-50.

Update the `DialogContent` className (line ~216-219) so reopen uses the shorter height:

```tsx
        className={cn(
          'sm:max-w-2xl flex flex-col',
          isContractSigned ? 'max-h-[85vh]' : 'max-h-[80vh]',
        )}
```

(unchanged — `isContractSigned ? … : …` already covers reopen.)

- [ ] **Step 4: Add the reopen body and footer button**

In the same file, immediately after the `{isClosedLost && ( … )}` block (ends ~line 312), insert:

```tsx
        {isReopen && (
          <div className="flex-1 min-h-0 overflow-y-auto py-2 space-y-3">
            <div className="rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/30 p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-5">
                {t('reopenWarning')}
              </p>
            </div>
            <div className="space-y-1">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder={t('reopenPlaceholder')}
                required
                minLength={MIN_LOST_REASON}
                className="resize-none"
              />
              {trimmedReason.length < MIN_LOST_REASON && (
                <p className="text-xs text-muted-foreground">
                  {t('reopenMinChars', { count: trimmedReason.length, min: MIN_LOST_REASON })}
                </p>
              )}
            </div>
          </div>
        )}
```

In the `DialogFooter`, change the closed-lost button's gate from `canConfirmLost` to `canConfirmText`, and add the reopen button after it:

```tsx
          {isClosedLost && (
            <Button
              type="button"
              variant="destructive"
              disabled={!canConfirmText}
              onClick={handleConfirm}
            >
              {submitting ? <Loader2 className="size-4 animate-spin me-1.5" /> : null}
              {t('confirmClosedLost')}
            </Button>
          )}
          {isReopen && (
            <Button
              type="button"
              disabled={!canConfirmText}
              onClick={handleConfirm}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {submitting ? <Loader2 className="size-4 animate-spin me-1.5" /> : null}
              {t('confirmReopen')}
            </Button>
          )}
```

- [ ] **Step 5: Add the Arabic messages**

In `messages/ar/crm.json`, inside `crm.pipeline.moveStageConfirmModal`, add after `"titleClosedLost"`:

```json
        "titleReopen": "إعادة فتح صفقة مغلقة",
```

after `"descriptionClosedLost"`:

```json
        "descriptionReopen": "اكتب سبب إعادة الفتح — سيُسجَّل في تاريخ الصفقة ويصل إشعار للمسؤول عنها.",
        "reopenWarning": "إعادة الفتح ستُخرج الصفقة من قائمة العملاء وتُصفِّر نسبة الفوز.",
        "reopenPlaceholder": "لماذا يُعاد فتح الصفقة؟",
        "reopenMinChars": "{count} / {min} حرف على الأقل",
```

and after `"confirmClosedLost"`:

```json
        "confirmReopen": "إعادة الفتح",
```

- [ ] **Step 6: Add the English messages**

In `messages/en/crm.json`, inside the matching `moveStageConfirmModal` block, add:

```json
        "titleReopen": "Reopen a closed deal",
        "descriptionReopen": "Give a reason — it is recorded in the deal's history and the owner is notified.",
        "reopenWarning": "Reopening removes the deal from the customers list and resets its win probability.",
        "reopenPlaceholder": "Why is this deal being reopened?",
        "reopenMinChars": "{count} / {min} characters minimum",
        "confirmReopen": "Reopen",
```

- [ ] **Step 7: Confirm the type change is caught**

Run: `pnpm run check`
Expected: FAIL — `app/dashboard/crm/pipeline/pipeline-client.tsx` still imports `MoveStageConfirmTargetId` and passes `targetStageId`. Task 5 fixes it; do not fix it here.

- [ ] **Step 8: Commit**

```bash
git add hooks/useLeads.ts components/crm/pipeline/move-stage-confirm-modal.tsx messages/ar/crm.json messages/en/crm.json
git commit -m "feat(crm): collect a reopen reason, and actually send it

MoveStageInput has always declared reopen_reason, but the toast wrapper only
forwarded attachment and lost_reason. The route requires the field to move a
lead out of stg_closed_won, so a won deal was immovable everywhere — the
board's drag returned 422 and no screen could satisfy it.

The confirm modal gains a third mode and now switches on an explicit mode
rather than the target stage, because a reopen can target any stage."
```

---

### Task 4: The button on the lead detail page

**Files:**
- Modify: `components/crm/lead-detail/lead-header.tsx`
- Modify: `app/dashboard/crm/leads/[id]/lead-detail-client.tsx`
- Modify: `messages/ar/crm.json` + `messages/en/crm.json` (`crm.lead.header` block)

**Interfaces:**
- Consumes: `buildStageOptions`/`StageOption` (Task 1), `StagePickerSheet` (Task 2), `MoveStageConfirmModal`/`MoveStageConfirmMode`/`MoveStageConfirmPayload` (Task 3), `useMoveLeadStageWithToasts` (existing).
- Produces: three new `LeadHeader` props — `onMoveStage?: () => void`, `canMoveStage?: boolean`, `moveStageDisabledReason?: string | null`.

- [ ] **Step 1: Add the header props**

In `components/crm/lead-detail/lead-header.tsx`, add to `LeadHeaderProps` (after the `onScheduleFollowUp` entry, ~line 44):

```tsx
  /** Open the stage picker. Button hidden when undefined. */
  onMoveStage?: () => void;
  /** Whether current user has leads.move_stage. Gates the button's visibility. */
  canMoveStage?: boolean;
  /** When set, the button renders disabled and this text explains why. */
  moveStageDisabledReason?: string | null;
```

Add them to the destructured parameter list (~line 81-95), after `onScheduleFollowUp`:

```tsx
  onMoveStage,
  canMoveStage,
  moveStageDisabledReason,
```

- [ ] **Step 2: Add `ArrowRightLeft` to the icon import**

In the same file, add `ArrowRightLeft` to the `lucide-react` import block at lines 22-25.

- [ ] **Step 3: Render the button**

In the quick-actions row, insert between the follow-up `<Button>` (ends ~line 242) and the `{canCreateQuote && …}` block:

```tsx
            {/* Move stage — the deal-advancing action, grouped with the quote
                CTA rather than the contact actions. Wrapped in a span so the
                explanation still surfaces on hover when the button is
                disabled (disabled elements swallow title tooltips). */}
            {canMoveStage && onMoveStage && (
              <span title={moveStageDisabledReason ?? undefined} className="inline-flex">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onMoveStage}
                  disabled={!!moveStageDisabledReason}
                  className="max-md:bg-white/10 max-md:text-white max-md:border-white/20 max-md:hover:bg-white/20"
                >
                  <ArrowRightLeft className="size-4 me-1.5" /> {t('moveStage')}
                </Button>
              </span>
            )}
```

- [ ] **Step 4: Add the header messages**

In `messages/ar/crm.json`, inside `crm.lead.header`, add after `"followUp"`:

```json
        "moveStage": "نقل لمرحلة",
        "moveStageArchivedHint": "الصفقة مؤرشفة — ألغِ الأرشفة أولاً",
        "moveStageClosedWonHint": "الصفقة مغلقة — المدير وحده يمكنه إعادة فتحها",
```

In `messages/en/crm.json`, inside the matching block:

```json
        "moveStage": "Move stage",
        "moveStageArchivedHint": "This deal is archived — unarchive it first",
        "moveStageClosedWonHint": "This deal is closed — only an admin can reopen it",
```

- [ ] **Step 5: Wire the page**

In `app/dashboard/crm/leads/[id]/lead-detail-client.tsx`, add to the imports:

```tsx
import { useLead, useLinkClient, useUpdateLead, useArchiveLead, useMoveLeadStageWithToasts } from '@/hooks/useLeads';
import { usePermission, useAnyPermission } from '@/hooks/usePermission';
import { buildStageOptions } from '@/lib/crm/stage-options';
import { PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';
import StagePickerSheet from '@/components/crm/pipeline/stage-picker-sheet';
import {
  MoveStageConfirmModal,
  type MoveStageConfirmMode,
  type MoveStageConfirmPayload,
} from '@/components/crm/pipeline/move-stage-confirm-modal';
```

(the first two lines replace the existing `useLead…` and `usePermission` imports at lines 32-33).

- [ ] **Step 6: Add the state and derived values**

In the same file, after the `useLeadActivities` block (~line 130, before `handleArchiveConfirm`), add:

```tsx
  // ── Stage move. The API (POST /api/crm/leads/[id]/move-stage) and the
  // toast-wrapped runner are shared verbatim with the pipeline board.
  const canMoveStage = usePermission('leads.move_stage');
  const canAttachFinance = useAnyPermission(['finance.view', 'invoices.view']);
  const canReopen = usePermission('leads.manage');
  const { moveStage, runMoveStage } = useMoveLeadStageWithToasts();
  const [stagePickerOpen, setStagePickerOpen] = useState(false);
  const [stageConfirm, setStageConfirm] = useState<{
    open: boolean;
    mode: MoveStageConfirmMode | null;
    targetStageId: string | null;
  }>({ open: false, mode: null, targetStageId: null });

  const currentStageId = data?.lead.stage_id ?? null;
  const isClosedWon = currentStageId === PIPELINE_STAGE_IDS.CLOSED_WON;
  const isArchived = !!data?.lead.archived_at;

  const stageOptions = useMemo(
    () =>
      buildStageOptions({
        stages: stages ?? [],
        currentStageId,
        canAttachFinance,
        isArchived,
      }),
    [stages, currentStageId, canAttachFinance, isArchived],
  );

  // Reopening is the only path out of stg_closed_won and it needs leads.manage;
  // an archived lead is out of the pipeline entirely.
  const moveStageDisabledReason = isArchived
    ? t('header.moveStageArchivedHint')
    : isClosedWon && !canReopen
      ? t('header.moveStageClosedWonHint')
      : null;

  const handleSelectStage = useCallback(
    (toStageId: string) => {
      if (!data) return;
      // A lead sitting at closed_won needs a reopen reason no matter where it
      // is headed — the route rejects the move without one.
      if (isClosedWon) {
        setStageConfirm({ open: true, mode: 'reopen', targetStageId: toStageId });
        return;
      }
      if (toStageId === PIPELINE_STAGE_IDS.CLOSED_LOST) {
        setStageConfirm({ open: true, mode: 'closed_lost', targetStageId: toStageId });
        return;
      }
      if (toStageId === PIPELINE_STAGE_IDS.CONTRACT_SIGNED) {
        setStageConfirm({ open: true, mode: 'contract_signed', targetStageId: toStageId });
        return;
      }
      void runMoveStage(data.lead.id, toStageId, currentStageId);
    },
    [data, isClosedWon, currentStageId, runMoveStage],
  );

  const handleStageConfirm = useCallback(
    async (payload: MoveStageConfirmPayload) => {
      const target = stageConfirm.targetStageId;
      if (!data || !target) return;
      setStageConfirm({ open: false, mode: null, targetStageId: null });
      const extras =
        payload.mode === 'contract_signed'
          ? { attachment: payload.attachment }
          : payload.mode === 'closed_lost'
            ? { lost_reason: payload.lost_reason }
            : { reopen_reason: payload.reopen_reason };
      await runMoveStage(data.lead.id, target, currentStageId, extras);
    },
    [data, stageConfirm.targetStageId, currentStageId, runMoveStage],
  );
```

- [ ] **Step 7: Pass the props and mount the sheet**

In the same file, add to the `<LeadHeader>` call (after `onScheduleFollowUp`, ~line 206):

```tsx
        onMoveStage={() => setStagePickerOpen(true)}
        canMoveStage={canMoveStage}
        moveStageDisabledReason={moveStageDisabledReason}
```

And immediately after the `<FollowUpModal … />` line (~line 239), add:

```tsx
      <StagePickerSheet
        open={stagePickerOpen}
        onOpenChange={setStagePickerOpen}
        leadName={lead.name}
        stages={stages ?? []}
        options={stageOptions}
        onSelectStage={handleSelectStage}
      />
      <MoveStageConfirmModal
        open={stageConfirm.open}
        onOpenChange={(o) =>
          setStageConfirm((s) => (o ? s : { open: false, mode: null, targetStageId: null }))
        }
        lead={lead}
        mode={stageConfirm.mode}
        submitting={moveStage.isPending}
        onConfirm={handleStageConfirm}
      />
```

- [ ] **Step 8: Type-check**

Run: `pnpm run check`
Expected: still one failure, in `pipeline-client.tsx` only (Task 5). No errors in `lead-detail-client.tsx` or `lead-header.tsx`.

- [ ] **Step 9: Commit**

```bash
git add components/crm/lead-detail/lead-header.tsx app/dashboard/crm/leads/[id]/lead-detail-client.tsx messages/ar/crm.json messages/en/crm.json
git commit -m "feat(crm): move a lead between stages from its own page

Working a lead meant leaving the page to record the outcome: the stage was
read-only here and the only way to change it was dragging the card back on
the pipeline board.

The button sits with the quote CTA rather than the contact actions, and
explains itself when it cannot act — archived, or closed and awaiting an
admin to reopen it."
```

---

### Task 5: Make the board's closed-won column escapable

The reopen modal exists now, so the drag that has always returned 422 can finally be satisfied. This also repairs the type break Task 3 introduced.

**Files:**
- Modify: `app/dashboard/crm/pipeline/pipeline-client.tsx`
- Modify: `messages/ar/crm.json` + `messages/en/crm.json` (`crm.pipeline.moveToasts`)

**Interfaces:**
- Consumes: `MoveStageConfirmMode`, `MoveStageConfirmPayload` (Task 3).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Update the imports**

In `app/dashboard/crm/pipeline/pipeline-client.tsx`, replace the modal import (lines ~51-55):

```tsx
import {
  MoveStageConfirmModal,
  type MoveStageConfirmMode,
  type MoveStageConfirmPayload,
} from '@/components/crm/pipeline/move-stage-confirm-modal';
```

- [ ] **Step 2: Add the reopen permission**

After the `canBulk` line (~line 104), add:

```tsx
  // Only leads.manage can reopen a won deal — the route enforces the same gate.
  const canReopen = usePermission('leads.manage');
```

- [ ] **Step 3: Reshape the modal state**

Replace the `confirmModal` state block (lines ~154-158) with:

```tsx
  // Shared "needs-extra-data" modal state. Set when a card is dropped on
  // stg_contract_signed (needs attachment) or stg_closed_lost (needs reason),
  // or when it is dragged OUT of stg_closed_won (needs a reopen reason).
  // The lead reference is the source-of-truth for the modal title + client_id
  // filtering; mode picks the variant. Mutation fires only on confirm.
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    lead: PyraSalesLead | null;
    mode: MoveStageConfirmMode | null;
    targetStageId: string | null;
  }>({ open: false, lead: null, mode: null, targetStageId: null });
```

- [ ] **Step 4: Add the reopen branch to the drop handler**

Replace `handleDropChangeStage` (lines ~269-301) with:

```tsx
  const handleDropChangeStage = useCallback(
    (leadId: string, toStageId: string, fromStageId: string | null) => {
      // (1) closed_won client-side guard — never round-trip to the server.
      if (toStageId === PIPELINE_STAGE_IDS.CLOSED_WON) {
        toast.error(t('closedWonGuard'), { duration: 6000 });
        return;
      }

      const lead = leads?.find((l) => l.id === leadId);

      // (2) leaving closed_won is a reopen — the route demands a reason and
      // leads.manage. Without the modal this drag has always 422'd.
      if (fromStageId === PIPELINE_STAGE_IDS.CLOSED_WON) {
        if (!canReopen) {
          toast.error(t('moveToasts.reopenForbidden'), { duration: 6000 });
          return;
        }
        if (lead) {
          setConfirmModal({ open: true, lead, mode: 'reopen', targetStageId: toStageId });
          return;
        }
      }

      // (3) stages that require extra data via the modal.
      const modalMode: MoveStageConfirmMode | null =
        toStageId === PIPELINE_STAGE_IDS.CONTRACT_SIGNED
          ? 'contract_signed'
          : toStageId === PIPELINE_STAGE_IDS.CLOSED_LOST
            ? 'closed_lost'
            : null;
      if (modalMode) {
        if (!lead) {
          // Shouldn't happen — board already validated the lead exists.
          // Fall through to the routine path which will 422.
          void runMoveStage(leadId, toStageId, fromStageId);
          return;
        }
        setConfirmModal({ open: true, lead, mode: modalMode, targetStageId: toStageId });
        return;
      }

      // (4) routine.
      void runMoveStage(leadId, toStageId, fromStageId);
    },
    [leads, runMoveStage, t, canReopen],
  );
```

Note `t` here is `useTranslations('crm.pipeline')`, so `t('moveToasts.reopenForbidden')` resolves against the existing `moveToasts` block.

- [ ] **Step 5: Handle the reopen payload on confirm**

Replace `handleConfirmModal` (lines ~305-330) with:

```tsx
  const handleConfirmModal = useCallback(
    async (payload: MoveStageConfirmPayload) => {
      const { lead, targetStageId } = confirmModal;
      if (!lead || !targetStageId) return;
      // Close the modal optimistically — the toast (success or error)
      // will surface either way; if the mutation fails the user sees the
      // error toast and the source card is still in its original column.
      setConfirmModal({ open: false, lead: null, mode: null, targetStageId: null });
      const extras =
        payload.mode === 'contract_signed'
          ? { attachment: payload.attachment }
          : payload.mode === 'closed_lost'
            ? { lost_reason: payload.lost_reason }
            : { reopen_reason: payload.reopen_reason };
      await runMoveStage(lead.id, targetStageId, lead.stage_id ?? null, extras);
    },
    [confirmModal, runMoveStage],
  );
```

- [ ] **Step 6: Update the modal element**

Replace the `<MoveStageConfirmModal … />` element (lines ~376-387) with:

```tsx
      <MoveStageConfirmModal
        open={confirmModal.open}
        onOpenChange={(o) =>
          setConfirmModal((s) =>
            o ? s : { open: false, lead: null, mode: null, targetStageId: null },
          )
        }
        lead={confirmModal.lead}
        mode={confirmModal.mode}
        submitting={moveStage.isPending}
        onConfirm={handleConfirmModal}
      />
```

- [ ] **Step 7: Add the forbidden-reopen toast messages**

In `messages/ar/crm.json`, inside `crm.pipeline.moveToasts`, add after `"forbidden"`:

```json
        "reopenForbidden": "الصفقة مغلقة — المدير وحده يمكنه إعادة فتحها",
```

In `messages/en/crm.json`, in the matching block:

```json
        "reopenForbidden": "This deal is closed — only an admin can reopen it",
```

- [ ] **Step 8: Type-check**

Run: `pnpm run check`
Expected: PASS — zero errors.

- [ ] **Step 9: Commit**

```bash
git add app/dashboard/crm/pipeline/pipeline-client.tsx messages/ar/crm.json messages/en/crm.json
git commit -m "fix(crm): let a won deal leave the closed-won column

Dragging a card out of «فوز بالصفقة» hit the route's reopen guard and came
back 422 with no way to satisfy it. The board now opens the reopen modal,
and refuses up front when the user lacks leads.manage instead of asking the
server first."
```

---

### Task 6: Full verification

**Files:** none modified unless a check fails.

- [ ] **Step 1: Run the unit tests**

Run: `pnpm test`
Expected: all suites pass, including the 8 new `crm-stage-options` tests. Record the pass/fail counts.

- [ ] **Step 2: Run the type + i18n gate**

Run: `pnpm run check`
Expected: zero errors from both `tsc --noEmit` and `i18n:check`.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: build completes with no type or lint errors.

- [ ] **Step 4: Confirm no stale references survived**

Run: `grep -rn "MoveStageConfirmTargetId\|mobileStageSheet\|MobileStageSheet" --include="*.ts" --include="*.tsx" --include="*.json" .`
Expected: no matches.

- [ ] **Step 5: Manual QA — record the result of each row**

Start the dev server (`pnpm dev`) and walk this matrix on `/dashboard/crm/leads/<id>`:

| # | Setup | Expected |
|---|---|---|
| 1 | Admin, lead at «استفسار جديد» | Button visible; picker lists 7 stages; «فوز بالصفقة» disabled with its reason; «تم توقيع العقد» enabled |
| 2 | Same, pick «مكالمة استكشافية» | Sheet closes, success toast, header pill updates without a page reload |
| 3 | Same, pick «خسارة» | Reason modal opens; confirm disabled under 5 chars; confirming moves the lead and records the reason |
| 4 | Admin, lead at «فوز بالصفقة» | Button enabled; picking any stage opens the reopen modal with the warning; confirming moves it and the lead leaves `/dashboard/crm/customers` |
| 5 | Sales agent, any lead | «تم توقيع العقد» disabled with «المدير هو من يرفق العقد» |
| 6 | Sales agent, lead at «فوز بالصفقة» | Button disabled; hover shows the closed-deal hint |
| 7 | Any user, archived lead | Button disabled with the archived hint |
| 8 | Employee role | Button not rendered at all |
| 9 | Pipeline board, drag a card out of «فوز بالصفقة» as admin | Reopen modal opens (previously an error toast) |
| 10 | Switch locale to EN | Every new string renders in English; the sheet's chevron points the other way |
| 11 | Dark mode | The reopen warning box is legible in both themes |

- [ ] **Step 6: Report**

Report to the user: the test/check/build results verbatim, the manual matrix outcome row by row, and anything that failed. Do NOT claim success for a row that was not actually exercised. Do NOT push — `integrate-pending-fixes` tracks `origin/main`, so pushing deploys production; ask first.

---

## Self-Review

**Spec coverage:** §4.1 entry point → Task 4. §4.2 shared picker → Task 2. §4.3 enablement rules → Task 1. §4.4 selection behaviour → Task 4 Step 6. §4.5 reopen mode → Task 3. §4.6 dropped field + board branch → Tasks 3 and 5. §4.7 cache → no work needed, asserted in Task 6 row 2. §5 audience matrix → Task 6 rows 1, 5, 6, 8. §6 testing → Task 1. §8 file list → matches Tasks 1-5, with `messages/*/crm.json` touched across Tasks 2-5.

**Naming consistency:** `buildStageOptions`, `StageOption`, `StageDisabledReason` (Task 1) are used verbatim in Tasks 2 and 4. `MoveStageConfirmMode` (Task 3) is used verbatim in Tasks 4 and 5. Message key `crm.pipeline.stagePicker.disabledReasons.<reason>` matches the three `StageDisabledReason` values exactly. `canConfirmLost` is renamed to `canConfirmText` in Task 3 Step 3 and both its uses are updated in Step 3 and Step 4.

**Known intermediate breakage:** Task 3 knowingly leaves `pnpm run check` failing on `pipeline-client.tsx` until Task 5 lands. This is called out in Task 3 Step 7 and Task 4 Step 8 so an implementer does not treat it as their own regression.
