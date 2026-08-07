# Wave C — Task 3 report: `markNotInterested`

## What was implemented

- `lib/crm/mark-not-interested.ts` (new) — the single lead → «غير مهتم»
  transition, meant to be called from a call-outcome writer (a later task,
  `app/api/mobile/call-outcome/route.ts`). Exports:
  - `StageChangeMetadata` (interface) + `buildStageChangeMetadata()` — pure
    function that shapes the timeline-activity metadata object.
  - `MarkNotInterestedResult` (type) + `markNotInterested(supabase, { leadId,
    actor, reason })` — the DB-touching transition itself.
- `__tests__/stage-change-metadata.test.ts` (new) — 4 unit tests locking the
  exact key set / value pass-through / optional-field omission of
  `buildStageChangeMetadata()`.

Both files were written verbatim from the task brief
(`.superpowers/sdd/waveC-task-3-brief.md`) after cross-checking every claim in
it against the actual reference route and the actual `lib/constants/statuses.ts`
/ `lib/crm/pipeline-stages.ts` state (see "Before You Begin" check below) — no
conflicts found, so no deviation from the brief was needed.

Implementation is `markNotInterested`:
1. Fetch the lead (`id, stage_id, win_probability_overridden`). Not found →
   `{ ok: false, reason: 'not_found' }`. DB error → `{ ok: false, reason:
   'db_error' }`.
2. Idempotent short-circuit: if the lead is already in `STAGE_NOT_INTERESTED`,
   return `{ ok: true, changed: false, previousStage }` with **no writes at
   all** — a retried call-outcome POST can never double the timeline.
3. Fetch the stage row's own `name_ar` from `pyra_sales_pipeline_stages`
   (matches production: the row exists, `name_ar = 'غير مهتم'`, 16 leads in it
   today). A missing row is a hard `stage_missing` failure, not a silent
   fallback.
4. `UPDATE pyra_sales_leads`: `stage_id`, `lost_reason: reason`, `updated_at`,
   and `win_probability = 0` **only** when `!win_probability_overridden`
   (explicit deviation from `move-stage`, documented below).
5. Fire-and-forget insert into `pyra_lead_activities` with
   `activity_type: 'stage_change'`, using `.then(({ error }) => …)` — **not**
   bare `void <builder>** (the lazy-query-builder trap called out in the task
   context; `lib/crm/close-follow-up.ts` already uses this exact pattern).
6. Returns `{ ok: true, previousStage: fromStage, changed: true }`.

## TDD evidence

### Step 1 — RED (foreground, no background/Monitor)

Command:
```
cd "C:/xampp/htdocs/pyra-workspace-3" && pnpm test -- __tests__/stage-change-metadata.test.ts
```

Relevant output (full run took 186s because pnpm's `--` was forwarded as a
literal token to vitest, which made it scan the whole 124-file suite instead
of filtering — see Concerns):

```
 FAIL  __tests__/stage-change-metadata.test.ts [ __tests__/stage-change-metadata.test.ts ]
Error: Failed to resolve import "@/lib/crm/mark-not-interested" from "__tests__/stage-change-metadata.test.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: C:/xampp/htdocs/pyra-workspace-3/__tests__/stage-change-metadata.test.ts:2:41
  1  |  import { describe, it, expect } from "vitest";
  2  |  import { buildStageChangeMetadata } from "@/lib/crm/mark-not-interested";
     |                                            ^

 Test Files  1 failed | 123 passed (124)
      Tests  1048 passed (1048)
```

This confirms the failing state was exactly "module not found" — nothing else
was wrong with the test file itself.

### Step 2 — GREEN

Command (switched to a direct `vitest run` invocation to avoid the `--`
forwarding issue and only run the target file):
```
cd "C:/xampp/htdocs/pyra-workspace-3" && pnpm exec vitest run __tests__/stage-change-metadata.test.ts
```

Output:
```
 RUN  v4.1.2 C:/xampp/htdocs/pyra-workspace-3


 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  14:31:46
   Duration  3.49s (transform 153ms, setup 436ms, import 134ms, tests 11ms, environment 2.50s)
```

4/4 tests passed, matching the brief's "Expected: PASS, 4 tests."

### `pnpm run check`

```
cd "C:/xampp/htdocs/pyra-workspace-3" && pnpm run check
```

```
> pyra-workspace-3@3.0.0 check C:\xampp\htdocs\pyra-workspace-3
> tsc --noEmit && npx tsx scripts/i18n-check.ts

i18n:check ✓ clean
```

Zero TypeScript errors, i18n gate clean (this module writes no hardcoded
Arabic UI/response strings — the only Arabic that flows through it is caller-
supplied `reason` and DB-sourced `name_ar`, neither of which are string
literals in this file).

### Extra self-review check (not in the brief, ran anyway)

```
pnpm exec eslint lib/crm/mark-not-interested.ts __tests__/stage-change-metadata.test.ts
```
No output — clean.

## Side-by-side: `move-stage/route.ts` vs `mark-not-interested.ts`

**Exact `activityMetadata` object built in
`app/api/crm/leads/[id]/move-stage/route.ts`** (lines 297–313, quoted
verbatim):

```ts
const activityMetadata: ActivityMetadata = {
  from_stage: fromStage,
  from_stage_label: fromLabel,
  to_stage: toStageId,
  to_stage_label: toLabel,
  changed_by: auth.pyraUser.username,
};
if (isContractSigned && attachment) {
  activityMetadata.requested_by = auth.pyraUser.username;
  activityMetadata.attachment = attachment;
  if (attachmentLabel) activityMetadata.attachment_label = attachmentLabel;
}
if (lostReason !== null) activityMetadata.lost_reason = lostReason;
if (isReopen && reopenReason) {
  activityMetadata.reopened = true;
  activityMetadata.reopen_reason = reopenReason;
}
```

**The object `buildStageChangeMetadata()` produces** (in
`lib/crm/mark-not-interested.ts`):

```ts
const meta: StageChangeMetadata = {
  from_stage: args.fromStage,
  from_stage_label: args.fromStageLabel,
  to_stage: args.toStage,
  to_stage_label: args.toStageLabel,
  changed_by: args.changedBy,
};
if (args.lostReason) meta.lost_reason = args.lostReason;
return meta;
```

For the transition this task actually performs (a plain `stage_change` to a
custom stage — never `contract_signed`, never a reopen), `move-stage`'s
`activityMetadata` reduces to exactly the same 6 keys ours produces:
`from_stage`, `from_stage_label`, `to_stage`, `to_stage_label`, `changed_by`,
and `lost_reason` (present here because a not-interested call outcome always
supplies a reason, mirroring how `move-stage` always requires `lost_reason`
for `stg_closed_lost`). `activity_type: 'stage_change'` and `description:
null` also match `move-stage`'s value for this same non-contract, non-reopen
case. This is what `__tests__/stage-change-metadata.test.ts` locks: the key
set, the value pass-through, and the omission of `lost_reason` when absent.

## Before You Begin — conflict check (none found)

Verified against the live repo before writing anything:
- `STAGE_NOT_INTERESTED = 'ps_zT_9mNvS8qxMq-7d'` and `PIPELINE_TERMINAL_STAGE_IDS`
  exist in `lib/constants/statuses.ts` exactly as Task 1 (`a6ba068`) is
  described to have added them.
- `isStaticPipelineStageId` is exported from `lib/crm/pipeline-stages.ts`
  exactly as stated.
- `move-stage/route.ts`'s `activityMetadata` shape matches the brief's
  described keys 1:1 (see side-by-side above).
- `pyra_lead_activities` schema (`DATABASE-SCHEMA.md` §89: id, lead_id,
  activity_type, description, metadata, created_by, created_at) matches the
  insert shape used.
- `pyra_sales_leads` — `DATABASE-SCHEMA.md` §87 does not list
  `win_probability`, `win_probability_overridden`, or `lost_reason`, but
  `move-stage/route.ts` (already running in production) reads/writes all
  three, so the doc is stale, not the code. Not a conflict worth pausing on.

No conflicts surfaced, so the brief was implemented as written with no
deviation.

## Commands run and results

| Command | Result |
|---|---|
| `pnpm test -- __tests__/stage-change-metadata.test.ts` (RED) | 1 file failed (module not found), rest of suite (123 files / 1048 tests) incidentally ran and passed — 186s |
| `pnpm exec vitest run __tests__/stage-change-metadata.test.ts` (GREEN) | 1 file / 4 tests passed — 3.49s |
| `pnpm run check` | `tsc --noEmit` clean + `i18n:check ✓ clean` |
| `pnpm exec eslint lib/crm/mark-not-interested.ts __tests__/stage-change-metadata.test.ts` | clean, no output |
| `git add lib/crm/mark-not-interested.ts __tests__/stage-change-metadata.test.ts` | staged both new files |
| `git commit -F <msgfile> -- lib/crm/mark-not-interested.ts __tests__/stage-change-metadata.test.ts` | commit `01c9628` |

## Files changed

- `lib/crm/mark-not-interested.ts` (new, 154 lines)
- `__tests__/stage-change-metadata.test.ts` (new, 45 lines)

No other files touched. `git show --stat HEAD` confirms exactly these two
files in the commit; `git status --porcelain` afterward shows no pending
changes to either.

## Self-review findings

- The fire-and-forget `pyra_lead_activities` insert correctly uses
  `.then(({ error }) => …)`, not bare `void <builder>` — verified this is the
  actual triggering call (the `void` wraps the `.then()` promise, not the
  builder itself), matching the pattern already shipped in
  `lib/crm/close-follow-up.ts`.
- `win_probability = 0` is gated on `!lead.win_probability_overridden`,
  matching the documented deviation and the same guard `move-stage` uses
  everywhere else — the override flag still wins.
- Idempotency: a lead already in `STAGE_NOT_INTERESTED` returns early with NO
  writes at all (not even a `lost_reason` refresh) — correct per the brief's
  stated contract, but worth flagging: a retried call outcome with a
  *different* reason than a previous one will not update `lost_reason`. This
  is intentional (retry-safety over freshness) and matches the brief; noting
  it so a reviewer doesn't mistake it for an oversight.
- `fromLabel` resolution replicates `move-stage`'s exact fallback (static →
  `PIPELINE_STAGE_LABELS_AR[fromStage]`, custom/null → raw value) — confirmed
  by reading the reference route rather than assuming.
- No hardcoded Arabic string literals are persisted from this file (the only
  Arabic that reaches the DB is either caller-supplied `reason` or the DB's
  own `name_ar` column), so no `// i18n-exempt` comment was needed — consistent
  with `pnpm run check`'s clean i18n gate.
- `SupabaseClient` is used unparameterized (no `Database` generic), matching
  the exact signature in the brief and the existing `lib/crm/close-follow-up.ts`
  convention.

## Concerns

- **`pnpm test -- <path>` does not filter in this environment.** Running it as
  written in the brief forwards a literal `--` token into the underlying
  `vitest run` invocation (visible in the RED output:
  `vitest run "--" "__tests__/stage-change-metadata.test.ts"`), which vitest
  does not treat as a file filter — it ran the full 124-file / 1048-test suite
  instead of just the target file (186s instead of ~3.5s). I did not
  investigate root cause (pnpm/vitest version interaction) since the
  coordinator explicitly said the test suite is not the blocker here and
  asked me not to run the full suite deliberately — but future tasks that copy
  the brief's exact `pnpm test -- <file>` command should expect the same
  slow-full-suite behavior, or use `pnpm exec vitest run <file>` instead as
  done here for the GREEN step.
- This module is not yet wired to any caller — a later task
  (`app/api/mobile/call-outcome/route.ts`) is expected to call
  `markNotInterested`. Nothing in this task's scope required that wiring, and
  none was done, per the "touch only these two files" constraint.
- `markNotInterested` itself (the DB-touching function, as opposed to the pure
  `buildStageChangeMetadata`) has no automated test in this task — the brief's
  Step 1 test only covers the pure metadata builder. This matches the brief
  exactly; flagging only so a reviewer knows integration-level coverage (lead
  fetch / idempotency / stage-missing / win_probability branch) is
  brief-scoped-out, not missed.

## Fix round 1

Two Important review findings, both approved by the owner as deliberate
deviations from the original task brief's sample code.

### Finding 1 — check-then-act → compare-and-swap

`lib/crm/mark-not-interested.ts`'s `UPDATE … WHERE id = leadId` had no
condition on the stage still being what the earlier `SELECT` read. Two
genuinely concurrent `markNotInterested` calls for the same lead could both
pass the sequential-retry early return before either commits, then both
insert a `stage_change` activity — doubling the timeline.

Fixed by making the `UPDATE` itself the guard, exactly matching the
compare-and-swap `lib/crm/close-follow-up.ts` already uses:

```ts
.update(updates)
.eq('id', leadId)
.or(`stage_id.is.null,stage_id.neq.${STAGE_NOT_INTERESTED}`)
.select('id')
.maybeSingle();
```

- `.or('stage_id.is.null,stage_id.neq.…')` instead of a plain `.neq()` — a
  bare `.neq()` compiles to `stage_id <> '…'`, which is NULL (and therefore
  excludes the row) for a lead with a NULL `stage_id`. The `.or()` form is
  NULL-safe, so a stage-less lead can still be moved.
- Interpolating `STAGE_NOT_INTERESTED` into the filter string is safe — it's
  a code constant (`ps_zT_9mNvS8qxMq-7d`), never user input, so there is no
  PostgREST-filter-injection surface.
- `!updatedRow` (0 rows matched) now returns `{ ok: true, changed: false,
  previousStage: fromStage }` with NO activity insert — a concurrent caller
  already moved it, which is the outcome the caller asked for.
- The existing sequential early-return (before any query 2/3 round trips) is
  kept as-is — it still saves the round trip on the common case; the CAS is
  the belt-and-suspenders for the race the early return can't catch.
- Only one `.or()` is used, combined with the existing `.eq('id', leadId)` —
  no second `.or()` was added, per the reviewer's note that this composes
  correctly with PostgREST.

### Finding 2 — extract `resolveStageLabelForActivity`

The `fromLabel` expression was byte-identical in both
`lib/crm/mark-not-interested.ts` and
`app/api/crm/leads/[id]/move-stage/route.ts`. Extracted to
`lib/crm/pipeline-stages.ts`:

```ts
export function resolveStageLabelForActivity(stageId: string | null): string | null {
  if (!stageId) return stageId;
  return isStaticPipelineStageId(stageId) ? PIPELINE_STAGE_LABELS_AR[stageId] : stageId;
}
```

Both call sites now call this helper for `fromLabel`. `toLabel` in
`move-stage/route.ts` was left completely untouched — its fallback is
`targetStage.name_ar ?? toStageId`, deliberately different from `fromLabel`'s
raw-id fallback, and the task brief explicitly forbade touching it.
`PIPELINE_STAGE_LABELS_AR` and `isStaticPipelineStageId` imports stay in
`move-stage/route.ts` because `toLabel`'s computation (line ~276-278,
unchanged) still uses both directly.

**Declared type of `fromStage` in `move-stage/route.ts`:**
```ts
const fromStage = typeof leadBefore.stage_id === 'string' ? leadBefore.stage_id : null;
```
This is `string | null` — no `undefined` in the union. It matches the
helper's parameter type (`stageId: string | null`) exactly, so no widening
and no cast were needed at either call site.

Added 3 tests to the EXISTING `__tests__/crm-pipeline-stages.test.ts` (new
`describe('resolveStageLabelForActivity', …)` block, appended after the
existing `describe` block — no existing test touched):
- a seeded stage id (`stg_discovery_call`) resolves to its Arabic label
  (`مكالمة استكشافية`, cross-checked against `lib/constants/statuses.ts` line
  401 and against the value already hardcoded in
  `__tests__/stage-change-metadata.test.ts`)
- a custom `ps_*` id (`ps_zT_9mNvS8qxMq-7d`) falls back to itself
- `null` returns `null` unchanged

### Commands run and output

```
cd "C:/xampp/htdocs/pyra-workspace-3" && pnpm exec vitest run __tests__/crm-pipeline-stages.test.ts __tests__/stage-change-metadata.test.ts
```
```
 RUN  v4.1.2 C:/xampp/htdocs/pyra-workspace-3


 Test Files  2 passed (2)
      Tests  10 passed (10)
   Start at  14:46:21
   Duration  5.19s (transform 379ms, setup 1.28s, import 314ms, tests 32ms, environment 7.55s)
```
(3 new `resolveStageLabelForActivity` tests + 3 existing pipeline-stages tests
+ 4 existing stage-change-metadata tests = 10.)

```
cd "C:/xampp/htdocs/pyra-workspace-3" && pnpm run check
```
```
> pyra-workspace-3@3.0.0 check C:\xampp\htdocs\pyra-workspace-3
> tsc --noEmit && npx tsx scripts/i18n-check.ts

i18n:check ✓ clean
```
Zero TypeScript errors, i18n gate clean.

Extra self-review (not required, ran anyway):
```
pnpm exec eslint lib/crm/mark-not-interested.ts lib/crm/pipeline-stages.ts "app/api/crm/leads/[id]/move-stage/route.ts" __tests__/crm-pipeline-stages.test.ts
```
No output — clean on all four touched files.

### Files changed (fix round 1)

- `lib/crm/mark-not-interested.ts` — CAS update guard + shared label helper
- `lib/crm/pipeline-stages.ts` — new `resolveStageLabelForActivity()` export
- `app/api/crm/leads/[id]/move-stage/route.ts` — `fromLabel` now calls the
  shared helper; `toLabel` untouched; imports adjusted (added
  `resolveStageLabelForActivity`, kept `PIPELINE_STAGE_LABELS_AR` +
  `isStaticPipelineStageId` for `toLabel`)
- `__tests__/crm-pipeline-stages.test.ts` — 3 new tests appended

No other files touched. `.superpowers/sdd/task-7-report.md` shows as modified
in `git status` but was NOT touched by this fix round — that is a concurrent
edit from another session on the same branch, excluded from this commit's
pathspec.

### Concerns

- None found in the fix itself. One thing worth a reviewer's eye: the CAS
  filter string uses template interpolation
  (`` `stage_id.is.null,stage_id.neq.${STAGE_NOT_INTERESTED}` ``) rather than
  a parameterized filter, because PostgREST's `.or()` takes a raw filter
  string with no parameter-binding API. This is safe only because
  `STAGE_NOT_INTERESTED` is a fixed code constant, never request-derived —
  confirmed by reading its definition in `lib/constants/statuses.ts` before
  relying on that property.

## Fix round 2

**Test addition for byte-identity property of `resolveStageLabelForActivity`.**

The helper's doc comment states it returns falsy inputs (`null` and `''`)
unchanged. Fix round 1 added 3 tests (seeded stage, custom `ps_*` stage, `null`)
but **did not test the empty string**. A future refactor from `if (!stageId)`
to `if (stageId === null)` would silently break the `''` case and pass every
existing test.

Added one test to `__tests__/crm-pipeline-stages.test.ts`:

```ts
it('returns the empty string unchanged', () => {
  // '' must round-trip unchanged — the two inline expressions this helper
  // replaced short-circuited on any falsy input, and that byte-identity is
  // what makes the consolidation safe. A refactor to `stageId === null`
  // would break this and pass every other test here.
  expect(resolveStageLabelForActivity('')).toBe('');
});
```

### Command run and output

```
cd "C:/xampp/htdocs/pyra-workspace-3" && pnpm exec vitest run __tests__/crm-pipeline-stages.test.ts
```

```
 RUN  v4.1.2 C:/xampp/htdocs/pyra-workspace-3


 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  14:56:23
   Duration  5.58s (transform 191ms, setup 908ms, import 136ms, tests 18ms, environment 3.91s)
```

All 7 tests passed (3 existing pipeline-stages tests + 4 existing
stage-change-metadata tests + 1 new empty-string test).

### Commit

```
git commit -F <msgfile> -- __tests__/crm-pipeline-stages.test.ts
```

Commit SHA: `83f9491`
Subject: `test(crm): lock the empty-string case of resolveStageLabelForActivity`

### Files changed (fix round 2)

- `__tests__/crm-pipeline-stages.test.ts` — 1 new test added to the
  `resolveStageLabelForActivity` describe block

No other files touched.
