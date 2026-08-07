# Pyra Calls — Close the Loop (Wave C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a sales rep close a follow-up and move a lead to «غير مهتم» from
the phone, writing to the same CRM tables the web writes to — so the app stops
producing follow-up debt it has no way to pay.

**Architecture:** Two new pure-ish helpers under `lib/crm/` own the two state
transitions (`closeFollowUp`, `markNotInterested`). `closeFollowUp` is
*extracted* from the existing CRM route and that route is rewired to use it, so
the mobile path is literally the same code, not a copy. The mobile
`call-outcome` route grows two optional body fields and calls both helpers as
warn-don't-fail side effects. One small new route covers closing a follow-up
with no call attached. The app gains a reason field, a close switch, a third
tab and a dead-session banner.

**Tech Stack:** Next.js 15 App Router · Supabase (service role) · Vitest ·
Kotlin 2.0.21 · Jetpack Compose (compose-bom 2024.12.01, Material3 1.3.1) ·
JUnit 4 · AGP 8.10.1 · Java 17

**Spec:** [`docs/superpowers/specs/2026-08-07-calls-app-close-the-loop-design.md`](../specs/2026-08-07-calls-app-close-the-loop-design.md)
**Backlog:** [`docs/CALL-TRACKING-BACKLOG.md`](../../CALL-TRACKING-BACKLOG.md)
**Previous wave:** [`2026-08-07-calls-app-ui-foundation.md`](2026-08-07-calls-app-ui-foundation.md) — shipped v1.6.0

---

## Global Constraints

Every task's requirements implicitly include this section.

- **ZERO new tables, columns or migrations.** Owner constraint, spec §2.1.
  Every write in this wave targets a column the web already writes. If a task
  seems to need a new column, **stop and report** — do not add one.
- **The mobile write must be indistinguishable from the web write.**
  `activity_type` values and metadata key names are copied from
  `app/api/crm/leads/[id]/move-stage/route.ts` and
  `app/api/crm/follow-ups/[id]/complete/route.ts` byte-for-byte.
- **Device keys carry no RBAC scope.** `requireDeviceAuth` returns an agent
  username, nothing else. Every route that touches lead data re-checks
  `assigned_to === agentUsername` itself. A missing lead and a
  not-owned lead return the **same** 403 — never leak existence.
- **Primary action fails loud; side effects warn and continue.** Note-write
  failure → `500`. Stage move / follow-up close failure → `200` with an error
  flag **and** a `logError()` row so the daily admin digest sees it.
- **Server strings:** response messages are Arabic literals in the existing
  mobile-route style (these routes are not in `MIGRATED_PATHS`). Any Arabic
  that gets **persisted** to `pyra_lead_activities` carries an
  `// i18n-exempt: persisted lead-activity content (Phase 8)` comment, matching
  `call-outcome/route.ts:17-19`.
- **App strings live in `res/values/strings.xml`.** No Kotlin string literals
  in UI. The app is Arabic-only — there is no `values-en`.
- **`FlowRow`, never `Row`, for 3+ chips.** Three chips in a `Row` at
  `font_scale 1.5` on a 384dp screen is literally backlog item B-02.
- **`letterSpacing = 0.sp`** on any new text style. Arabic letters join.
- **RTL:** `ms-`/`me-` on the web; on Android `PyraTheme` already provides
  `LayoutDirection.Rtl` once — do not re-wrap.
- **Web gates before push:** `pnpm run check` **and** `pnpm build` **and**
  `pnpm test`. App gates: `./gradlew testDebugUnitTest` and
  `./gradlew assembleDebug` from `pyra-calls-app/`.
- **Commit after every task**, conventional commits. Scope `crm` or `app`.
- **Git hygiene — another session shares this branch.** Never bare
  `git add .` / `git commit -m`. Write the message to a scratch file and commit
  with an explicit pathspec:

  ```bash
  cat > /tmp/msg.txt <<'EOF'
  feat(app): the subject line from the task

  Body.

  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  EOF
  git commit -F /tmp/msg.txt -- path/one.ts path/two.ts
  ```

  Every `git commit -F <msgfile> -- …` below means exactly that. For a NEW
  untracked file, `git add <that exact path>` first — a pathspec commit does
  not stage untracked files.

### Values pinned by production (measured 2026-08-07 — do not re-derive)

| Thing | Value |
|---|---|
| «غير مهتم» stage id | `ps_zT_9mNvS8qxMq-7d` (custom, UI-generated — **not** a seeded `stg_*`) |
| «غير مهتم» `name_ar` | `غير مهتم` |
| Seeded terminal stages | `stg_closed_won`, `stg_closed_lost` |
| Stages holding live leads | `stg_discovery_call` 1153 · `ps_85AlKP8d7mA7HAO9` («اجتماع») 32 · `ps_zT_9mNvS8qxMq-7d` 16 · `stg_new_inquiry` 13 · `stg_proposal_sent` 13 · `ps_e-w41Um9opZvPTPf` («لا يرد») 7 · `stg_closed_lost` 4 · `stg_negotiation` 1 |
| Leads with `stage_id IS NULL` | **0** of 1236 — but the column is nullable, so filters stay NULL-safe |
| Min lost-reason length (web) | `MIN_LOST_REASON = 5` |
| youssef overdue follow-ups | 108 |

`ps_e-w41Um9opZvPTPf` («لا يرد») is **not** terminal — a lead that did not
answer still needs chasing. Only the three ids above go in the terminal list.

### Execution protocol (this wave uses agents + reviewers + an audit council)

1. **One fresh subagent per task.** It receives the task text only, plus the
   Global Constraints block. It implements, runs the gates, and commits.
2. **One fresh reviewer per task**, dispatched immediately after. It reads the
   task, the spec section it implements, and `git show` of the commit. It
   reports Critical / Important / Minor. Critical and Important are fixed
   before the next task starts.
3. **Audit council after Task 13**, before publish. Four auditors run in
   parallel over the whole wave diff, each with a distinct lens:
   - **Correctness & data integrity** — can any path leave a lead half-written?
   - **Security & ownership** — can a device write to a lead it does not own?
   - **Compose / RTL / a11y / large-font** — the lens that caught nothing in
     wave A+B's per-task reviews and three things in the whole-wave review.
   - **Spec conformance** — every §-numbered requirement mapped to a line of
     code, and every deviation named.
   Then a **fifth adversarial pass** that tries to *refute* each surviving
   finding, and a synthesis. Anything still standing gets fixed before publish.

---

## File Structure

**Create (web):**

| File | Responsibility |
|---|---|
| `lib/crm/close-follow-up.ts` | Load + conditionally close a follow-up; the one place a follow-up becomes `completed`. Shared by web and mobile. |
| `lib/crm/mark-not-interested.ts` | The single lead → «غير مهتم» transition, with web-identical `stage_change` metadata. |
| `lib/mobile/outcome-validation.ts` | Pure request validation for `call-outcome`. No Supabase, no `NextRequest`. |
| `app/api/mobile/follow-ups/complete/route.ts` | Close a follow-up with no call attached. |
| `__tests__/pipeline-terminal-stages.test.ts` | The only guard on the pinned stage id. |
| `__tests__/outcome-validation.test.ts` | The reason rules. |
| `__tests__/stage-change-metadata.test.ts` | Metadata shape parity with the web route. |

**Modify (web):**

| File | Change |
|---|---|
| `lib/constants/statuses.ts` | `STAGE_NOT_INTERESTED` + `PIPELINE_TERMINAL_STAGE_IDS` |
| `app/api/crm/follow-ups/[id]/complete/route.ts` | Rewired onto `lib/crm/close-follow-up.ts` |
| `app/api/mobile/call-outcome/route.ts` | Two optional fields, two new side effects, dedup improvement |
| `app/api/mobile/my-day/route.ts` | `counts.overdue` + terminal-stage exclusion |
| `app/api/mobile/calls/sync/route.ts` | `open_follow_up_id` on matched results |
| `CLAUDE.md`, `docs/CALL-TRACKING.md`, `docs/CALL-TRACKING-BACKLOG.md` | Task 13 |

**Create (app):**

| File | Responsibility |
|---|---|
| `core/OutcomeForm.kt` | Pure form rules: when a reason is required, when follow-up presets apply. |
| `core/SessionHealth.kt` | Pure consecutive-auth-failure state machine. |
| `test/.../OutcomeFormTest.kt`, `test/.../SessionHealthTest.kt` | JUnit 4 |
| `res/drawable/ic_action_ignore.xml`, `res/drawable/ic_action_open_web.xml` | White silhouettes for the two notification action buttons (U-11). |

**Modify (app):** `core/Payloads.kt` · `data/ApiClient.kt` · `data/AppPrefs.kt` ·
`sync/SyncWorker.kt` · `notify/Notifier.kt` · `ui/QuickAddActivity.kt` ·
`ui/CallOutcomeActivity.kt` · `ui/MyDayScreen.kt` · `ui/HomeScreen.kt` ·
`ui/PermissionsScreen.kt` · `ui/components/LeadRow.kt` · `res/values/strings.xml` ·
`app/build.gradle.kts`

---

# Phase 1 — Shared server core

## Task 1: Terminal-stage constants

**Files:**
- Modify: `lib/constants/statuses.ts` (after `PIPELINE_FINAL_STAGES`, ~line 450)
- Create: `__tests__/pipeline-terminal-stages.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `STAGE_NOT_INTERESTED: string`, `PIPELINE_TERMINAL_STAGE_IDS: string[]`

- [ ] **Step 1: Write the failing test**

Create `__tests__/pipeline-terminal-stages.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  PIPELINE_FINAL_STAGES,
  PIPELINE_TERMINAL_STAGE_IDS,
  STAGE_NOT_INTERESTED,
} from '@/lib/constants/statuses';

// This file is the ONLY guard on the owner's 2026-08-07 decision to pin the
// "not interested" stage id in code instead of adding an `is_terminal` column
// to pyra_sales_pipeline_stages. If someone removes the constant or drops it
// from the terminal list, these tests are what tells them.
describe('PIPELINE_TERMINAL_STAGE_IDS', () => {
  it('pins the production id of the custom «غير مهتم» stage', () => {
    expect(STAGE_NOT_INTERESTED).toBe('ps_zT_9mNvS8qxMq-7d');
  });

  it('includes the not-interested stage', () => {
    expect(PIPELINE_TERMINAL_STAGE_IDS).toContain(STAGE_NOT_INTERESTED);
  });

  it('still includes every seeded final stage', () => {
    for (const stage of PIPELINE_FINAL_STAGES) {
      expect(PIPELINE_TERMINAL_STAGE_IDS).toContain(stage);
    }
  });

  it('does NOT include «لا يرد» — a no-answer lead still needs chasing', () => {
    expect(PIPELINE_TERMINAL_STAGE_IDS).not.toContain('ps_e-w41Um9opZvPTPf');
  });

  it('has no duplicates', () => {
    expect(new Set(PIPELINE_TERMINAL_STAGE_IDS).size).toBe(
      PIPELINE_TERMINAL_STAGE_IDS.length,
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm test -- __tests__/pipeline-terminal-stages.test.ts
```

Expected: FAIL — `STAGE_NOT_INTERESTED` is not exported.

- [ ] **Step 3: Add the constants**

In `lib/constants/statuses.ts`, immediately after the
`PIPELINE_FINAL_STAGES` declaration:

```ts
/**
 * «غير مهتم» — a CUSTOM stage created through the pipeline-settings UI, NOT
 * one of the migration-007 seeded `stg_*` rows. Its id is generated, so it
 * cannot be derived from anything: it is pinned here by value.
 *
 * Owner decision (2026-08-07): pin the id in code rather than add an
 * `is_terminal` column. `pyra_sales_pipeline_stages` has NO column that marks
 * a stage terminal — `is_default` is the only flag it carries — so **any
 * future terminal stage must be added to the list below BY HAND**. The only
 * guard on that is `__tests__/pipeline-terminal-stages.test.ts`.
 *
 * Deliberately NOT terminal: `ps_e-w41Um9opZvPTPf` («لا يرد») — a lead that
 * did not answer still needs chasing and must keep appearing in the
 * going-cold feed.
 */
export const STAGE_NOT_INTERESTED = 'ps_zT_9mNvS8qxMq-7d';

/**
 * Stages a lead is DONE in — excluded from "going cold" nudges. Typed
 * `string[]`, not `PipelineStageId[]`: the custom stage above is not a member
 * of the seeded union.
 */
export const PIPELINE_TERMINAL_STAGE_IDS: string[] = [
  ...PIPELINE_FINAL_STAGES,
  STAGE_NOT_INTERESTED,
];
```

- [ ] **Step 4: Run the test and the type check**

```bash
pnpm test -- __tests__/pipeline-terminal-stages.test.ts
```

Expected: PASS, 5 tests.

```bash
pnpm run check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add __tests__/pipeline-terminal-stages.test.ts
git commit -F <msgfile> -- lib/constants/statuses.ts __tests__/pipeline-terminal-stages.test.ts
```

Message: `feat(crm): pin the terminal pipeline stages, «غير مهتم» included`

---

## Task 2: Extract `closeFollowUp` and rewire the CRM route

The behaviour of `POST /api/crm/follow-ups/[id]/complete` must not change by
one byte. This is a move, not a rewrite. The reason it is a move and not a
copy: if the two paths diverge, the next person who fixes `next_follow_up`
recomputation in one place leaves the other wrong.

**Files:**
- Create: `lib/crm/close-follow-up.ts`
- Modify: `app/api/crm/follow-ups/[id]/complete/route.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  ```ts
  loadFollowUpForClose(supabase, followUpId):
    Promise<{ ok: true; followUp: OpenFollowUp } |
            { ok: false; reason: 'not_found' | 'already_closed' | 'db_error' }>

  closeFollowUp(supabase, { followUp, actor, note?, source? }):
    Promise<{ ok: true; row: Record<string, unknown> } |
            { ok: false; reason: 'already_closed' | 'db_error' }>

  interface OpenFollowUp {
    id: string; lead_id: string; assigned_to: string | null;
    status: string; title: string | null; due_at: string;
  }
  ```

- [ ] **Step 1: Create the helper**

Create `lib/crm/close-follow-up.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';

/**
 * The ONE place a `pyra_sales_follow_ups` row becomes `completed`.
 *
 * Extracted verbatim from `app/api/crm/follow-ups/[id]/complete/route.ts` so
 * the Android app closes follow-ups through the SAME code the web does, not a
 * lookalike. If these ever diverge, the next fix to `next_follow_up`
 * recomputation lands in one path and silently leaves the other wrong.
 *
 * **Ownership is NOT checked here — deliberately.** The two callers have
 * different rules: the CRM route allows the assignee OR an admin (via
 * `canAccessLead`'s admin shortcut); the mobile route allows the assignee
 * only, because a device key carries no RBAC scope. This module owns the
 * state transition; authorization stays with the caller.
 */

export interface OpenFollowUp {
  id: string;
  lead_id: string;
  assigned_to: string | null;
  status: string;
  title: string | null;
  due_at: string;
}

export type LoadFollowUpResult =
  | { ok: true; followUp: OpenFollowUp }
  | { ok: false; reason: 'not_found' | 'already_closed' | 'db_error' };

export type CloseFollowUpResult =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; reason: 'already_closed' | 'db_error' };

/**
 * Fetch a follow-up and assert it is still open.
 *
 * `'overdue'` is a LIVE not-done state (the check-due cron flips due-past
 * `pending` → `overdue`). It MUST stay closeable — otherwise the row can never
 * be closed from any UI and overdue counts + `leads.next_follow_up` inflate
 * forever.
 */
export async function loadFollowUpForClose(
  supabase: SupabaseClient,
  followUpId: string,
): Promise<LoadFollowUpResult> {
  const { data, error } = await supabase
    .from('pyra_sales_follow_ups')
    .select('id, lead_id, assigned_to, status, title, due_at')
    .eq('id', followUpId)
    .maybeSingle();

  if (error) {
    console.error('[closeFollowUp] fetch error:', error.message);
    return { ok: false, reason: 'db_error' };
  }
  if (!data) return { ok: false, reason: 'not_found' };
  if (data.status !== 'pending' && data.status !== 'overdue') {
    return { ok: false, reason: 'already_closed' };
  }
  return { ok: true, followUp: data as OpenFollowUp };
}

/**
 * Close an already-loaded open follow-up.
 *
 * Three writes, in this order:
 *   1. Compare-and-swap the row to `completed` (`.in('status', [...])`) — a
 *      concurrent close matches 0 rows and returns `already_closed` instead of
 *      re-processing.
 *   2. Fire-and-forget `follow_up_completed` timeline activity.
 *   3. Fire-and-forget recompute of `leads.next_follow_up` to the earliest
 *      remaining open follow-up (or null).
 *
 * `source` is OMITTED from the activity metadata when not supplied, so the
 * web's write stays byte-identical to what it was before this extraction.
 */
export async function closeFollowUp(
  supabase: SupabaseClient,
  opts: {
    followUp: OpenFollowUp;
    actor: string;
    note?: string | null;
    source?: string;
  },
): Promise<CloseFollowUpResult> {
  const { followUp, actor, note, source } = opts;
  const completedAt = new Date().toISOString();

  const { data: updated, error: updErr } = await supabase
    .from('pyra_sales_follow_ups')
    .update({ status: 'completed', completed_at: completedAt })
    .eq('id', followUp.id)
    .in('status', ['pending', 'overdue'])
    .select('*')
    .maybeSingle();
  if (updErr) {
    console.error('[closeFollowUp] update error:', updErr.message);
    return { ok: false, reason: 'db_error' };
  }
  if (!updated) return { ok: false, reason: 'already_closed' };

  // .then() required — the Supabase query builder is lazy; bare
  // `void <builder>` never triggers execution.
  void supabase
    .from('pyra_lead_activities')
    .insert({
      id: generateId('la'),
      lead_id: followUp.lead_id,
      activity_type: 'follow_up_completed',
      description: note || null,
      metadata: {
        follow_up_id: followUp.id,
        title: followUp.title,
        completed_at: completedAt,
        ...(source ? { source } : {}),
      },
      created_by: actor,
    })
    .then(({ error: e }) => {
      if (e) console.error('[follow_up_completed activity] insert failed:', e.message);
    });

  // Recalculate the parent lead's next_follow_up to the earliest remaining
  // open one — null when none is left.
  const { data: nextPending } = await supabase
    .from('pyra_sales_follow_ups')
    .select('due_at')
    .eq('lead_id', followUp.lead_id)
    .in('status', ['pending', 'overdue'])
    .order('due_at', { ascending: true })
    .limit(1);
  void supabase
    .from('pyra_sales_leads')
    .update({
      next_follow_up: nextPending && nextPending.length > 0 ? nextPending[0].due_at : null,
    })
    .eq('id', followUp.lead_id)
    .then(({ error: e }) => {
      if (e) console.error('[lead next_follow_up update] failed:', e.message);
    });

  return { ok: true, row: updated as Record<string, unknown> };
}
```

- [ ] **Step 2: Rewire the CRM route**

In `app/api/crm/follow-ups/[id]/complete/route.ts`, replace the body between
the `const supabase = createServiceRoleClient();` line and the `logActivity(`
call with the version below. **Preserve every i18n message key exactly** —
`crm.followUpNotFound` (404), `crm.followUpAlreadyDone` (422 on the pre-check),
`crm.followUpAlreadyCompleted` (422 on the CAS miss). Those are three distinct
messages today and must stay three.

Add the import:

```ts
import { loadFollowUpForClose, closeFollowUp } from '@/lib/crm/close-follow-up';
```

Remove the now-unused `generateId` import if nothing else in the file uses it
(it does not).

Replace the fetch / status-check / update / activity / recompute blocks with:

```ts
    const loaded = await loadFollowUpForClose(supabase, id);
    if (!loaded.ok) {
      if (loaded.reason === 'db_error') return apiServerError();
      if (loaded.reason === 'not_found') return apiNotFound(t('crm.followUpNotFound'));
      return apiValidationError(t('crm.followUpAlreadyDone'));
    }
    const followUp = loaded.followUp;

    // Caller must own the follow-up OR have access to the parent lead
    // (admin satisfies both via canAccessLead's admin shortcut).
    const isAssignee = followUp.assigned_to === auth.pyraUser.username;
    const canAccess = await canAccessLead(
      supabase,
      auth.pyraUser.username,
      auth.pyraUser.role,
      followUp.lead_id,
    );
    if (!isAssignee && !canAccess) {
      return apiForbidden(t('crm.followUpOwnerOrAdminOnly'));
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const outcome = typeof body.outcome_note === 'string' ? body.outcome_note.trim() : '';

    const closed = await closeFollowUp(supabase, {
      followUp,
      actor: auth.pyraUser.username,
      note: outcome,
    });
    if (!closed.ok) {
      if (closed.reason === 'db_error') return apiServerError();
      return apiValidationError(t('crm.followUpAlreadyCompleted'));
    }
```

and change the final success line to:

```ts
    return apiSuccess({ follow_up: closed.row });
```

- [ ] **Step 3: Verify the extraction changed nothing**

```bash
git diff -- "app/api/crm/follow-ups/[id]/complete/route.ts"
```

Read the diff line by line and confirm, out loud in your report:
- the three i18n keys still map to the same three situations;
- the activity `description`, `metadata` keys and `created_by` are unchanged;
- the `next_follow_up` recompute still uses `.in('status', ['pending','overdue'])`
  ordered by `due_at` ascending, limit 1, and still writes `null` when none
  remain;
- the ownership check still runs BEFORE the update, and still reads
  `request.json()` after it.

- [ ] **Step 4: Gates**

```bash
pnpm run check
```

```bash
pnpm test
```

Expected: all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add lib/crm/close-follow-up.ts
git commit -F <msgfile> -- lib/crm/close-follow-up.ts "app/api/crm/follow-ups/[id]/complete/route.ts"
```

Message: `refactor(crm): extract closeFollowUp so mobile shares the web's path`

---

## Task 3: `markNotInterested`

**Files:**
- Create: `lib/crm/mark-not-interested.ts`
- Create: `__tests__/stage-change-metadata.test.ts`

**Interfaces:**
- Consumes: `STAGE_NOT_INTERESTED` (Task 1)
- Produces:
  ```ts
  buildStageChangeMetadata(args: {
    fromStage: string | null; fromStageLabel: string | null;
    toStage: string; toStageLabel: string;
    changedBy: string; lostReason?: string;
  }): StageChangeMetadata

  markNotInterested(supabase, { leadId, actor, reason }):
    Promise<{ ok: true; previousStage: string | null; changed: boolean } |
            { ok: false; reason: 'not_found' | 'stage_missing' | 'db_error' }>
  ```

- [ ] **Step 1: Write the failing metadata test**

Create `__tests__/stage-change-metadata.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildStageChangeMetadata } from '@/lib/crm/mark-not-interested';

// The whole point of this helper is that a stage move written from a PHONE is
// indistinguishable, on the lead timeline, from one written by the web.
// `app/api/crm/leads/[id]/move-stage/route.ts` builds exactly these keys.
describe('buildStageChangeMetadata', () => {
  const base = {
    fromStage: 'stg_discovery_call',
    fromStageLabel: 'مكالمة استكشافية',
    toStage: 'ps_zT_9mNvS8qxMq-7d',
    toStageLabel: 'غير مهتم',
    changedBy: 'cosette',
  };

  it('emits exactly the web route\'s key set', () => {
    const meta = buildStageChangeMetadata({ ...base, lostReason: 'السعر مش مناسب' });
    expect(Object.keys(meta).sort()).toEqual(
      ['changed_by', 'from_stage', 'from_stage_label', 'lost_reason', 'to_stage', 'to_stage_label'],
    );
  });

  it('omits lost_reason entirely when absent', () => {
    const meta = buildStageChangeMetadata(base);
    expect('lost_reason' in meta).toBe(false);
  });

  it('carries the values through unchanged', () => {
    const meta = buildStageChangeMetadata({ ...base, lostReason: 'فاز عليه منافس' });
    expect(meta).toEqual({
      from_stage: 'stg_discovery_call',
      from_stage_label: 'مكالمة استكشافية',
      to_stage: 'ps_zT_9mNvS8qxMq-7d',
      to_stage_label: 'غير مهتم',
      changed_by: 'cosette',
      lost_reason: 'فاز عليه منافس',
    });
  });

  it('tolerates a lead that had no previous stage', () => {
    const meta = buildStageChangeMetadata({ ...base, fromStage: null, fromStageLabel: null });
    expect(meta.from_stage).toBeNull();
    expect(meta.from_stage_label).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm test -- __tests__/stage-change-metadata.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

Create `lib/crm/mark-not-interested.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';
import { PIPELINE_STAGE_LABELS_AR, STAGE_NOT_INTERESTED } from '@/lib/constants/statuses';
import { isStaticPipelineStageId } from '@/lib/crm/pipeline-stages';

/**
 * The one lead → «غير مهتم» transition.
 *
 * Deliberately NOT routed through `POST /api/crm/leads/[id]/move-stage`: that
 * route is a large general mover (validation matrix, contract/invoice
 * attachments, manager notifications, reopen handling) and this is a single
 * transition triggered by a call outcome. What it DOES copy from that route,
 * exactly, is the timeline write — same `activity_type`, same metadata keys —
 * so a stage move made from the phone looks identical to one made from the web.
 */

export interface StageChangeMetadata {
  from_stage: string | null;
  from_stage_label: string | null;
  to_stage: string;
  to_stage_label: string;
  changed_by: string;
  lost_reason?: string;
}

/**
 * Pure. Mirrors the `activityMetadata` object built in
 * `app/api/crm/leads/[id]/move-stage/route.ts`. Unit-tested in
 * `__tests__/stage-change-metadata.test.ts` — that test is what stops the two
 * shapes drifting apart.
 */
export function buildStageChangeMetadata(args: {
  fromStage: string | null;
  fromStageLabel: string | null;
  toStage: string;
  toStageLabel: string;
  changedBy: string;
  lostReason?: string;
}): StageChangeMetadata {
  const meta: StageChangeMetadata = {
    from_stage: args.fromStage,
    from_stage_label: args.fromStageLabel,
    to_stage: args.toStage,
    to_stage_label: args.toStageLabel,
    changed_by: args.changedBy,
  };
  if (args.lostReason) meta.lost_reason = args.lostReason;
  return meta;
}

export type MarkNotInterestedResult =
  | { ok: true; previousStage: string | null; changed: boolean }
  | { ok: false; reason: 'not_found' | 'stage_missing' | 'db_error' };

/**
 * Move a lead to «غير مهتم» with a reason.
 *
 * Idempotent: a lead already in the stage returns `ok: true, changed: false`
 * with NO write, so a retry never doubles the timeline.
 *
 * `win_probability = 0` is written EXPLICITLY here, and this is a deliberate
 * deviation from `move-stage`. That route only applies a default when
 * `STAGE_DEFAULT_WIN_PROBABILITY` has an entry for the target, and it has none
 * for custom stages — so moving to «غير مهتم» through the web leaves the old
 * probability in place. A not-interested lead forecasting 25% pollutes the
 * pipeline value, so this path zeroes it, exactly as «خسارة» does. The
 * `win_probability_overridden` flag still wins, same as everywhere else.
 */
export async function markNotInterested(
  supabase: SupabaseClient,
  opts: { leadId: string; actor: string; reason: string },
): Promise<MarkNotInterestedResult> {
  const { leadId, actor, reason } = opts;

  const { data: lead, error: leadErr } = await supabase
    .from('pyra_sales_leads')
    .select('id, stage_id, win_probability_overridden')
    .eq('id', leadId)
    .maybeSingle();
  if (leadErr) {
    console.error('[markNotInterested] lead fetch failed:', leadErr.message);
    return { ok: false, reason: 'db_error' };
  }
  if (!lead) return { ok: false, reason: 'not_found' };

  const fromStage = (lead.stage_id as string | null) ?? null;
  if (fromStage === STAGE_NOT_INTERESTED) {
    return { ok: true, previousStage: fromStage, changed: false };
  }

  // Read the stage's own name_ar rather than hardcoding the label, so a rename
  // in pipeline settings is reflected on the timeline — same as move-stage
  // does for custom stages. A MISSING row is a hard failure, not a fallback:
  // writing a stage_id nobody can resolve would produce a lead stuck in a
  // stage the pipeline board cannot render.
  const { data: stageRow, error: stageErr } = await supabase
    .from('pyra_sales_pipeline_stages')
    .select('id, name_ar')
    .eq('id', STAGE_NOT_INTERESTED)
    .maybeSingle();
  if (stageErr) {
    console.error('[markNotInterested] stage fetch failed:', stageErr.message);
    return { ok: false, reason: 'db_error' };
  }
  if (!stageRow) return { ok: false, reason: 'stage_missing' };

  const updates: Record<string, unknown> = {
    stage_id: STAGE_NOT_INTERESTED,
    lost_reason: reason,
    updated_at: new Date().toISOString(),
  };
  if (!lead.win_probability_overridden) updates.win_probability = 0;

  const { error: updErr } = await supabase
    .from('pyra_sales_leads')
    .update(updates)
    .eq('id', leadId);
  if (updErr) {
    console.error('[markNotInterested] lead update failed:', updErr.message);
    return { ok: false, reason: 'db_error' };
  }

  // from_stage_label: move-stage resolves a STATIC stage through
  // PIPELINE_STAGE_LABELS_AR and falls back to the raw id for a custom one.
  // Replicated exactly — including the fallback — so both writers produce the
  // same string for the same lead.
  const fromLabel =
    fromStage && isStaticPipelineStageId(fromStage)
      ? PIPELINE_STAGE_LABELS_AR[fromStage]
      : fromStage;

  void supabase
    .from('pyra_lead_activities')
    .insert({
      id: generateId('la'),
      lead_id: leadId,
      activity_type: 'stage_change',
      description: null,
      metadata: buildStageChangeMetadata({
        fromStage,
        fromStageLabel: fromLabel,
        toStage: STAGE_NOT_INTERESTED,
        toStageLabel: (stageRow.name_ar as string | null) ?? STAGE_NOT_INTERESTED,
        changedBy: actor,
        lostReason: reason,
      }),
      created_by: actor,
    })
    .then(({ error: e }) => {
      if (e) console.error('[stage_change activity] insert failed:', e.message);
    });

  return { ok: true, previousStage: fromStage, changed: true };
}
```

- [ ] **Step 4: Run the tests and the type check**

```bash
pnpm test -- __tests__/stage-change-metadata.test.ts
```

Expected: PASS, 4 tests.

```bash
pnpm run check
```

- [ ] **Step 5: Commit**

```bash
git add lib/crm/mark-not-interested.ts __tests__/stage-change-metadata.test.ts
git commit -F <msgfile> -- lib/crm/mark-not-interested.ts __tests__/stage-change-metadata.test.ts
```

Message: `feat(crm): markNotInterested — one transition, web-identical timeline`

---

# Phase 2 — Mobile endpoints

## Task 4: Pure request validation for `call-outcome`

Everything is validated before ANY write. If validation ran late we could
write a «غير مهتم» note and then reject the request — leaving a lead with a
note and an unchanged stage, which is precisely the bug this wave closes.

**Files:**
- Create: `lib/mobile/outcome-validation.ts`
- Create: `__tests__/outcome-validation.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  OUTCOMES: readonly ['interested','not_interested','call_again']
  type Outcome = 'interested' | 'not_interested' | 'call_again'
  OUTCOME_LABELS: Record<Outcome, string>
  NOTE_MAX_LENGTH = 2000
  MIN_NOT_INTERESTED_REASON = 5

  interface ValidatedOutcome {
    leadId: string; outcome: Outcome; note: string;
    nextFollowUpAtIso: string | null;
    notInterestedReason: string | null;
    completeFollowUpId: string | null;
  }
  validateOutcomeRequest(body: unknown):
    { ok: true; value: ValidatedOutcome } | { ok: false; message: string }
  ```

- [ ] **Step 1: Write the failing test**

Create `__tests__/outcome-validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateOutcomeRequest } from '@/lib/mobile/outcome-validation';

const base = { lead_id: 'sl_abc', outcome: 'interested' };

describe('validateOutcomeRequest', () => {
  it('accepts a minimal valid body', () => {
    const r = validateOutcomeRequest(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.leadId).toBe('sl_abc');
      expect(r.value.outcome).toBe('interested');
      expect(r.value.note).toBe('');
      expect(r.value.nextFollowUpAtIso).toBeNull();
      expect(r.value.notInterestedReason).toBeNull();
      expect(r.value.completeFollowUpId).toBeNull();
    }
  });

  it('rejects a missing lead_id', () => {
    expect(validateOutcomeRequest({ outcome: 'interested' }).ok).toBe(false);
  });

  it('rejects an unknown outcome', () => {
    expect(validateOutcomeRequest({ ...base, outcome: 'maybe' }).ok).toBe(false);
  });

  it('rejects a note over 2000 chars', () => {
    expect(validateOutcomeRequest({ ...base, note: 'x'.repeat(2001) }).ok).toBe(false);
  });

  // --- the not_interested reason rules ---

  it('REQUIRES a reason when outcome is not_interested', () => {
    const r = validateOutcomeRequest({ ...base, outcome: 'not_interested' });
    expect(r.ok).toBe(false);
  });

  it('rejects a reason shorter than 5 characters', () => {
    const r = validateOutcomeRequest({
      ...base, outcome: 'not_interested', not_interested_reason: 'غالي',
    });
    expect(r.ok).toBe(false);
  });

  it('accepts a 5-character reason', () => {
    const r = validateOutcomeRequest({
      ...base, outcome: 'not_interested', not_interested_reason: '12345',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.notInterestedReason).toBe('12345');
  });

  it('trims the reason before measuring it', () => {
    const r = validateOutcomeRequest({
      ...base, outcome: 'not_interested', not_interested_reason: '   12   ',
    });
    expect(r.ok).toBe(false);
  });

  // Rejected, NOT silently ignored: a client that sends a reason with the
  // wrong outcome has a bug, and swallowing it would hide it.
  it('REJECTS a reason sent with any other outcome', () => {
    const r = validateOutcomeRequest({
      ...base, outcome: 'call_again', not_interested_reason: 'مش مهتم خالص',
    });
    expect(r.ok).toBe(false);
  });

  // --- follow-up fields ---

  it('rejects an unparseable next_follow_up_at', () => {
    expect(validateOutcomeRequest({ ...base, next_follow_up_at: 'soon' }).ok).toBe(false);
  });

  it('normalises next_follow_up_at to ISO', () => {
    const r = validateOutcomeRequest({ ...base, next_follow_up_at: '2026-08-10T06:00:00Z' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.nextFollowUpAtIso).toBe('2026-08-10T06:00:00.000Z');
  });

  it('passes complete_follow_up_id through trimmed', () => {
    const r = validateOutcomeRequest({ ...base, complete_follow_up_id: ' fu_1 ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.completeFollowUpId).toBe('fu_1');
  });

  it('treats a blank complete_follow_up_id as absent', () => {
    const r = validateOutcomeRequest({ ...base, complete_follow_up_id: '   ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.completeFollowUpId).toBeNull();
  });

  it('rejects a non-object body', () => {
    expect(validateOutcomeRequest(null).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm test -- __tests__/outcome-validation.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `lib/mobile/outcome-validation.ts`:

```ts
/**
 * Pure request validation for `POST /api/mobile/call-outcome`.
 *
 * Extracted from the route so the reason rules are unit-testable without a
 * Supabase client or a NextRequest. The route calls this FIRST and writes
 * nothing until it returns ok — writing a note and then rejecting would leave
 * a lead with an outcome recorded and its stage unmoved, which is the exact
 * defect this wave exists to close.
 */

export const OUTCOMES = ['interested', 'not_interested', 'call_again'] as const;
export type Outcome = (typeof OUTCOMES)[number];

// Persisted lead-timeline / follow-up content — stays Arabic per the codebase
// convention (CLAUDE.md i18n rules: DB-data strings are exempt until Phase 8).
export const OUTCOME_LABELS: Record<Outcome, string> = {
  interested: 'مهتم', // i18n-exempt: persisted lead-activity content (Phase 8)
  not_interested: 'غير مهتم', // i18n-exempt: persisted lead-activity content (Phase 8)
  call_again: 'يحتاج إعادة اتصال', // i18n-exempt: persisted lead-activity content (Phase 8)
};

export const NOTE_MAX_LENGTH = 2000;

/** Same floor as the web's `MIN_LOST_REASON` in move-stage-confirm-modal.tsx. */
export const MIN_NOT_INTERESTED_REASON = 5;

export interface ValidatedOutcome {
  leadId: string;
  outcome: Outcome;
  note: string;
  nextFollowUpAtIso: string | null;
  notInterestedReason: string | null;
  completeFollowUpId: string | null;
}

export type OutcomeValidation =
  | { ok: true; value: ValidatedOutcome }
  | { ok: false; message: string };

function isOutcome(value: unknown): value is Outcome {
  return typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateOutcomeRequest(body: unknown): OutcomeValidation {
  if (!body || typeof body !== 'object') {
    return { ok: false, message: 'جسم الطلب مطلوب' };
  }
  const b = body as Record<string, unknown>;

  const leadId = str(b.lead_id);
  if (!leadId) return { ok: false, message: 'lead_id مطلوب' };

  const outcome = b.outcome;
  if (!isOutcome(outcome)) {
    return {
      ok: false,
      message: 'outcome غير صالح — القيم المسموحة: interested, not_interested, call_again',
    };
  }

  const note = str(b.note);
  if (note.length > NOTE_MAX_LENGTH) {
    return { ok: false, message: `الملاحظة طويلة جدًا (الحد الأقصى ${NOTE_MAX_LENGTH} حرف)` };
  }

  let nextFollowUpAtIso: string | null = null;
  const rawNext = typeof b.next_follow_up_at === 'string' ? b.next_follow_up_at : '';
  if (rawNext) {
    const parsed = new Date(rawNext);
    if (isNaN(parsed.getTime())) return { ok: false, message: 'next_follow_up_at غير صالح' };
    nextFollowUpAtIso = parsed.toISOString();
  }

  // The reason is REQUIRED with not_interested and REJECTED with anything
  // else. Rejecting (rather than ignoring) a misplaced reason turns a client
  // bug into a visible 422 instead of a silently dropped field.
  const reason = str(b.not_interested_reason);
  let notInterestedReason: string | null = null;
  if (outcome === 'not_interested') {
    if (reason.length < MIN_NOT_INTERESTED_REASON) {
      return {
        ok: false,
        message: `سبب عدم الاهتمام مطلوب (${MIN_NOT_INTERESTED_REASON} حروف على الأقل)`,
      };
    }
    notInterestedReason = reason;
  } else if (reason) {
    return {
      ok: false,
      message: 'not_interested_reason مسموح فقط مع outcome=not_interested',
    };
  }

  const completeFollowUpId = str(b.complete_follow_up_id) || null;

  return {
    ok: true,
    value: { leadId, outcome, note, nextFollowUpAtIso, notInterestedReason, completeFollowUpId },
  };
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm test -- __tests__/outcome-validation.test.ts
```

Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/mobile/outcome-validation.ts __tests__/outcome-validation.test.ts
git commit -F <msgfile> -- lib/mobile/outcome-validation.ts __tests__/outcome-validation.test.ts
```

Message: `feat(app): pure validation for the mobile call-outcome body`

---

## Task 5: Wire the two new fields into `call-outcome`

**Files:**
- Modify: `app/api/mobile/call-outcome/route.ts`

**Interfaces:**
- Consumes: `validateOutcomeRequest`, `OUTCOME_LABELS` (Task 4); `markNotInterested` (Task 3); `loadFollowUpForClose`, `closeFollowUp` (Task 2)
- Produces: response `{ activity_id, follow_up_id, follow_up_error, deduplicated, stage_error, complete_error }`

- [ ] **Step 1: Replace the imports and the local constants block**

Delete lines 9–24 of the current file (the `NOTE_MAX_LENGTH`, `OUTCOMES`,
`Outcome`, `OUTCOME_LABELS`, `isOutcome` declarations) and add to the imports:

```ts
import { validateOutcomeRequest, OUTCOME_LABELS } from '@/lib/mobile/outcome-validation';
import { markNotInterested } from '@/lib/crm/mark-not-interested';
import { loadFollowUpForClose, closeFollowUp } from '@/lib/crm/close-follow-up';
```

- [ ] **Step 2: Replace the parse/validate block**

Replace everything from `const body = await request.json()...` through the
`nextFollowUpAtIso` assignment (current lines 89–107) with:

```ts
    const parsed = validateOutcomeRequest(await request.json().catch(() => null));
    if (!parsed.ok) return apiValidationError(parsed.message);
    const {
      leadId, outcome, note: noteRaw, nextFollowUpAtIso,
      notInterestedReason, completeFollowUpId,
    } = parsed.value;
```

- [ ] **Step 3: Add the follow-up ownership pre-check**

Immediately after the existing lead-ownership check (the block ending
`return apiForbidden('لا تملك صلاحية الوصول لهذا الليد');`), insert:

```ts
    // ── Follow-up pre-check — BEFORE any write ───────────────────────────
    // Must belong to the SAME lead and be assigned to the calling agent. A
    // missing follow-up, someone else's follow-up and an already-closed one
    // all resolve to the same 403 — never leak which.
    //
    // This runs before the note insert on purpose: rejecting after we had
    // already written the outcome would leave the lead with a note and an
    // untouched follow-up, and the agent with no way to tell.
    let followUpToClose: Awaited<ReturnType<typeof loadFollowUpForClose>> | null = null;
    if (completeFollowUpId) {
      followUpToClose = await loadFollowUpForClose(supabase, completeFollowUpId);
      if (!followUpToClose.ok) {
        if (followUpToClose.reason === 'db_error') return apiServerError();
        return apiForbidden('لا تملك صلاحية إغلاق هذه المتابعة');
      }
      const fu = followUpToClose.followUp;
      if (fu.lead_id !== leadId || fu.assigned_to !== agentUsername) {
        return apiForbidden('لا تملك صلاحية إغلاق هذه المتابعة');
      }
    }
```

- [ ] **Step 4: Add the two side effects after the note block**

The current structure is `if (deduplicated) { … } else { … note + bump +
optional follow-up … }`. Leave that block exactly as it is. Add the two new
side effects **after the whole if/else closes** — that placement is the change:
it is what makes them run on the dedup path too. Insert them immediately before
the `logActivity(` call: 

```ts
    // ── 4. Stage move (not_interested only) ───────────────────────────────
    // Runs on the dedup path too, and that is the point: the move is
    // idempotent, so a retry after a half-succeeded first attempt REPAIRS
    // itself instead of leaving the agent stuck. Before this, a duplicate
    // request skipped every side effect.
    let stageError = false;
    if (notInterestedReason) {
      const moved = await markNotInterested(supabase, {
        leadId,
        actor: agentUsername,
        reason: notInterestedReason,
      });
      if (!moved.ok) {
        stageError = true;
        logError({
          error: `markNotInterested failed: ${moved.reason}`,
          request,
          metadata: {
            action: 'mobile_call_outcome_stage_move',
            agentUsername, leadId, failure: moved.reason,
          },
        });
      }
    }

    // ── 5. Close the follow-up the call was against ───────────────────────
    // Also idempotent — the compare-and-swap inside closeFollowUp matches 0
    // rows on a second attempt and reports `already_closed`, which on a retry
    // is a success from the agent's point of view, not a failure.
    let completeError = false;
    if (followUpToClose?.ok) {
      const closed = await closeFollowUp(supabase, {
        followUp: followUpToClose.followUp,
        actor: agentUsername,
        // i18n-exempt: persisted lead-activity content (Phase 8)
        note: `أُقفلت مع تسجيل نتيجة المكالمة: ${OUTCOME_LABELS[outcome]}`,
        source: 'mobile_call_outcome',
      });
      if (!closed.ok && closed.reason !== 'already_closed') {
        completeError = true;
        logError({
          error: `closeFollowUp failed: ${closed.reason}`,
          request,
          metadata: {
            action: 'mobile_call_outcome_complete_follow_up',
            agentUsername, leadId, followUpId: followUpToClose.followUp.id,
          },
        });
      }
    }
```

- [ ] **Step 5: Extend the audit row and the response**

Replace the `logActivity(` metadata object and the final `return`:

```ts
    logActivity(
      agentUsername,
      auth.displayName,
      `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/crm/leads/${leadId}`,
      {
        lead_id: leadId, outcome, follow_up_id: followUpId,
        follow_up_error: followUpError, deduplicated,
        stage_moved: !!notInterestedReason && !stageError,
        stage_error: stageError,
        completed_follow_up_id: followUpToClose?.ok ? followUpToClose.followUp.id : null,
        complete_error: completeError,
        source: 'mobile_call_outcome',
      },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({
      activity_id: activityId,
      follow_up_id: followUpId,
      follow_up_error: followUpError,
      deduplicated,
      stage_error: stageError,
      complete_error: completeError,
    });
```

- [ ] **Step 6: Update the route's doc comment**

Extend the JSDoc block's "Side effects" list with the two new ones and add a
paragraph documenting the dedup change:

```
 *   - If `not_interested_reason` is present: markNotInterested() moves the
 *     lead to «غير مهتم» and writes a web-identical `stage_change` activity.
 *   - If `complete_follow_up_id` is present: closeFollowUp() completes it and
 *     recomputes leads.next_follow_up.
 *
 * **Dedup change (wave C).** A duplicate within 60s still skips the note and
 * the last_contact_at bump, but NO LONGER skips the stage move and the
 * follow-up close. Both are idempotent, so replaying them is free — and it
 * means a first attempt that wrote the note but failed the move repairs
 * itself on retry instead of stranding the agent.
```

- [ ] **Step 7: Gates**

```bash
pnpm run check
```

```bash
pnpm test
```

```bash
pnpm build
```

- [ ] **Step 8: Commit**

```bash
git commit -F <msgfile> -- app/api/mobile/call-outcome/route.ts
```

Message: `feat(app): call outcome can move the stage and close its follow-up`

---

## Task 6: `POST /api/mobile/follow-ups/complete`

**Files:**
- Create: `app/api/mobile/follow-ups/complete/route.ts`

**Interfaces:**
- Consumes: `loadFollowUpForClose`, `closeFollowUp` (Task 2)
- Produces: `{ follow_up_id, closed: true }`

- [ ] **Step 1: Write the route**

Create `app/api/mobile/follow-ups/complete/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../../_lib/device-auth';
import { apiSuccess, apiValidationError, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { loadFollowUpForClose, closeFollowUp } from '@/lib/crm/close-follow-up';

/**
 * Reasons a follow-up can be closed WITHOUT a call.
 *
 * Deliberately only two, and deliberately not extensible from the client.
 * Owner decision (2026-08-07):
 *   - «اتواصلنا خارج النظام» does not exist as a concept — every conversation
 *     goes through a company line, so there is no off-system contact to record.
 *   - «العميل مش مهتم» is a STAGE MOVE, not a close reason. It goes through
 *     call-outcome with `not_interested_reason` so the lead actually leaves
 *     the pipeline instead of quietly losing its reminder.
 */
const CLOSE_REASONS = ['duplicate', 'wrong_number'] as const;
type CloseReason = (typeof CLOSE_REASONS)[number];

const CLOSE_REASON_LABELS: Record<CloseReason, string> = {
  duplicate: 'مكرر', // i18n-exempt: persisted lead-activity content (Phase 8)
  wrong_number: 'رقم غلط', // i18n-exempt: persisted lead-activity content (Phase 8)
};

function isCloseReason(v: unknown): v is CloseReason {
  return typeof v === 'string' && (CLOSE_REASONS as readonly string[]).includes(v);
}

/**
 * POST /api/mobile/follow-ups/complete
 *
 * Close an administrative follow-up straight from the app, with no call
 * attached. Auth: device x-api-key (`calls:device`) via `requireDeviceAuth`.
 *
 * **Ownership: the assignee ONLY.** Unlike the CRM route there is no admin
 * override here — a device key carries no RBAC scope, so there is nothing to
 * grant one from. A follow-up that does not exist and one that belongs to
 * someone else return the SAME 403, so the endpoint cannot be used to probe
 * which follow-up ids exist.
 *
 * Body: { follow_up_id: string, reason: 'duplicate' | 'wrong_number' }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { agentUsername } = auth;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const followUpId = typeof body?.follow_up_id === 'string' ? body.follow_up_id.trim() : '';
    const reason = body?.reason;

    if (!followUpId) return apiValidationError('follow_up_id مطلوب');
    if (!isCloseReason(reason)) {
      return apiValidationError('reason غير صالح — القيم المسموحة: duplicate, wrong_number');
    }

    const supabase = createServiceRoleClient();

    const loaded = await loadFollowUpForClose(supabase, followUpId);
    if (!loaded.ok) {
      if (loaded.reason === 'db_error') return apiServerError();
      // not_found AND already_closed collapse into the same 403 as
      // not-yours — the app has no action to offer for any of them, and
      // distinguishing them would leak row existence.
      return apiForbidden('لا تملك صلاحية إغلاق هذه المتابعة');
    }
    if (loaded.followUp.assigned_to !== agentUsername) {
      return apiForbidden('لا تملك صلاحية إغلاق هذه المتابعة');
    }

    const closed = await closeFollowUp(supabase, {
      followUp: loaded.followUp,
      actor: agentUsername,
      // i18n-exempt: persisted lead-activity content (Phase 8)
      note: `إغلاق بدون مكالمة: ${CLOSE_REASON_LABELS[reason]}`,
      source: 'mobile_follow_up_complete',
    });
    if (!closed.ok) {
      if (closed.reason === 'already_closed') {
        // Someone (or a retry) beat us to it. From the phone's point of view
        // the follow-up IS closed, which is what it asked for — a 4xx here
        // would make the app show an error for an outcome it wanted.
        return apiSuccess({ follow_up_id: followUpId, closed: true });
      }
      logError({
        error: `closeFollowUp failed: ${closed.reason}`,
        request,
        metadata: { action: 'mobile_follow_up_complete', agentUsername, followUpId },
      });
      return apiServerError();
    }

    logActivity(
      agentUsername,
      auth.displayName,
      `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/crm/leads/${loaded.followUp.lead_id}`,
      {
        lead_id: loaded.followUp.lead_id,
        follow_up_id: followUpId,
        action: 'completed',
        close_reason: reason,
        source: 'mobile_follow_up_complete',
      },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({ follow_up_id: followUpId, closed: true });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_follow_up_complete' } });
    return apiServerError();
  }
}
```

- [ ] **Step 2: Gates**

```bash
pnpm run check
```

```bash
pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add app/api/mobile/follow-ups/complete/route.ts
git commit -F <msgfile> -- app/api/mobile/follow-ups/complete/route.ts
```

Message: `feat(app): close a follow-up from the phone without a call`

---

## Task 7: `my-day` — real overdue count + terminal-stage exclusion

**Files:**
- Modify: `app/api/mobile/my-day/route.ts`

**Interfaces:**
- Consumes: `PIPELINE_TERMINAL_STAGE_IDS` (Task 1)
- Produces: response `counts` gains `overdue: number | null`

**⚠️ Deviation from spec §4.3, applied deliberately.** The spec describes a
DB-side `stage_id NOT IN (...)` with a comment defending it. This task filters
in JS instead. Three reasons, all of which the implementer should keep in the
code comment:
1. NULL-safety becomes structural instead of a comment. PostgREST's
   `NULL NOT IN (...)` evaluates to NULL and silently drops the row; a
   `Set.has()` miss keeps it. `stage_id` is nullable (0 rows today, but the
   column allows it).
2. It composes safely. The query already carries one `.or(...)` for
   `last_contact_at`; a NULL-safe stage filter needs a second one, and repeated
   `or=` params are not a composition this codebase has verified.
3. It matches the idiom already in this exact route — the open-follow-up
   exclusion is JS-side for its own (different) reason, and the full candidate
   pool is already fetched with a breach alarm guarding completeness.

- [ ] **Step 1: Add the import and the set**

```ts
import { PIPELINE_TERMINAL_STAGE_IDS } from '@/lib/constants/statuses';
```

and near the other module constants:

```ts
// Hoisted: a Set built once per module, not per request.
const TERMINAL_STAGE_SET = new Set(PIPELINE_TERMINAL_STAGE_IDS);
```

- [ ] **Step 2: Add `stage_id` to the cold-lead row type and select**

```ts
interface ColdLeadRow {
  id: string;
  name: string;
  phone: string | null;
  company: string | null;
  stage_id: string | null;
  last_contact_at: string | null;
  created_at: string;
}
```

and in the going-cold query change the select string to:

```ts
      .select('id, name, phone, company, stage_id, last_contact_at, created_at', { count: 'exact' })
```

- [ ] **Step 3: Exclude terminal stages in the JS filter**

Replace the `.filter((lead) => !excludeLeadIdSet.has(lead.id))` line with:

```ts
      .filter((lead) => !excludeLeadIdSet.has(lead.id))
      // Terminal stages are excluded HERE, not in the SQL, on purpose:
      //   1. NULL-safe by construction. PostgREST's `stage_id NOT IN (...)`
      //      evaluates to NULL for a NULL stage_id and silently DROPS the row.
      //      `stage_id` is nullable (0 such rows measured 2026-08-07, but the
      //      column permits them) and a lead with no stage is the opposite of
      //      finished — it must stay in this feed.
      //   2. The query already carries one `.or(...)` for last_contact_at, and
      //      a NULL-safe stage filter needs a second one; repeated `or=` params
      //      are not a composition this codebase has verified.
      //   3. Same idiom as the open-follow-up exclusion two lines up. The full
      //      candidate pool is already fetched, with GOING_COLD_FETCH_CAP's
      //      breach alarm guaranteeing it is complete.
      // NOT the unbounded-`.in()` failure class (UF-T3): this is a 3-element
      // constant set, never per-agent data.
      .filter((lead) => !TERMINAL_STAGE_SET.has(lead.stage_id ?? ''))
```

- [ ] **Step 4: Add the overdue count query**

Immediately after the follow-ups query's error handling
(`const followUps = (followUpRows ?? []) as FollowUpRow[];`), insert:

```ts
    // ── True overdue count — what makes the app's third tab honest ──────
    // `followUpTotal` above merges overdue and pending into one number, so the
    // app could never split them without miscounting any rep with more than
    // the 20 rows the list returns (youssef: 108 overdue, measured
    // 2026-08-07). This is a HEAD count — no rows transferred.
    //
    // No due_at bound is needed: an `overdue` row is by definition already
    // past due, so it always satisfies the `due_at <= now+1d` filter the
    // follow-ups query uses. That is what guarantees overdue ⊆ follow_ups and
    // lets the app derive "due today" by subtraction.
    //
    // Fails SOFT: on error this reports null and the response still ships.
    // The app falls back to two tabs. Never take the screen down for a badge.
    const { count: overdueCountRaw, error: overdueErr } = await supabase
      .from('pyra_sales_follow_ups')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', agentUsername)
      .eq('status', 'overdue');
    if (overdueErr) {
      logError({
        severity: 'warning',
        error: overdueErr,
        request,
        metadata: { action: 'mobile_my_day_overdue_count', agentUsername },
      });
    }
    const overdueCount: number | null = overdueErr ? null : (overdueCountRaw ?? 0);
```

- [ ] **Step 5: Add it to the response**

```ts
      counts: {
        follow_ups: followUpTotal ?? followUpItems.length,
        going_cold: coldCandidates.length,
        // null = the count query failed; the app renders two tabs instead of
        // three rather than showing a wrong number.
        overdue: overdueCount,
      },
```

- [ ] **Step 6: Update the route's header comment**

In the `going_cold:` bullet of the block comment, append:

```
//                 Leads in a TERMINAL stage (PIPELINE_TERMINAL_STAGE_IDS —
//                 closed won, closed lost, «غير مهتم») are excluded: a lead
//                 the rep already marked not-interested must never come back
//                 as "you haven't called this person".
```

- [ ] **Step 7: Gates**

```bash
pnpm run check
```

```bash
pnpm build
```

- [ ] **Step 8: Commit**

```bash
git commit -F <msgfile> -- app/api/mobile/my-day/route.ts
```

Message: `feat(app): my-day reports a real overdue count and skips finished leads`

---

## Task 8: `calls/sync` returns the lead's open follow-up

This is what lets the "call → notification → sheet → done" loop close without
the rep ever opening a list.

**Files:**
- Modify: `app/api/mobile/calls/sync/route.ts`

**Interfaces:**
- Consumes: nothing
- Produces: matched results gain `open_follow_up_id?: string | null`

- [ ] **Step 1: Type the results array**

Replace `const results: Array<Record<string, unknown>> = [];` (line 147) with:

```ts
    interface SyncResultOut {
      device_call_key: string;
      status: string;
      lead_id?: string;
      lead_name?: string;
      owned?: boolean;
      // Additive (wave C): the agent's earliest OPEN follow-up on the matched
      // lead, so the phone's notification can open the outcome sheet with the
      // follow-up already attached. An older app ignores unknown keys.
      open_follow_up_id?: string | null;
    }
    const results: SyncResultOut[] = [];
```

- [ ] **Step 2: Attach the follow-up ids after the loop**

Immediately before `return apiSuccess({ results });`, insert:

```ts
    // ── Attach each matched lead's earliest OPEN follow-up ────────────────
    // ONE query for the whole batch, not one per call. Only leads the calling
    // agent OWNS are queried (`assigned_to`), so this can never surface a
    // colleague's follow-up id to a device.
    //
    // The `.in()` list is bounded by the batch size (100 calls, deduped to
    // distinct leads), so it is nowhere near the URL-length class that killed
    // the idle-check cron — no chunk() needed.
    //
    // Best-effort: a failure here leaves the field absent, which the app reads
    // as "no follow-up attached". It must never fail a sync that already
    // persisted calls.
    const matchedLeadIds = Array.from(
      new Set(results.map((r) => r.lead_id).filter((x): x is string => !!x)),
    );
    if (matchedLeadIds.length > 0) {
      const { data: openFollowUps, error: fuErr } = await supabase
        .from('pyra_sales_follow_ups')
        .select('id, lead_id, due_at')
        .eq('assigned_to', agentUsername)
        .in('lead_id', matchedLeadIds)
        .in('status', ['pending', 'overdue'])
        .order('due_at', { ascending: true });
      if (fuErr) {
        console.error('[calls/sync] open follow-up lookup failed:', fuErr.message);
      } else {
        // Ordered due_at ASC, so the FIRST row seen per lead is the earliest.
        const earliestByLead = new Map<string, string>();
        for (const fu of openFollowUps ?? []) {
          const leadId = fu.lead_id as string | null;
          if (leadId && !earliestByLead.has(leadId)) {
            earliestByLead.set(leadId, fu.id as string);
          }
        }
        for (const r of results) {
          if (r.lead_id) r.open_follow_up_id = earliestByLead.get(r.lead_id) ?? null;
        }
      }
    }
```

- [ ] **Step 3: Gates**

```bash
pnpm run check
```

```bash
pnpm build
```

```bash
pnpm test
```

- [ ] **Step 4: Commit**

```bash
git commit -F <msgfile> -- app/api/mobile/calls/sync/route.ts
```

Message: `feat(app): sync tells the phone which follow-up a matched call answers`

---

# Phase 3 — Android app

Working directory for every command below is `pyra-calls-app/`. Use
`./gradlew` from Git Bash. If a build fails with
`FileSystemException: ...RuntimeIssueRegistry...jar: being used by another
process`, run `./gradlew --stop` and retry — it is a Windows lint-cache lock,
not a code error.

## Task 9: Payloads + ApiClient

**Files:**
- Modify: `app/src/main/java/cloud/pyramedia/calls/core/Payloads.kt`
- Modify: `app/src/main/java/cloud/pyramedia/calls/data/ApiClient.kt`

**Interfaces:**
- Consumes: the server contracts from Tasks 5–8
- Produces: `CallOutcomeRequest` (+2 fields), `CallOutcomeData` (+2 fields),
  `MyDayCounts.overdue`, `SyncResult.open_follow_up_id`,
  `CompleteFollowUpRequest`, `CompleteFollowUpData`,
  `ApiClient.completeFollowUp(...)`

- [ ] **Step 1: Extend `SyncResult`**

Add as the last property of the existing `SyncResult` data class:

```kotlin
    // Additive (wave C). The agent's earliest OPEN follow-up on the matched
    // lead, so the "مكالمة مع…" notification can hand it straight to
    // CallOutcomeActivity and the rep closes the loop without opening a list.
    // Null both when the server is older (field absent) and when the lead
    // genuinely has no open follow-up — the app treats both the same way.
    val open_follow_up_id: String? = null,
```

- [ ] **Step 2: Extend the call-outcome payloads**

```kotlin
@Serializable data class CallOutcomeRequest(
    val lead_id: String, val outcome: String,
    val note: String? = null, val next_follow_up_at: String? = null,
    // Wave C. REQUIRED by the server when outcome == "not_interested" (≥5
    // chars after trim) and REJECTED with a 422 alongside any other outcome —
    // so this must be null unless the rep picked «غير مهتم».
    // PyraJson's explicitNulls=false omits the key entirely when null, which
    // is what keeps the "rejected with other outcomes" rule satisfiable.
    val not_interested_reason: String? = null,
    // Wave C. The follow-up this call answers. Server checks it belongs to the
    // SAME lead and to the calling agent, else 403.
    val complete_follow_up_id: String? = null,
)
@Serializable data class CallOutcomeData(
    val activity_id: String, val follow_up_id: String? = null,
    val follow_up_error: Boolean = false, val deduplicated: Boolean = false,
    // Wave C warn-don't-fail flags: the outcome WAS saved, but the stage move
    // and/or the follow-up close did not land. Default false so an older
    // server (fields absent) never reads as a failure.
    val stage_error: Boolean = false, val complete_error: Boolean = false,
)
```

- [ ] **Step 3: Extend `MyDayCounts` and add the new payloads**

```kotlin
@Serializable data class MyDayCounts(
    val follow_ups: Int, val going_cold: Int,
    // Wave C, nullable BY CONTRACT: the server reports null when its count
    // query failed rather than taking the whole screen down. Null means "I
    // don't know" — the screen falls back to two tabs, never to zero.
    val overdue: Int? = null,
)
```

and after `CallOutcomeData`:

```kotlin
// POST /api/mobile/follow-ups/complete — close a follow-up with no call.
// `reason` is a closed server-side set: "duplicate" | "wrong_number".
@Serializable data class CompleteFollowUpRequest(val follow_up_id: String, val reason: String)
@Serializable data class CompleteFollowUpData(val follow_up_id: String, val closed: Boolean = true)
```

- [ ] **Step 4: Add the ApiClient method**

After `callOutcome`:

```kotlin
    fun completeFollowUp(req: CompleteFollowUpRequest): ApiResult<CompleteFollowUpData> =
        post("/api/mobile/follow-ups/complete", req,
            CompleteFollowUpRequest.serializer(), CompleteFollowUpData.serializer(), withKey = true)
```

- [ ] **Step 5: Compile**

```bash
./gradlew assembleDebug
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git commit -F <msgfile> -- pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/core/Payloads.kt pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/data/ApiClient.kt
```

Message: `feat(app): wire the wave C fields into the Android API layer`

---

## Task 10: The outcome sheet — reason, close switch, hidden presets

**Files:**
- Create: `app/src/main/java/cloud/pyramedia/calls/core/OutcomeForm.kt`
- Create: `app/src/test/java/cloud/pyramedia/calls/core/OutcomeFormTest.kt`
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/CallOutcomeActivity.kt`
- Modify: `app/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: `CallOutcomeRequest` (Task 9)
- Produces: `OutcomeForm.requiresReason/allowsFollowUp/reasonSatisfied/effectiveFollowUpDays`

- [ ] **Step 1: Write the failing test**

Create `app/src/test/java/cloud/pyramedia/calls/core/OutcomeFormTest.kt`:

```kotlin
package cloud.pyramedia.calls.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OutcomeFormTest {

    // --- requiresReason ---

    @Test fun reasonRequiredOnlyForNotInterested() {
        assertTrue(OutcomeForm.requiresReason("not_interested"))
        assertFalse(OutcomeForm.requiresReason("interested"))
        assertFalse(OutcomeForm.requiresReason("call_again"))
        assertFalse(OutcomeForm.requiresReason(null))
    }

    // --- allowsFollowUp ---

    @Test fun followUpNotOfferedForNotInterested() {
        assertFalse(OutcomeForm.allowsFollowUp("not_interested"))
        assertTrue(OutcomeForm.allowsFollowUp("call_again"))
        assertTrue(OutcomeForm.allowsFollowUp("interested"))
        assertTrue(OutcomeForm.allowsFollowUp(null))
    }

    // --- reasonSatisfied ---

    @Test fun reasonSatisfiedTrueWhenNoOutcomePickedYet() {
        // Deliberate: an unpicked outcome keeps the screen's own inline
        // "اختر نتيجة المكالمة" error, which explains itself. A dead Save
        // button would not.
        assertTrue(OutcomeForm.reasonSatisfied(null, ""))
    }

    @Test fun reasonSatisfiedTrueForOutcomesThatNeedNoReason() {
        assertTrue(OutcomeForm.reasonSatisfied("interested", ""))
        assertTrue(OutcomeForm.reasonSatisfied("call_again", ""))
    }

    @Test fun reasonSatisfiedFalseWhenNotInterestedAndEmpty() {
        assertFalse(OutcomeForm.reasonSatisfied("not_interested", ""))
    }

    @Test fun reasonSatisfiedFalseAtFourCharacters() {
        assertFalse(OutcomeForm.reasonSatisfied("not_interested", "غالي"))
    }

    @Test fun reasonSatisfiedTrueAtFiveCharacters() {
        assertTrue(OutcomeForm.reasonSatisfied("not_interested", "12345"))
    }

    @Test fun reasonSatisfiedIgnoresSurroundingWhitespace() {
        assertFalse(OutcomeForm.reasonSatisfied("not_interested", "   12   "))
        assertTrue(OutcomeForm.reasonSatisfied("not_interested", "  12345  "))
    }

    @Test fun minimumMatchesTheWebsLostReasonFloor() {
        // Web: MIN_LOST_REASON = 5 in components/crm/pipeline/
        // move-stage-confirm-modal.tsx, and the server enforces the same.
        assertEquals(5, OutcomeForm.MIN_REASON_LENGTH)
    }

    // --- effectiveFollowUpDays: the "picked a date, then changed my mind" guard ---

    @Test fun followUpDaysDroppedWhenOutcomeBecomesNotInterested() {
        assertNull(OutcomeForm.effectiveFollowUpDays("not_interested", 3))
    }

    @Test fun followUpDaysKeptForOtherOutcomes() {
        assertEquals(3, OutcomeForm.effectiveFollowUpDays("call_again", 3))
        assertEquals(1, OutcomeForm.effectiveFollowUpDays("interested", 1))
    }

    @Test fun followUpDaysNullStaysNull() {
        assertNull(OutcomeForm.effectiveFollowUpDays("call_again", null))
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
./gradlew testDebugUnitTest --tests '*OutcomeFormTest*'
```

Expected: compilation failure — `OutcomeForm` unresolved.

- [ ] **Step 3: Write the pure module**

Create `app/src/main/java/cloud/pyramedia/calls/core/OutcomeForm.kt`:

```kotlin
package cloud.pyramedia.calls.core

/**
 * Form rules for the post-call outcome sheet, kept pure so they can be tested
 * without Compose. The server enforces the same rules — this exists so the rep
 * finds out before the round trip, not after.
 */
object OutcomeForm {
    const val OUTCOME_NOT_INTERESTED = "not_interested"

    /**
     * Matches the web's `MIN_LOST_REASON` (components/crm/pipeline/
     * move-stage-confirm-modal.tsx) and the server's
     * `MIN_NOT_INTERESTED_REASON`. Three places, one number — if it ever
     * changes, OutcomeFormTest's `minimumMatchesTheWebsLostReasonFloor` is
     * what notices.
     */
    const val MIN_REASON_LENGTH = 5

    fun requiresReason(outcome: String?): Boolean = outcome == OUTCOME_NOT_INTERESTED

    /**
     * Scheduling another call for someone the rep just marked "not interested"
     * is a contradiction — and an easy accident: pick a date, then change the
     * outcome, and the date is still selected. The sheet hides the presets and
     * [effectiveFollowUpDays] drops any stale selection on the way out, so the
     * invariant holds even if the UI ever forgets to clear it.
     */
    fun allowsFollowUp(outcome: String?): Boolean = outcome != OUTCOME_NOT_INTERESTED

    /**
     * True when the reason requirement is met, or does not apply.
     *
     * Returns true for a null [outcome] ON PURPOSE: an unpicked outcome keeps
     * the sheet's existing inline «اختر نتيجة المكالمة» error, which tells the
     * rep what to do. A Save button that is simply dead does not.
     */
    fun reasonSatisfied(outcome: String?, reason: String): Boolean {
        if (!requiresReason(outcome)) return true
        return reason.trim().length >= MIN_REASON_LENGTH
    }

    fun effectiveFollowUpDays(outcome: String?, presetDays: Int?): Int? =
        if (allowsFollowUp(outcome)) presetDays else null
}
```

- [ ] **Step 4: Run the test**

```bash
./gradlew testDebugUnitTest --tests '*OutcomeFormTest*'
```

Expected: PASS, 13 tests.

- [ ] **Step 5: Add the strings**

In `app/src/main/res/values/strings.xml`, after the existing `co_*` block
(after `co_follow_up_error`):

```xml
    <string name="co_reason_heading">ليه مش مهتم؟</string>
    <string name="co_reason_label">السبب</string>
    <string name="co_reason_min">%1$d / %2$d حرف على الأقل</string>
    <string name="co_reason_price">السعر مش مناسب</string>
    <string name="co_reason_competitor">فاز عليه منافس</string>
    <string name="co_reason_other">غير ذلك</string>
    <string name="co_close_follow_up_heading">المتابعة المرتبطة</string>
    <string name="co_close_follow_up_switch">اقفل المتابعة دي</string>
    <string name="co_close_follow_up_overdue">متأخرة عن %1$s</string>
    <string name="co_close_follow_up_due">مستحقة: %1$s</string>
    <string name="co_stage_error">تم تسجيل النتيجة، لكن تعذّر نقل الليد لمرحلة «غير مهتم» — بلّغ الأدمن</string>
    <string name="co_complete_error">تم تسجيل النتيجة، لكن تعذّر إقفال المتابعة — بلّغ الأدمن</string>
```

The three reason chips are the web's `lostReasonChips` **minus «تأجل القرار»**
— a delayed decision is not "not interested", it is "call again", and leaving
it in this list invites the wrong classification.

- [ ] **Step 6: Rewrite `CallOutcomeActivity`**

Replace the whole file with:

```kotlin
package cloud.pyramedia.calls.ui

import android.os.Bundle
import android.text.format.DateFormat
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cloud.pyramedia.calls.BuildConfig
import cloud.pyramedia.calls.R
import cloud.pyramedia.calls.core.CallOutcomeRequest
import cloud.pyramedia.calls.core.DubaiTime
import cloud.pyramedia.calls.core.OutcomeForm
import cloud.pyramedia.calls.data.ApiClient
import cloud.pyramedia.calls.data.ApiResult
import cloud.pyramedia.calls.data.AppPrefs
import cloud.pyramedia.calls.data.ErrorQueue
import cloud.pyramedia.calls.notify.Notifier
import cloud.pyramedia.calls.ui.components.PyraChip
import cloud.pyramedia.calls.ui.components.PyraScreen
import cloud.pyramedia.calls.ui.theme.LocalPyraColors
import cloud.pyramedia.calls.ui.theme.PyraTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.util.Date

// Mirrors the 3 outcomes app/api/mobile/call-outcome/route.ts's OUTCOMES
// tuple accepts verbatim — the server is the single source of truth for the
// allowed values; this list only supplies the button labels.
private data class OutcomeOption(val value: String, val labelRes: Int)
private val OUTCOME_OPTIONS = listOf(
    OutcomeOption("interested", R.string.co_outcome_interested),
    OutcomeOption(OutcomeForm.OUTCOME_NOT_INTERESTED, R.string.co_outcome_not_interested),
    OutcomeOption("call_again", R.string.co_outcome_call_again),
)

// Relative day presets for the optional "call again on…" field — a
// date-picker dialog would add real weight to this screen for a choice that
// only needs day granularity. Day is fixed at 10:00 Dubai time
// (DubaiTime.followUpPresetMillis) so every scheduled follow-up lands inside
// business hours without also asking the agent to pick a time.
private data class FollowUpPreset(val days: Int, val labelRes: Int)
private val FOLLOW_UP_PRESETS = listOf(
    FollowUpPreset(1, R.string.co_preset_tomorrow),
    FollowUpPreset(3, R.string.co_preset_in_3_days),
    FollowUpPreset(7, R.string.co_preset_next_week),
)

// Taken from the web's LOST_REASON_CHIP_KEYS (components/crm/pipeline/
// move-stage-confirm-modal.tsx) rather than invented here — MINUS
// «تأجل القرار», which is not "not interested" at all, it is "call again".
// Leaving it in the list would invite the wrong classification.
private val REASON_CHIPS = listOf(
    R.string.co_reason_price,
    R.string.co_reason_competitor,
    R.string.co_reason_other,
)

/**
 * Post-call outcome capture — launched from [Notifier.showMatched]'s content
 * intent with extras `lead_id` + `lead_name`, and OPTIONALLY `follow_up_id` /
 * `follow_up_title` / `follow_up_due_at` / `follow_up_overdue` when the call
 * answered a scheduled follow-up.
 *
 * Wave C: one save now carries up to three CRM writes — the outcome note, a
 * stage move to «غير مهتم», and closing the follow-up — so the rep never
 * opens a list to finish the job.
 */
class CallOutcomeActivity : ComponentActivity() {
    @OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val leadId = intent.getStringExtra("lead_id").orEmpty()
        val leadName = intent.getStringExtra("lead_name").orEmpty()
        val followUpId = intent.getStringExtra("follow_up_id")?.takeIf { it.isNotBlank() }
        val followUpTitle = intent.getStringExtra("follow_up_title").orEmpty()
        val followUpDueAt = intent.getStringExtra("follow_up_due_at").orEmpty()
        val followUpOverdue = intent.getBooleanExtra("follow_up_overdue", false)
        if (leadId.isEmpty()) { finish(); return }
        val prefs = AppPrefs(this)
        val api = ApiClient(BuildConfig.BASE_URL) { prefs.deviceKey }

        setContent {
            PyraTheme {
                var outcomeIndex by remember { mutableStateOf<Int?>(null) }
                var note by remember { mutableStateOf("") }
                var reason by remember { mutableStateOf("") }
                var presetDays by remember { mutableStateOf<Int?>(null) }
                var closeFollowUp by remember { mutableStateOf(followUpId != null) }
                var saving by remember { mutableStateOf(false) }
                var error by remember { mutableStateOf<String?>(null) }
                val scope = rememberCoroutineScope()
                val context = this@CallOutcomeActivity

                val selectedOutcome = outcomeIndex?.let { OUTCOME_OPTIONS[it].value }
                val needsReason = OutcomeForm.requiresReason(selectedOutcome)
                val showPresets = OutcomeForm.allowsFollowUp(selectedOutcome)
                val reasonOk = OutcomeForm.reasonSatisfied(selectedOutcome, reason)

                val unknownLead = stringResource(R.string.my_day_unknown_lead)
                val outcomeRequired = stringResource(R.string.co_outcome_required)
                val netError = stringResource(R.string.net_error)
                val saved = stringResource(R.string.co_saved)
                val followUpErrorMsg = stringResource(R.string.co_follow_up_error)
                val stageErrorMsg = stringResource(R.string.co_stage_error)
                val completeErrorMsg = stringResource(R.string.co_complete_error)

                PyraScreen(
                    title = stringResource(R.string.co_title),
                    bottomBar = {
                        Column {
                            error?.let {
                                Text(it, color = MaterialTheme.colorScheme.error)
                                Spacer(Modifier.height(8.dp))
                            }
                            Button(
                                // Locked only on the reason rule — an unpicked
                                // outcome falls through to the inline error
                                // below, which explains itself.
                                enabled = !saving && reasonOk,
                                modifier = Modifier.fillMaxWidth(),
                                onClick = {
                                    error = null
                                    val idx = outcomeIndex
                                    if (idx == null) { error = outcomeRequired; return@Button }
                                    saving = true
                                    scope.launch {
                                        val outcomeValue = OUTCOME_OPTIONS[idx].value
                                        // Belt and braces: the presets are hidden for
                                        // not_interested, but a stale selection made
                                        // BEFORE the rep changed their mind would
                                        // otherwise still be sent.
                                        val days = OutcomeForm.effectiveFollowUpDays(outcomeValue, presetDays)
                                        val nextFollowUpAtIso = days?.let {
                                            DubaiTime.isoUtc(
                                                DubaiTime.followUpPresetMillis(System.currentTimeMillis(), it),
                                            )
                                        }
                                        val req = CallOutcomeRequest(
                                            lead_id = leadId,
                                            outcome = outcomeValue,
                                            note = note.trim().ifBlank { null },
                                            next_follow_up_at = nextFollowUpAtIso,
                                            not_interested_reason =
                                                if (OutcomeForm.requiresReason(outcomeValue)) reason.trim() else null,
                                            complete_follow_up_id =
                                                if (closeFollowUp) followUpId else null,
                                        )
                                        val res = withContext(Dispatchers.IO) { api.callOutcome(req) }
                                        saving = false
                                        when (res) {
                                            is ApiResult.Ok -> {
                                                // Ok covers plain success AND deduplicated
                                                // (a 60s retry match is not an error). The
                                                // three *_error flags mean the outcome WAS
                                                // saved but a side effect did not land —
                                                // still a success, just a different toast.
                                                Notifier.cancel(context, leadId.hashCode())
                                                val msg = when {
                                                    res.data.stage_error -> stageErrorMsg
                                                    res.data.complete_error -> completeErrorMsg
                                                    res.data.follow_up_error -> followUpErrorMsg
                                                    else -> saved
                                                }
                                                Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
                                                finish()
                                            }
                                            is ApiResult.Err -> {
                                                ErrorQueue(context).enqueue(
                                                    message = "HTTP ${res.code}: ${res.message}",
                                                    source = "call_outcome_failed",
                                                    severity = "warning",
                                                )
                                                error = res.message
                                            }
                                            ApiResult.NetworkError -> error = netError
                                        }
                                    }
                                },
                            ) { Text(stringResource(if (saving) R.string.co_saving else R.string.co_save)) }
                        }
                    },
                ) {
                    Card(
                        Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = LocalPyraColors.current.noticeContainer,
                        ),
                    ) {
                        Column(Modifier.padding(16.dp)) {
                            Text(
                                stringResource(R.string.co_lead_eyebrow),
                                style = MaterialTheme.typography.labelMedium,
                                color = LocalPyraColors.current.onNoticeContainer,
                            )
                            Text(
                                leadName.ifBlank { unknownLead },
                                style = MaterialTheme.typography.titleLarge,
                            )
                        }
                    }

                    Text(
                        stringResource(R.string.co_outcome_heading),
                        style = MaterialTheme.typography.labelLarge,
                    )
                    // FlowRow, not Row — three chips in a plain Row clipped
                    // «يحتاج إعادة اتصال» off screen at larger system font
                    // sizes (B-02).
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OUTCOME_OPTIONS.forEachIndexed { index, opt ->
                            PyraChip(
                                label = stringResource(opt.labelRes),
                                selected = outcomeIndex == index,
                                onClick = {
                                    outcomeIndex = index
                                    // Clear a date picked before the rep changed
                                    // their mind — the presets are about to
                                    // disappear and a hidden-but-set control is
                                    // exactly how wrong data gets sent.
                                    if (!OutcomeForm.allowsFollowUp(opt.value)) presetDays = null
                                },
                            )
                        }
                    }

                    if (needsReason) {
                        Text(
                            stringResource(R.string.co_reason_heading),
                            style = MaterialTheme.typography.labelLarge,
                        )
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            REASON_CHIPS.forEach { chipRes ->
                                val chip = stringResource(chipRes)
                                PyraChip(
                                    label = chip,
                                    selected = reason.trim() == chip,
                                    onClick = { reason = if (reason.trim() == chip) "" else chip },
                                )
                            }
                        }
                        OutlinedTextField(
                            value = reason, onValueChange = { reason = it },
                            label = { Text(stringResource(R.string.co_reason_label)) },
                            modifier = Modifier.fillMaxWidth(), minLines = 2, maxLines = 4,
                            isError = !reasonOk,
                        )
                        if (!reasonOk) {
                            Text(
                                stringResource(
                                    R.string.co_reason_min,
                                    reason.trim().length, OutcomeForm.MIN_REASON_LENGTH,
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                            )
                        }
                    }

                    OutlinedTextField(
                        value = note, onValueChange = { note = it },
                        label = { Text(stringResource(R.string.co_note_label)) },
                        modifier = Modifier.fillMaxWidth(), minLines = 2, maxLines = 4,
                    )

                    if (followUpId != null) {
                        Text(
                            stringResource(R.string.co_close_follow_up_heading),
                            style = MaterialTheme.typography.labelLarge,
                        )
                        Card(
                            Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surface,
                            ),
                        ) {
                            Row(
                                Modifier.fillMaxWidth().padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(
                                        followUpTitle.ifBlank {
                                            stringResource(R.string.co_close_follow_up_switch)
                                        },
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                    if (followUpDueAt.isNotBlank()) {
                                        val dueLabel = remember(followUpDueAt) {
                                            formatIsoToLocalDateTime(context, followUpDueAt)
                                        }
                                        Text(
                                            stringResource(
                                                if (followUpOverdue) R.string.co_close_follow_up_overdue
                                                else R.string.co_close_follow_up_due,
                                                dueLabel,
                                            ),
                                            style = MaterialTheme.typography.labelSmall,
                                            color = if (followUpOverdue) LocalPyraColors.current.danger
                                            else MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                                Spacer(Modifier.width(8.dp))
                                Switch(checked = closeFollowUp, onCheckedChange = { closeFollowUp = it })
                            }
                        }
                    }

                    if (showPresets) {
                        Text(
                            stringResource(R.string.co_follow_up_label),
                            style = MaterialTheme.typography.labelLarge,
                        )
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FOLLOW_UP_PRESETS.forEach { preset ->
                                PyraChip(
                                    label = stringResource(preset.labelRes),
                                    selected = presetDays == preset.days,
                                    onClick = {
                                        presetDays = if (presetDays == preset.days) null else preset.days
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun formatIsoToLocalDateTime(context: android.content.Context, iso: String): String {
    val millis = runCatching { Instant.parse(iso).toEpochMilli() }.getOrNull() ?: return iso
    val date = Date(millis)
    return "${DateFormat.getDateFormat(context).format(date)} ${DateFormat.getTimeFormat(context).format(date)}"
}
```

- [ ] **Step 7: Build and test**

```bash
./gradlew testDebugUnitTest assembleDebug
```

Expected: BUILD SUCCESSFUL, all tests pass (62 existing + 13 new = 75).

- [ ] **Step 8: Commit**

```bash
git add pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/core/OutcomeForm.kt pyra-calls-app/app/src/test/java/cloud/pyramedia/calls/core/OutcomeFormTest.kt
git commit -F <msgfile> -- pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/core/OutcomeForm.kt pyra-calls-app/app/src/test/java/cloud/pyramedia/calls/core/OutcomeFormTest.kt pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/CallOutcomeActivity.kt pyra-calls-app/app/src/main/res/values/strings.xml
```

Message: `feat(app): outcome sheet asks why, and closes the follow-up with it`

---

## Task 11: Three tabs and per-row actions on «شغل النهاردة»

**Files:**
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/components/LeadRow.kt`
- Modify: `app/src/main/java/cloud/pyramedia/calls/ui/MyDayScreen.kt`
- Modify: `app/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: `MyDayCounts.overdue` (Task 9), `CompleteFollowUpRequest` (Task 9)
- Produces: `LeadRow(..., footer: (@Composable () -> Unit)? = null)`

- [ ] **Step 1: Give `LeadRow` a footer slot**

The two new controls do NOT go on the existing content row. That row already
holds a name, a subtitle, a chip and a 40dp call button; adding two more at
`font_scale 1.5` on a 384dp screen is the same clipping class as B-02 and I-1.
They go on their own full-width row underneath, inside the card.

Change the signature and wrap the content Row in a Column:

```kotlin
@Composable
fun LeadRow(
    name: String,
    chipText: String,
    tone: LeadTone,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    onCall: (() -> Unit)? = null,
    // Optional action strip rendered BELOW the content, full width. Not on the
    // content row: that row already carries name + subtitle + chip + a 40dp
    // call button, and two more controls beside them clip at font_scale 1.5 on
    // a 384dp screen — the same failure as B-02 and I-1.
    footer: (@Composable () -> Unit)? = null,
) {
    val pyra = LocalPyraColors.current
    val toneColor = when (tone) {
        LeadTone.Overdue -> pyra.danger
        LeadTone.Cold -> pyra.cool
        LeadTone.Neutral -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        // IntrinsicSize.Min is what lets the 4dp edge stripe below stretch to
        // the card's own height instead of collapsing to zero.
        Row(Modifier.height(IntrinsicSize.Min)) {
            Box(
                Modifier
                    .width(4.dp)
                    .fillMaxHeight()
                    .background(toneColor),
            )
            Column(Modifier.weight(1f)) {
                Row(
                    Modifier.padding(horizontal = 13.dp, vertical = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            name,
                            style = MaterialTheme.typography.titleSmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (subtitle != null) {
                            Text(
                                subtitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            chipText,
                            style = MaterialTheme.typography.labelSmall,
                            color = toneColor,
                        )
                    }
                    if (onCall != null) {
                        Spacer(Modifier.width(8.dp))
                        Surface(
                            onClick = onCall,
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(40.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    painter = painterResource(R.drawable.ic_call),
                                    contentDescription = stringResource(R.string.cd_call, name),
                                    tint = Color.White,
                                )
                            }
                        }
                    }
                }
                if (footer != null) {
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    footer()
                }
            }
        }
    }
}
```

Note the removed `verticalAlignment = Alignment.CenterVertically` on the OUTER
Row: with a footer present the stripe must span the whole card, and centring
the single Column child does nothing useful.

`LeadRow.kt` imports Material3 symbols one by one (no wildcard), so add:

```kotlin
import androidx.compose.material3.HorizontalDivider
```

`outlineVariant` is a real token in this theme (`Theme.kt:50,75` set it to
`LightOutline`/`DarkOutline`) — it is not a Material baseline leaking through.
The dropdown lives in `MyDayScreen.kt`, not here.

- [ ] **Step 2: Add the strings**

After the existing `my_day_*` block:

```xml
    <string name="my_day_tab_overdue">متأخرة</string>
    <string name="my_day_tab_today">النهاردة</string>
    <string name="my_day_empty_overdue">مفيش متابعات متأخرة — شغل نضيف</string>
    <string name="my_day_empty_today">مفيش متابعات مستحقة النهاردة</string>
    <string name="my_day_action_done">تم</string>
    <string name="my_day_action_more">خيارات أخرى</string>
    <string name="my_day_action_close_no_call">اقفل من غير مكالمة</string>
    <string name="my_day_close_title">اقفل المتابعة</string>
    <string name="my_day_close_reason_duplicate">متابعة مكررة</string>
    <string name="my_day_close_reason_wrong_number">رقم غلط</string>
    <string name="my_day_close_cancel">إلغاء</string>
    <string name="my_day_closed">تم إقفال المتابعة</string>
```

- [ ] **Step 3: Rewrite the loaded branch of `MyDayScreen`**

Replace the `is MyDayState.Loaded -> { … }` branch and the two row composables
with:

```kotlin
            is MyDayState.Loaded -> {
                val d = s.data
                // The server reports counts.overdue = null when its count query
                // failed. Null means "I don't know", NOT zero — fall back to the
                // two-tab layout rather than render a number we can't stand behind.
                val overdueCount = d.counts.overdue
                val threeTabs = overdueCount != null
                // overdue ⊆ follow_ups by construction (an overdue row is past
                // due, so it always satisfies the server's due_at <= now+1d
                // filter). coerceAtLeast(0) is belt and braces.
                val todayCount = if (overdueCount != null) {
                    (d.counts.follow_ups - overdueCount).coerceAtLeast(0)
                } else d.counts.follow_ups

                item {
                    // FlowRow, not Row. Two chips with weight(1f) each were safe;
                    // three are not — that is literally B-02.
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (threeTabs) {
                            PyraChip(
                                label = "${stringResource(R.string.my_day_tab_overdue)} $overdueCount",
                                selected = tab == 0, onClick = { tab = 0 },
                            )
                            PyraChip(
                                label = "${stringResource(R.string.my_day_tab_today)} $todayCount",
                                selected = tab == 1, onClick = { tab = 1 },
                            )
                        } else {
                            PyraChip(
                                label = "${stringResource(R.string.my_day_tab_follow_ups)} ${d.counts.follow_ups}",
                                selected = tab == 0 || tab == 1, onClick = { tab = 0 },
                            )
                        }
                        PyraChip(
                            label = "${stringResource(R.string.my_day_tab_cold)} ${d.counts.going_cold}",
                            selected = tab == 2, onClick = { tab = 2 },
                        )
                    }
                }

                when {
                    tab == 2 -> {
                        item {
                            SectionHeader(
                                stringResource(R.string.my_day_section_going_cold),
                                d.going_cold.size, d.counts.going_cold,
                            )
                        }
                        if (d.going_cold.isEmpty()) {
                            item { EmptySectionCard(stringResource(R.string.my_day_empty_going_cold)) }
                        } else {
                            items(d.going_cold, key = { it.lead_id }) { ColdLeadRow(it, onCall) }
                        }
                    }
                    else -> {
                        // With three tabs the two follow-up tabs split the SAME
                        // capped 20-row array. SectionHeader still shows
                        // "shown of total", so a rep with 108 overdue sees
                        // "20 من 108" and knows the list is a window.
                        val rows = when {
                            !threeTabs -> d.follow_ups
                            tab == 0 -> d.follow_ups.filter { it.status == "overdue" }
                            else -> d.follow_ups.filter { it.status != "overdue" }
                        }
                        val total = when {
                            !threeTabs -> d.counts.follow_ups
                            tab == 0 -> overdueCount ?: rows.size
                            else -> todayCount
                        }
                        val emptyMsg = when {
                            !threeTabs -> stringResource(R.string.my_day_empty_follow_ups)
                            tab == 0 -> stringResource(R.string.my_day_empty_overdue)
                            else -> stringResource(R.string.my_day_empty_today)
                        }
                        item {
                            SectionHeader(
                                stringResource(R.string.my_day_section_follow_ups),
                                rows.size, total,
                            )
                        }
                        if (rows.isEmpty()) {
                            item { EmptySectionCard(emptyMsg) }
                        } else {
                            items(rows, key = { it.id }) { fu ->
                                FollowUpRow(
                                    item = fu,
                                    onCall = onCall,
                                    onDone = { openOutcome(context, fu) },
                                    onCloseNoCall = { pendingClose = fu },
                                )
                            }
                        }
                    }
                }

                item { Spacer(Modifier.height(8.dp)) }
                item {
                    TextButton(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { refreshing = true; fetch(isRefresh = true) },
                        enabled = !refreshing,
                    ) { Text(stringResource(R.string.my_day_refresh)) }
                }
            }
```

Add to the composable's state block, next to `var tab`:

```kotlin
    var pendingClose by remember { mutableStateOf<MyDayFollowUp?>(null) }
    var closing by remember { mutableStateOf(false) }
    val closedMsg = stringResource(R.string.my_day_closed)
```

and change the tab initial value to `mutableIntStateOf(0)` (unchanged) — note
that tab index **2** is now the cold tab in both layouts, so the two-tab
fallback maps `tab == 0 || tab == 1` onto the merged follow-ups chip.

Add the close dialog immediately after the `PyraListScreen { … }` block, still
inside the composable:

```kotlin
    pendingClose?.let { fu ->
        AlertDialog(
            onDismissRequest = { if (!closing) pendingClose = null },
            title = { Text(stringResource(R.string.my_day_close_title)) },
            text = {
                Column {
                    Text(
                        fu.lead_name ?: stringResource(R.string.my_day_unknown_lead),
                        style = MaterialTheme.typography.titleSmall,
                    )
                    Spacer(Modifier.height(12.dp))
                    // Exactly two reasons, and they are the server's whole
                    // enum. "We spoke off-system" does not exist (every
                    // conversation goes through a company line) and "not
                    // interested" is a stage move, not a close — it belongs to
                    // the outcome sheet.
                    TextButton(
                        enabled = !closing,
                        onClick = { closeWith(fu, "duplicate") },
                    ) { Text(stringResource(R.string.my_day_close_reason_duplicate)) }
                    TextButton(
                        enabled = !closing,
                        onClick = { closeWith(fu, "wrong_number") },
                    ) { Text(stringResource(R.string.my_day_close_reason_wrong_number)) }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(enabled = !closing, onClick = { pendingClose = null }) {
                    Text(stringResource(R.string.my_day_close_cancel))
                }
            },
        )
    }
```

and define the two helpers inside the composable, above `PyraListScreen`:

```kotlin
    fun openOutcome(ctx: Context, fu: MyDayFollowUp) {
        ctx.startActivity(
            Intent(ctx, CallOutcomeActivity::class.java)
                .putExtra("lead_id", fu.lead_id.orEmpty())
                .putExtra("lead_name", fu.lead_name.orEmpty())
                .putExtra("follow_up_id", fu.id)
                .putExtra("follow_up_title", fu.title)
                .putExtra("follow_up_due_at", fu.due_at)
                .putExtra("follow_up_overdue", fu.status == "overdue"),
        )
    }

    fun closeWith(fu: MyDayFollowUp, reason: String) {
        closing = true
        scope.launch {
            val res = withContext(Dispatchers.IO) {
                api.completeFollowUp(CompleteFollowUpRequest(follow_up_id = fu.id, reason = reason))
            }
            closing = false
            pendingClose = null
            when (res) {
                is ApiResult.Ok -> {
                    Toast.makeText(context, closedMsg, Toast.LENGTH_SHORT).show()
                    // Refetch rather than mutate the list in place: closing a
                    // follow-up also changes the overdue count AND can move the
                    // lead into "going cold", and the server is the only thing
                    // that knows both.
                    refreshing = true
                    fetch(isRefresh = true)
                }
                is ApiResult.Err -> Toast.makeText(context, res.message, Toast.LENGTH_LONG).show()
                ApiResult.NetworkError -> Toast.makeText(context, netErrorMsg, Toast.LENGTH_LONG).show()
            }
        }
    }
```

Replace `FollowUpRow` with:

```kotlin
@Composable
private fun FollowUpRow(
    item: MyDayFollowUp,
    onCall: (String) -> Unit,
    onDone: () -> Unit,
    onCloseNoCall: () -> Unit,
) {
    val context = LocalContext.current
    val overdue = item.status == "overdue"
    val dueLabel = remember(item.due_at) { formatIsoToLocal(context, item.due_at) }
    var menuOpen by remember { mutableStateOf(false) }
    LeadRow(
        name = item.lead_name ?: stringResource(R.string.my_day_unknown_lead),
        subtitle = item.title.ifBlank { null },
        chipText = stringResource(
            if (overdue) R.string.my_day_overdue_at else R.string.my_day_due_at, dueLabel,
        ),
        tone = if (overdue) LeadTone.Overdue else LeadTone.Neutral,
        onCall = item.phone?.let { p -> { onCall(p) } },
        footer = {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDone, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.my_day_action_done))
                }
                Box {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(
                            Icons.Filled.MoreVert,
                            contentDescription = stringResource(R.string.my_day_action_more),
                        )
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.my_day_action_close_no_call)) },
                            onClick = { menuOpen = false; onCloseNoCall() },
                        )
                    }
                }
            }
        },
    )
}
```

Update the imports at the top of `MyDayScreen.kt` — add:

```kotlin
import android.widget.Toast
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import cloud.pyramedia.calls.core.CompleteFollowUpRequest
```

`CallOutcomeActivity` lives in this same package (`cloud.pyramedia.calls.ui`)
— **do not import it.**

Extend the `@OptIn` to
`@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)`.

Also update the KDoc — the "Two tabs, not the three the design shows" paragraph
is now wrong. Replace it with:

```
 * Three tabs («متأخرة / النهاردة / برد») once the server reports
 * `counts.overdue`; two when it reports null, because a count we cannot stand
 * behind is worse than a coarser one. Each follow-up row carries «تم» (opens
 * the outcome sheet with the follow-up attached) and a «⋯» menu with
 * «اقفل من غير مكالمة» — deliberately a visible menu and not a long-press: a
 * gesture nobody discovers is a feature nobody uses, and the duplicate
 * follow-ups keep piling up while we believe we shipped a fix.
```

- [ ] **Step 4: Build**

```bash
./gradlew testDebugUnitTest assembleDebug
```

Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git commit -F <msgfile> -- pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/components/LeadRow.kt pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/MyDayScreen.kt pyra-calls-app/app/src/main/res/values/strings.xml
```

Message: `feat(app): three tabs on my-day, plus «تم» and close-without-a-call`

---

## Task 12: Dead-session banner + notifications that close the loop

**Files:**
- Create: `app/src/main/java/cloud/pyramedia/calls/core/SessionHealth.kt`
- Create: `app/src/test/java/cloud/pyramedia/calls/core/SessionHealthTest.kt`
- Create: `app/src/main/res/drawable/ic_action_ignore.xml`,
  `app/src/main/res/drawable/ic_action_open_web.xml`
- Modify: `data/AppPrefs.kt`, `sync/SyncWorker.kt`, `ui/PermissionsScreen.kt`,
  `ui/HomeScreen.kt`, `notify/Notifier.kt`, `ui/QuickAddActivity.kt`,
  `res/values/strings.xml`

Closes B-11 (dead session), B-06 (feedback notification left the app),
U-11 (notification action buttons had no icon) and F-04 (the full loop).

**Interfaces:**
- Consumes: `SyncResult.open_follow_up_id` (Task 9)
- Produces: `SessionHealth.next(...)`, `AppPrefs.authFailureStreak`,
  `AppPrefs.sessionDead`, `rememberSessionDead(prefs)`

- [ ] **Step 1: Write the failing test**

Create `app/src/test/java/cloud/pyramedia/calls/core/SessionHealthTest.kt`:

```kotlin
package cloud.pyramedia.calls.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionHealthTest {
    private val fresh = SessionHealth.State(streak = 0, dead = false)

    @Test fun oneAuthFailureIsNotEnough() {
        val s = SessionHealth.next(fresh, ok = false, errorCode = 401)
        assertEquals(1, s.streak)
        assertFalse(s.dead)
    }

    @Test fun twoConsecutiveAuthFailuresKillTheSession() {
        var s = SessionHealth.next(fresh, ok = false, errorCode = 401)
        s = SessionHealth.next(s, ok = false, errorCode = 403)
        assertEquals(2, s.streak)
        assertTrue(s.dead)
    }

    @Test fun successBetweenTwoFailuresResetsTheStreak() {
        var s = SessionHealth.next(fresh, ok = false, errorCode = 401)
        s = SessionHealth.next(s, ok = true, errorCode = null)
        assertEquals(0, s.streak)
        s = SessionHealth.next(s, ok = false, errorCode = 401)
        assertFalse(s.dead)
    }

    @Test fun successRevivesADeadSession() {
        var s = SessionHealth.State(streak = 5, dead = true)
        s = SessionHealth.next(s, ok = true, errorCode = null)
        assertEquals(0, s.streak)
        assertFalse(s.dead)
    }

    // A network drop says nothing about the key — it must not accumulate
    // toward "your session is dead", and it must not clear a real streak
    // either.
    @Test fun networkErrorLeavesTheStateUntouched() {
        val s = SessionHealth.State(streak = 1, dead = false)
        assertEquals(s, SessionHealth.next(s, ok = false, errorCode = null))
    }

    @Test fun nonAuthHttpErrorLeavesTheStateUntouched() {
        val s = SessionHealth.State(streak = 1, dead = false)
        assertEquals(s, SessionHealth.next(s, ok = false, errorCode = 422))
        assertEquals(s, SessionHealth.next(s, ok = false, errorCode = 500))
    }

    @Test fun streakKeepsCountingPastTheThreshold() {
        var s = SessionHealth.State(streak = 2, dead = true)
        s = SessionHealth.next(s, ok = false, errorCode = 401)
        assertEquals(3, s.streak)
        assertTrue(s.dead)
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
./gradlew testDebugUnitTest --tests '*SessionHealthTest*'
```

Expected: compilation failure.

- [ ] **Step 3: Write the module**

Create `app/src/main/java/cloud/pyramedia/calls/core/SessionHealth.kt`:

```kotlin
package cloud.pyramedia.calls.core

/**
 * Consecutive-auth-failure tracker behind the "your session is dead" banner.
 *
 * TWO consecutive failures, not one: a single 401/403 can be a transient
 * server-side blip, and a banner that cries wolf gets ignored the day it is
 * right.
 *
 * The commonest cause of this state is NOT deactivation — it is the rep having
 * logged in on a different handset. The one-active-device rule revokes the old
 * key, so the old phone looks perfectly healthy and silently stops syncing.
 */
object SessionHealth {
    const val DEAD_AFTER_CONSECUTIVE_AUTH_FAILURES = 2

    data class State(val streak: Int, val dead: Boolean)

    /**
     * @param ok whether the call succeeded
     * @param errorCode HTTP status when it failed, or null for a network error
     *
     * A network error and a non-auth HTTP error both return [current]
     * unchanged: neither says anything about whether the device key is still
     * valid, so neither may accumulate toward "dead" nor clear a real streak.
     */
    fun next(current: State, ok: Boolean, errorCode: Int?): State {
        if (ok) return State(streak = 0, dead = false)
        if (errorCode != 401 && errorCode != 403) return current
        val streak = current.streak + 1
        return State(streak = streak, dead = streak >= DEAD_AFTER_CONSECUTIVE_AUTH_FAILURES)
    }
}
```

- [ ] **Step 4: Add the AppPrefs fields**

After the pending-update block in `AppPrefs.kt`:

```kotlin
    // --- Session health (wave C) ---
    //
    // Written ONLY by SyncWorker, via SessionHealth.next(). Same Compose
    // caveat as the pending-update cache above: read it through
    // `rememberSessionDead(prefs)` in ui/PermissionsScreen.kt, never directly
    // from a Composable — a raw SharedPreferences read is not Compose State.

    var authFailureStreak: Int
        get() = prefs.getInt("auth_failure_streak", 0)
        set(v) = prefs.edit().putInt("auth_failure_streak", v).apply()

    var sessionDead: Boolean
        get() = prefs.getBoolean("session_dead", false)
        set(v) = prefs.edit().putBoolean("session_dead", v).apply()
```

and add both keys to `clearSession()`:

```kotlin
    fun clearSession() {
        prefs.edit()
            .remove("device_key").remove("username").remove("display_name")
            .remove("last_synced_call_log_id").remove("install_day_start_millis")
            .remove("last_sync_at_millis")
            // A logged-out device has no session to be dead — leaving these
            // set would greet the next login with a stale red banner.
            .remove("auth_failure_streak").remove("session_dead")
            .apply()
    }
```

- [ ] **Step 5: Record the outcome in `SyncWorker`**

Add the import `import cloud.pyramedia.calls.core.SessionHealth` and, at the
top of `doWork()` after `val api = …`:

```kotlin
        fun noteAuthOutcome(ok: Boolean, errorCode: Int?) {
            val next = SessionHealth.next(
                SessionHealth.State(prefs.authFailureStreak, prefs.sessionDead), ok, errorCode,
            )
            prefs.authFailureStreak = next.streak
            prefs.sessionDead = next.dead
        }
```

Then:

- in the empty-batch branch, replace `api.ping()` with

```kotlin
                val pong = api.ping()
                noteAuthOutcome(pong is ApiResult.Ok, (pong as? ApiResult.Err)?.code)
```

- in the `is ApiResult.Ok ->` sync branch, add `noteAuthOutcome(true, null)` as
  its first statement;
- in the `is ApiResult.Err ->` sync branch, add
  `noteAuthOutcome(false, res.code)` immediately after the `severity`
  computation.

**Do not add an automatic logout.** `clearSession()` drops
`installDayStartMillis` and `lastSyncedCallLogId`, so calls that were logged
but not yet uploaded can be lost. The rep decides when.

- [ ] **Step 6: Add the live mirror**

In `ui/PermissionsScreen.kt`, next to `rememberPendingUpdate`:

```kotlin
/**
 * Live mirror of [AppPrefs.sessionDead] — same idiom, same reason, as
 * [rememberPendingUpdate] directly above: a raw SharedPreferences read is not
 * Compose State, so a flag SyncWorker clears in the background would otherwise
 * leave a stale red banner on screen for the life of the process.
 */
@Composable
fun rememberSessionDead(prefs: AppPrefs): State<Boolean> {
    val state = remember { mutableStateOf(prefs.sessionDead) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { state.value = prefs.sessionDead }
    return state
}
```

Add `import androidx.compose.runtime.State` if not already present.

- [ ] **Step 7: Show the banner on Home**

Add the strings:

```xml
    <string name="home_session_dead_title">الجلسة انتهت</string>
    <string name="home_session_dead_body">التطبيق مش بيزامن المكالمات دلوقتي. غالبًا سجّلت دخول على تليفون تاني. سجّل دخول من هنا عشان يرجع يشتغل.</string>
    <string name="home_session_dead_button">تسجيل الدخول</string>
```

In `HomeScreen.kt`, add `val sessionDead = rememberSessionDead(prefs)` next to
`val pendingUpdate = rememberPendingUpdate(prefs)`, and render the banner
**above** the update banner — a phone that is not syncing at all is a bigger
problem than one that is a version behind:

```kotlin
            if (sessionDead.value) {
                NoticeCard(
                    title = stringResource(R.string.home_session_dead_title),
                    body = stringResource(R.string.home_session_dead_body),
                    action = {
                        Button(
                            colors = ButtonDefaults.buttonColors(
                                containerColor = LocalPyraColors.current.danger,
                            ),
                            onClick = onLogout,
                        ) { Text(stringResource(R.string.home_session_dead_button)) }
                    },
                )
            }
```

`onLogout` is the trailing lambda `HomeScreen` already receives from
`MainActivity` — it flips the tripwire, clears the session and returns to the
login screen, which is exactly the recovery path. Add
`import androidx.compose.material3.ButtonDefaults` and
`import cloud.pyramedia.calls.ui.theme.LocalPyraColors` if absent, and name the
trailing lambda parameter `onLogout` in the signature if it is currently
anonymous.

- [ ] **Step 8: Notifications close the loop**

In `Notifier.kt`, change `showFeedback` to open the app instead of the browser
(B-06) and let `showMatched` carry the follow-up:

```kotlin
    // B-06: the feedback notification used to open the CRM lead page in the
    // browser, which drops the rep out of the app and asks them to log in to
    // the web. It now opens the same in-app outcome sheet the matched-call
    // notification uses — the action being asked for is identical.
    fun showFeedback(context: Context, leadName: String, leadId: String) {
        val open = PendingIntent.getActivity(
            context, leadId.hashCode(),
            Intent(context, CallOutcomeActivity::class.java)
                .putExtra("lead_id", leadId)
                .putExtra("lead_name", leadName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        notifySafe(context, leadId.hashCode(),
            NotificationCompat.Builder(context, CHANNEL_FEEDBACK)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(0xFFC2410C.toInt())
                .setContentTitle(context.getString(R.string.notif_feedback_title))
                .setContentText(context.getString(R.string.notif_feedback_body, leadName))
                .setContentIntent(open)
                .setAutoCancel(true)
                .build())
    }
```

and add a parameter to `showMatched`:

```kotlin
    fun showMatched(
        context: Context,
        leadName: String,
        leadId: String,
        // Wave C: when the matched lead has an open follow-up, carry its id
        // through so the outcome sheet can close it in the same save. This is
        // what makes the whole loop — call, notification, sheet, outcome +
        // stage + close — happen without the rep ever opening a list.
        followUpId: String? = null,
    ) {
        val openOutcome = PendingIntent.getActivity(
            context, leadId.hashCode(),
            Intent(context, CallOutcomeActivity::class.java)
                .putExtra("lead_id", leadId)
                .putExtra("lead_name", leadName)
                .putExtra("follow_up_id", followUpId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        // …rest unchanged…
    }
```

Remove the now-unused `android.net.Uri` import only if `showMatched`'s browser
action no longer needs it — it still does, so **keep it**.

In `SyncWorker.kt`, pass it through:

```kotlin
                            if (connected && owned) {
                                Notifier.showMatched(
                                    applicationContext, r.lead_name, r.lead_id, r.open_follow_up_id,
                                )
                            }
```

In `QuickAddActivity.kt` line 104, change the call to pass the lead id:

```kotlin
                                                Notifier.showFeedback(this@QuickAddActivity, res.data.lead_name, res.data.lead_id)
```

- [ ] **Step 9: Give the notification action buttons real icons (U-11)**

Both `addAction` calls pass icon id `0`. Modern Android phones hide the icon in
the shade so nothing looks broken there — but Wear OS and Android Auto DO
render it, and a zero renders as a gap.

Create `app/src/main/res/drawable/ic_action_ignore.xml` (Material "block"):

```xml
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24"
    android:tint="#FFFFFF">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M12,2C6.48,2 2,6.48 2,12s4.48,10 10,10 10,-4.48 10,-10S17.52,2 12,2zM4,12c0,-4.42 3.58,-8 8,-8 1.85,0 3.55,0.63 4.9,1.69L5.69,16.9C4.63,15.55 4,13.85 4,12zM12,20c-1.85,0 -3.55,-0.63 -4.9,-1.69L18.31,7.1C19.37,8.45 20,10.15 20,12c0,4.42 -3.58,8 -8,8z" />
</vector>
```

Create `app/src/main/res/drawable/ic_action_open_web.xml` (Material
"open_in_new"):

```xml
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24"
    android:tint="#FFFFFF">
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M19,19H5V5h7V3H5c-1.11,0 -2,0.9 -2,2v14c0,1.1 0.89,2 2,2h14c1.1,0 2,-0.9 2,-2v-7h-2v7zM14,3v2h3.59l-9.83,9.83 1.41,1.41L19,6.41V10h2V3h-7z" />
</vector>
```

Both are white silhouettes on transparent — the same rule the status-bar icon
follows. Android tints notification action icons itself; a coloured glyph comes
out as a white blob.

Then in `Notifier.kt`:

```kotlin
                .addAction(R.drawable.ic_action_ignore, context.getString(R.string.notif_ignore_action), ignore)
```

```kotlin
                .addAction(R.drawable.ic_action_open_web, context.getString(R.string.notif_matched_browser_action), openBrowser)
```

- [ ] **Step 10: Build and test**

```bash
./gradlew testDebugUnitTest assembleDebug
```

Expected: BUILD SUCCESSFUL, 82 tests pass.

- [ ] **Step 11: Commit**

```bash
git add pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/core/SessionHealth.kt pyra-calls-app/app/src/test/java/cloud/pyramedia/calls/core/SessionHealthTest.kt pyra-calls-app/app/src/main/res/drawable/ic_action_ignore.xml pyra-calls-app/app/src/main/res/drawable/ic_action_open_web.xml
git commit -F <msgfile> -- pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/core/SessionHealth.kt pyra-calls-app/app/src/test/java/cloud/pyramedia/calls/core/SessionHealthTest.kt pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/data/AppPrefs.kt pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/sync/SyncWorker.kt pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/PermissionsScreen.kt pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/HomeScreen.kt pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/notify/Notifier.kt pyra-calls-app/app/src/main/java/cloud/pyramedia/calls/ui/QuickAddActivity.kt pyra-calls-app/app/src/main/res/drawable/ic_action_ignore.xml pyra-calls-app/app/src/main/res/drawable/ic_action_open_web.xml pyra-calls-app/app/src/main/res/values/strings.xml
```

Message: `feat(app): dead-session banner, and notifications that finish the job`

---

# Phase 4 — Acceptance and release

## Task 13: Audit council, device acceptance, publish

**⚠️ This task cannot be skipped or done on the emulator alone.** Wave A+B
shipped a screen nobody had looked at, and that was tolerable because it was
cosmetic. This screen writes to real customer records.

- [ ] **Step 1: Run the audit council**

Four auditors in parallel over `git diff main...HEAD`, lenses as defined in
Execution Protocol. Then an adversarial pass that tries to refute each
finding. Fix everything that survives.

- [ ] **Step 2: Deploy the server FIRST**

```bash
pnpm run check && pnpm test && pnpm build
```

Merge to `origin/main`, let Coolify deploy, and verify the three endpoints
respond before the phone can reach a version that expects them. **A phone that
self-updates ahead of the server gets screens that 404.**

- [ ] **Step 3: Create the disposable test lead**

Requirements, all three mandatory:
- a phone number that is **callable** and **not on `pyra_ignored_numbers`** —
  check BOTH the agent's list and the fleet-wide `'*'` list, which is what the
  last wave's test call fell foul of;
- `assigned_to` = the agent signed in on the handset;
- an open follow-up on it, so the close path is exercised.

Record every id you create. They all get deleted in Step 6.

- [ ] **Step 4: Run the full loop on the handset**

Install with `adb install -r` (never uninstall — that regenerates `device_id`
and re-ingests today's calls as duplicates).

1. Call the test lead from the phone, answer, hang up.
2. Wait for sync → the «مكالمة مع…» notification appears.
3. Tap it → the outcome sheet opens **with the follow-up attached and the
   switch on**.
4. Pick «غير مهتم» → the reason box appears, the follow-up presets
   **disappear**, Save is disabled until 5 characters are typed.
5. Type a reason, Save.
6. Verify in the DB — all three writes, in one query:

```sql
SELECT activity_type, description, metadata, created_at
FROM pyra_lead_activities WHERE lead_id = '<test lead>' ORDER BY created_at DESC LIMIT 5;

SELECT stage_id, lost_reason, win_probability, next_follow_up, last_contact_at
FROM pyra_sales_leads WHERE id = '<test lead>';

SELECT id, status, completed_at FROM pyra_sales_follow_ups WHERE lead_id = '<test lead>';
```

Expected: a `note` row, a `stage_change` row whose metadata carries
`from_stage`/`to_stage`/`lost_reason`/`changed_by`, a `follow_up_completed`
row; `stage_id = 'ps_zT_9mNvS8qxMq-7d'`, `lost_reason` set,
`win_probability = 0`, `next_follow_up = NULL`; the follow-up `completed`.

7. Open «شغل النهاردة» → three tabs with real counts; the test lead is gone
   from «برد».
8. Test the other path: a second follow-up, «⋯» → «اقفل من غير مكالمة» →
   «متابعة مكررة». Verify the `follow_up_completed` row.
9. At `font_scale 1.5` **and** in landscape **and** in dark mode: the three
   tabs wrap instead of clipping, the reason counter is readable, the row
   footer buttons are reachable, Save stays pinned.

- [ ] **Step 5: Regression-check the web**

Open a lead in the CRM, complete a follow-up from the web UI, and confirm the
timeline row and `next_follow_up` recompute are unchanged from before Task 2.

- [ ] **Step 6: Delete every test row**

The test lead, its activities, its follow-ups, its `pyra_agent_calls` rows.
Confirm each delete with a follow-up SELECT.

- [ ] **Step 7: Bump the version and publish**

In `pyra-calls-app/app/build.gradle.kts`: `versionCode 8`,
`versionName "1.7.0"`.

```bash
pnpm app:publish
```

Non-mandatory (`is_mandatory` defaults false) — habituating reps to a block
destroys its value. Confirm the APK is under 10 MiB.

- [ ] **Step 8: Update the docs**

- `docs/CALL-TRACKING-BACKLOG.md` — mark B-03, B-04, B-05, B-06, B-10, B-11,
  U-11, F-01, F-02, F-03, F-04 closed in v1.7.0.
- `docs/CALL-TRACKING.md` — the new endpoint, the two new `call-outcome`
  fields, `counts.overdue`, `open_follow_up_id`, and the v1.7.0 release row.
- `CLAUDE.md` — add `lib/crm/close-follow-up.ts`,
  `lib/crm/mark-not-interested.ts`, `lib/mobile/outcome-validation.ts` and
  `app/api/mobile/follow-ups/complete/` to the architecture map.
- `.superpowers/sdd/progress-calls-app.md` — wave C ledger.

- [ ] **Step 9: Measure the effect**

Re-run the wave's opening numbers and record them next to the originals:

```sql
SELECT count(*) FROM pyra_sales_follow_ups
WHERE assigned_to IN ('youssef','cosette') AND status = 'overdue';

SELECT count(*) FROM pyra_sales_leads
WHERE stage_id = 'ps_zT_9mNvS8qxMq-7d' AND archived_at IS NULL;
```

Baseline 2026-08-07: **108 overdue**, **16 not-interested**. A week of use
should move both. If neither moves, the feature shipped and nobody found it —
report that rather than assuming success.

- [ ] **Step 10: Commit and push**

```bash
git commit -F <msgfile> -- pyra-calls-app/app/build.gradle.kts docs/CALL-TRACKING.md docs/CALL-TRACKING-BACKLOG.md CLAUDE.md
```

Message: `chore(app): v1.7.0 — wave C, the follow-up loop closes`

---

## Deviations from the spec (state these in the final report)

| Spec | Plan | Why |
|---|---|---|
| §4.3 DB-side `stage_id NOT IN (...)` | JS-side `Set` filter in the same route | NULL-safety becomes structural rather than a comment; avoids composing a second `.or()` on a query that already has one; matches the exclusion idiom already in that route. |
| §3.1 single `closeFollowUp(...)` | Split into `loadFollowUpForClose` + `closeFollowUp` | The two callers authorize differently and both need the row *before* deciding. Keeping ownership out of the helper was already the spec's rule; the split is what makes it possible without passing a callback. |
| §3.2 `win_probability = 0` | Same, but documented as a deliberate divergence from `move-stage` | `move-stage` leaves the probability untouched for custom stages. Writing 0 here is the spec's intent and the right behaviour; the plan names it as a divergence so a reviewer does not "fix" it back. |
| §5.1 "Save locked until a reason is typed" | Locked on the reason rule only; an unpicked outcome still shows the inline error | A dead button with no explanation is worse than an explained rejection. The reason case HAS a visible counter; the outcome case does not. |
| §5.2 «⋯» menu on the row | Menu lives in a **footer row below** the content, not beside the call button | Four controls on one row clips at `font_scale 1.5` on 384dp — the B-02 / I-1 failure class. |
