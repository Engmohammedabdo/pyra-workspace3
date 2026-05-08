# Phase 7 Chunk 4 — Mobile Stage Picker Handoff

**Purpose:** This document is a self-contained handoff written immediately
before a planned context auto-compact, so the next session can resume
Chunk 4 implementation without losing critical state. **Read this end-to-end
before doing anything else.**

---

## TL;DR — what just happened

- Phase 7 Chunks 1, 2, 3 are **✅ COMPLETE** and deployed to production.
- Chunk 3 (drag-drop kanban) had a long debugging arc resolved by adopting
  the working `components/projects/project-kanban.tsx` pattern with three
  documented deviations (see Architecture Invariants below).
- Chunk 3 verified by Abdou: DragOverlay visible following cursor, drops
  resolve to correct columns even in RTL, all modals fire correctly.
- Reset SQL ran on test lead `sl_Y1wGyzfprQ2E4T7C` (back to
  `stg_new_inquiry`) for Chunk 4 testing.
- This doc was committed before triggering an auto-compact at ~98%
  context utilization to free headroom for Chunks 4 + 5.

## Phase 7 status snapshot

| Chunk | Scope | Status |
|---|---|---|
| 1 | Backend — 5 new notification types, manager-approval workflow, win-probability stage matrix | ✅ complete |
| 2 | Approvals UI dashboard | ✅ complete |
| 3 | Drag-drop kanban with DragOverlay (3.1 → 3.4 + DragOverlay-invisibility series) | ✅ complete |
| **4** | **Mobile stage picker — THIS HANDOFF** | **🟡 in progress** |
| 5 | Acceptance tests + documentation updates | ⏳ pending |

## Latest commits on `origin/main`

```
ed3fb47 fix(crm): pipeline collision detection — use pointerWithin for correct RTL column targeting
6f926d8 fix(crm): pipeline drag-drop — adopt project-kanban pattern with opacity-0 source + null dropAnimation deviations
aed3371 fix(crm): pipeline DragOverlay invisibility — separate overlay component, removes useDraggable conflict in shared component
e263954 fix(crm): pipeline DragOverlay invisibility — unique id for overlay useDraggable to prevent draggableNodes Map overwrite
46d663a chore(crm): pipeline DragOverlay diagnostics — 3 targeted logs (pre-fix)
```

`HEAD` of `origin/main` should match one of these (this doc commit will
push on top, become the next HEAD). Always verify with
`git log origin/main --oneline -3` after push.

---

## Architecture invariants (DO NOT DEVIATE)

These are the non-negotiable patterns Chunk 3 settled on. Chunk 4 must
preserve all of them.

### 3-tier component split in `components/crm/pipeline/pipeline-card.tsx`

```
<PipelineCard>          source wrapper rendered in pipeline columns.
  ├─ plain <div ref={setNodeRef}> with useDraggable + transform style
  └─ <Link> {...attributes} {...listeners}>  ← navigation + drag handle
       └─ <PipelineCardView>  ← pure visual

<PipelineCardView>      pure visual presentational component (NOT exported,
                        internal). NO @dnd-kit hooks. Quick-action buttons
                        (Phone/WhatsApp) live here, suppressed when
                        isDragging.

<PipelineCardOverlay>   thin wrapper around <PipelineCardView isDragging />.
                        NO @dnd-kit hooks. Rendered inside <DragOverlay>.
```

**Why this matters:** only ONE `useDraggable` call per `lead.id` exists at
any time (the source's). The overlay variant has zero hooks, so it cannot
overwrite the source's entry in @dnd-kit's internal `draggableNodes` Map.
That keeps the source's DOM ref valid → `activeNodeRect` measurable →
`PositionedOverlay` actually renders the overlay DOM. Earlier attempts
violated this and the overlay never painted.

### Three deliberate deviations from project-kanban

`components/projects/project-kanban.tsx` is the working production reference.
We mirror its pattern exactly EXCEPT for these three:

1. **Source `opacity-0 pointer-events-none`** during drag (project-kanban
   uses `opacity-30`). HubSpot-style UX — no double-vision of the source.
2. **`dropAnimation={null}`** on `<DragOverlay>` (project-kanban uses
   default snap-back). Avoids "snap → animate back → snap forward" jank
   when paired with our optimistic update flow.
3. **`collisionDetection={pointerWithin}`** (project-kanban uses
   `closestCorners`). Required for RTL — `closestCorners` measures rect
   corners in document space and mis-targets columns under `dir="rtl"`
   because visual order doesn't match DOM order. `pointerWithin` tests
   cursor-vs-rect bounds in viewport coordinates and is direction-agnostic.

If you find yourself questioning any of these, **STOP** and ask Abdou.
They're locked in.

### Other locked patterns

- `useDraggable` is on a plain `<div>` wrapper, NOT on the `<Link>`
- The `<Link>` inside the wrapper receives `{...attributes} {...listeners}`
- Cursor classes (`md:cursor-grab md:active:cursor-grabbing`) live on the
  `<Link>`, NOT on the wrapper div
- The `data-pipeline-overlay="true"` attribute is on
  `<PipelineCardView>`'s root when `isDragging=true` — kept for future
  debugging via `document.querySelector`

---

## Reuse without modification

Chunk 4 **MUST NOT** modify any of these. Use as-is.

### Hooks
- **`hooks/useMoveLeadStage`** — mutation hook for stage changes. Signature
  to be re-confirmed post-compact (see investigation list). Likely returns
  a React Query mutation; takes `{ leadId, toStageId, ...optionalFields }`.

### Components
- **`components/crm/pipeline/move-stage-confirm-modal.tsx`**
  (`MoveStageConfirmModal`) — already handles:
  - `stg_contract_signed` → attachment picker UI
  - `stg_closed_lost` → lost-reason form UI
- The closed_won client-side guard pattern in
  `app/dashboard/crm/pipeline/pipeline-client.tsx`'s drag-drop dispatch —
  fires an instant Arabic toast without server roundtrip when the user
  attempts to move a non-`stg_contract_signed` lead directly to
  `stg_closed_won`.

### Toast copy
Reuse exact strings from existing dispatch logic. Successful stage move:
`"تم نقل العميل المحتمل"` (or whatever pipeline-client.tsx uses — verify
post-compact). Errors should surface via the `ApiError` class
(`hooks/api-helpers.ts`) which exposes server's specific Arabic message
as `Error.message`.

---

## Chunk 4 scope (verbatim from Abdou's directive)

> **Goal:** Bring stage-change UX to mobile (`md:hidden`) where drag-drop
> isn't usable. Touch-friendly button + bottom sheet picker.

1. On each `<PipelineCard>` in mobile mode (`md:hidden`), add a small
   "نقل المرحلة" button (or icon button with arrows) somewhere visible —
   bottom-right of card area, **doesn't conflict with the existing
   Phone/WhatsApp quick-action buttons** which sit at `absolute end-2 bottom-2`.

2. Tap the button → opens a bottom sheet (use existing shadcn Drawer or
   Sheet — pick whichever is already used elsewhere in the workspace)
   listing all stages.
   - Current stage is highlighted/disabled (can't move to same stage).
   - Each stage shown with its color pill + Arabic name.
   - `stg_closed_won` shown but tapping it instantly fires the same toast
     as the desktop client guard.

3. Tapping a stage from the sheet:
   - `stg_contract_signed` → opens `MoveStageConfirmModal` (attachment
     picker, same as desktop)
   - `stg_closed_lost` → opens `MoveStageConfirmModal` (lost reason, same
     as desktop)
   - All other stages → fires move-stage mutation directly (no modal)
   - `stg_closed_won` → instant toast guard, no mutation, no modal

4. After successful move (or modal confirm) → bottom sheet closes,
   optimistic update applies, toast fires.

---

## Approved implementation choices (Abdou approved before compact)

### (B) Button placement
Button lives in `<PipelineCard>` source wrapper, NOT inside
`<PipelineCardView>`.
- `<PipelineCardView>` stays purely visual (preserves the architecture
  invariant from Chunk 3).
- The mobile-only "نقل المرحلة" button is rendered conditionally in
  `PipelineCard`'s wrapper, AFTER the `<Link>` (sibling, not child) — so
  tapping it doesn't navigate to lead detail.
- Gated with `md:hidden` so desktop never sees it.

### (C) Sheet state ownership
Each `<PipelineCard>` owns its own sheet `useState`. No prop drilling
from the board.
- Mobile sheets are mutually exclusive by physical impossibility (one
  finger, one tap).
- Centralization adds wiring with zero UX benefit.

---

## Files plan

### CREATE (1 new file)
**`components/crm/pipeline/mobile-stage-picker-sheet.tsx`**

Pure UI bottom sheet. Does NOT own the mutation. Lifts the chosen stage
up to parent.

Proposed props:
```ts
interface MobileStagePickerSheetProps {
  lead: Lead;
  stages: PipelineStage[];
  currentStageId: string | null;
  onSelectStage: (toStageId: string) => void;  // parent dispatches
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

UI layout:
- Sheet header: "نقل المرحلة" + lead name as subtitle
- Stage list: each stage as a button row with color dot + Arabic name +
  badge showing current stage
- Disabled state on `currentStageId` row (cannot move to same)
- Tapping a row: calls `onSelectStage(stage.id)` then `onOpenChange(false)`
  (or let parent close it after dispatch)
- Cancel button at bottom (or rely on Sheet's swipe-to-dismiss)

Use shadcn Drawer or Sheet — **investigate post-compact** which is
already wired in this workspace. Fall back to Sheet if neither (it's the
shadcn standard for bottom sheets).

### MODIFY (2 files)

**`components/crm/pipeline/pipeline-card.tsx`**
- Inside `PipelineCard` source variant only:
  - `useState` for sheet open/closed
  - After the `<Link>`, render a sibling `<button>` "نقل المرحلة" with:
    - `md:hidden` class so desktop never sees it
    - Position that doesn't conflict with `absolute end-2 bottom-2`
      (where Phone/WhatsApp live). Options: bottom-start (left in RTL)
      OR a discrete chevron button before/after the meta row OR an
      inline button above the quick-actions area. **Investigate
      post-compact** the exact PipelineCard JSX to find the cleanest
      spot.
  - Render `<MobileStagePickerSheet>` controlled by the useState
- Need a way to dispatch the chosen stage. Two options for review
  post-compact:
  - **Option I:** PipelineCard accepts a new optional prop
    `onMoveStageRequest?: (toStageId: string) => void` propagated from
    the board via the existing `<PipelineCard ...>` call sites
  - **Option II:** Hoist a `useStageChangeDispatch(lead)` hook in
    `pipeline-client.tsx` (same logic the desktop drag-drop uses), have
    `PipelineCard` import + call it directly. Avoids prop drilling.
  - **Lean toward Option II** if the dispatch logic is already
    extractable. Confirm by reading `pipeline-client.tsx` post-compact.

**`components/crm/pipeline/pipeline-board.tsx`** (or
**`app/dashboard/crm/pipeline/pipeline-client.tsx`** — TBD post-compact)
- If Option I: add `onDropChangeStage` (renamed → `onChangeStage`) prop
  to `<PipelineCard>` calls in both desktop column rendering AND mobile
  fallback (line ~191 currently uses `<PipelineCard key={lead.id} lead={lead} />`).
- If Option II: extract the dispatcher hook from `pipeline-client.tsx`,
  no board changes needed.

### Files to INVESTIGATE post-compact (read-only, gather facts)

1. `app/dashboard/crm/pipeline/pipeline-client.tsx` — full read.
   Understand how `onDropChangeStage` dispatches:
   - closed_won client-side guard (the toast-without-server-call path)
   - modal triggers (contract_signed / closed_lost)
   - mutation calls
   - error handling via ApiError
   Note: it was too large to include in the previous summary, so read
   fresh. Look for the React Query optimistic update pattern.
2. `hooks/useMoveLeadStage.ts` — confirm exact signature and what
   optional fields it accepts (lost_reason, attachment refs, etc.).
3. `components/crm/pipeline/move-stage-confirm-modal.tsx` — confirm
   prop signature: `lead`, `fromStageId`, `toStageId`, `open`,
   `onOpenChange`?, callback shape?
4. **Check shadcn primitive availability:** run `Glob` on
   `components/ui/drawer.tsx` and `components/ui/sheet.tsx`. Whichever
   exists is the one to use; if both, prefer Drawer (purpose-built for
   bottom sheets on mobile). If neither, install via shadcn CLI (rare
   in this project — most primitives already there).
5. Re-read current `components/crm/pipeline/pipeline-card.tsx` to find
   the exact location for the new button (current quick-actions block
   is at `absolute end-2 bottom-2` inside `<PipelineCardView>`).

---

## Test fixtures

- **Test lead:** `sl_Y1wGyzfprQ2E4T7C` ("تيست انتي")
  - Reset state post-Chunk-3:
    - `stage_id = stg_new_inquiry`
    - `win_probability = 10`
    - `win_probability_overridden = false`
    - `lost_reason = NULL`
    - `is_converted = false`
  - Use this lead for ALL Chunk 4 manual testing (mobile viewport).

## Test account

- Username: `sayed`
- Role: `Sales`
  - DB: `pyra_users.role_id` linked to `pyra_roles` row where `name='Sales'`
  - The `pyra_roles.permissions` (text[]) column was updated mid-Phase-7
    to include all 22 CRM-related permissions for the Sales role.
- Has all permissions needed for Chunk 4 testing.

---

## User & UI context

- **Owner:** Abdou (Pyramedia X)
- **Location:** Dubai, UAE
- **UI language:** Arabic (English for code only)
- **Layout:** RTL (`dir="rtl"` on the pipeline pages)
- **Brand tokens** (use these exactly):
  - Ink: `#0A0A0A`
  - Orange: `#F97316` (Tailwind `orange-500`)
  - Gold: `#D4A017`
- **Font:** Cairo on all CRM UI (workspace standard, NOT Tajawal — the
  original PRD suggested Tajawal but workspace convention won)

---

## Standing policies (Abdou's rules — non-negotiable)

1. **Push to `origin/main` after every commit.** No commit-without-push,
   no speculative deploys. Coolify auto-deploys on push to main.
2. **Propose before pushing** — for non-trivial changes (refactors, new
   components), paste the diff in your response and wait for approval
   BEFORE running `git push`. For surgical follow-ups (single-line
   tweaks, comment fixes), proceeding is fine.
3. **Verify on origin/main after push** — `git log origin/main --oneline -3`
   confirms HEAD matches the commit hash you just pushed.
4. **`pnpm run check` + `pnpm build` MUST both pass** before any push.
5. **Use existing helpers — never reinvent:**
   - `notify()` / `notifyMany()` from `lib/notifications/notify.ts`
   - `logActivity()` from `lib/api/activity.ts`
   - `requireApiPermission` / `getApiAuth` from `lib/api/auth.ts`
   - `apiSuccess` / `apiError` from `lib/api/response.ts`
   - `mutateAPI` / `fetchAPI` / `buildQueryString` from `hooks/api-helpers.ts`
   - `cn()` from `lib/utils/cn`
   - `formatCurrency` / `formatDate` from `lib/utils/format`
   See CLAUDE.md and the user's MEMORY.md for the full catalog.
6. **NEVER raw `fetch()` in components.** React Query is the mandatory
   data layer. Use existing hooks from `hooks/` or inline `useQuery` /
   `useMutation` with the helpers above.
7. **RTL classes:** use `ms-/me-/ps-/pe-/start-/end-/text-start/text-end/border-s/border-e/rounded-s/rounded-e/float-start/float-end`.
   NEVER `ml-/mr-/pl-/pr-/left-/right-/text-left/text-right/border-l/border-r/rounded-l/rounded-r/float-left/float-right`.
   Exception: `left-1/2 -translate-x-1/2` for centering is OK.
8. **Dark mode:** pair every light variant. e.g.,
   `bg-orange-50 dark:bg-orange-950/30`, `text-orange-700 dark:text-orange-300`,
   `border-orange-200 dark:border-orange-800/40`, `bg-white dark:bg-gray-900`.
   Safe (no `dark:` needed): `bg-{c}-500/10`, `text-{c}-500`, CSS vars
   (`bg-muted`, `text-muted-foreground`), shadcn Badge.
9. **Status constants:** import from `lib/constants/statuses.ts`. Never
   hardcode status strings.
10. **DB migrations:** run directly via
    ```bash
    curl -X POST "https://pyraworkspacedb.pyramedia.cloud/pg/query" \
      -H "Content-Type: application/json" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -d '{"query": "..."}'
    ```
    Never ask the user to run SQL manually. Service role key is in
    `.env.local`.
11. **Empty states**: `<EmptyState>` from `@/components/ui/empty-state` —
    never inline.
12. **Loading states**: `<Skeleton>` from `@/components/ui/skeleton` —
    never blank pages. Use `isLoading` from React Query hooks.
13. **Toasts:** `toast` from `sonner` — NEVER `alert()`.
14. **Page size:** keep page files <300 lines. Split large pages into
    sub-components.

---

## First actions in the next session

In this exact order:

1. **Read this handoff doc end-to-end.** Don't skim.
2. **Re-read `CLAUDE.md`** at the project root for project rules + helper
   catalog.
3. **Re-read user memory** at
   `C:\Users\engmo\.claude\projects\C--xampp-htdocs-pyra-workspace-3\memory\MEMORY.md`
   for Abdou's preferences.
4. **Run the post-compact investigation list** (5 items, read-only).
   Don't write any code yet.
5. **Propose the final implementation diff** for Abdou's review. Include:
   - Which dispatch option (I or II) you chose and why
   - The exact button position in PipelineCard with rationale
   - Drawer vs Sheet decision based on what's available
   - Full diff of all files to be created/modified
6. **Wait for approval.** Don't push speculatively.
7. **After approval:** implement → `pnpm run check` → `pnpm build` →
   single commit titled `feat(crm): pipeline mobile stage picker —
   touch-friendly bottom sheet for stage moves` → `git push origin main`
   → `git log origin/main --oneline -3` to verify HEAD.
8. **Ping Abdou** for retest. Test matrix:
   - Mobile viewport (`<md`): button visible, sheet opens on tap
   - Routine moves: stage changes without modal
   - `stg_contract_signed` tap: modal opens with attachment picker
   - `stg_closed_lost` tap: modal opens with lost-reason form
   - `stg_closed_won` tap: instant toast guard fires (no modal, no
     mutation)
   - Same-stage tap: button disabled or no-op
   - Desktop viewport (`md+`): button NOT visible
   - Desktop drag-drop: still works (regression check from Chunk 3)

---

## Known unknowns (will resolve post-compact)

- Exact `useMoveLeadStage` signature (likely
  `{ mutate, mutateAsync, isPending, error }` from React Query, but
  confirm)
- Whether `pipeline-client.tsx` exports a reusable dispatcher or only
  inlines it
- Drawer vs Sheet availability in `components/ui/`
- Cleanest button position in PipelineCard (depends on current JSX)
- Whether the closed_won guard logic should be lifted into its own
  helper (probably yes, to share between drag-drop and tap-to-pick paths
  cleanly)

These are all read-only investigations — they shouldn't take long and
shouldn't burn much context.
