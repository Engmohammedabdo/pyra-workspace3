# Task 7 Report — `lib/hr/handover.ts` (offboarding handover build + execute)

**Status:** DONE_WITH_CONCERNS (single concern: file is 354 lines, slightly over the 300 soft limit — see below).

**Commit:** `10525c5` — `feat(offboarding): handover build (fail-closed) + execute (service-role reassign/remove)`

## What was built

`lib/hr/handover.ts` exports:

- **`isOpenLeadStage(stageId: string | null): boolean`** — pure. `null` → open; otherwise open iff `stageId` is NOT in `PIPELINE_FINAL_STAGES` (`['stg_closed_won','stg_closed_lost']`). Custom `ps_*` and unknown stages count as open (safe over-inclusion). Does NOT read the empty `pyra_pipeline_stages` table.
- **`buildHandover(serviceClient, username): Promise<HandoverList>`** — reads every WORK/ACCESS/EXTERNAL source still tied to the leaver: open leads (assigned + not archived + open stage), pending/overdue follow-ups, open board tasks, open WhatsApp conversations, non-completed lead-tasks, active direct reports, external task-attachment hosts (warn-only count), and access-row counts (board_members / team_members / wa_settings / favorites).
- **`executeHandover(serviceClient, username, decisions, actor): Promise<HandoverResult>`** — applies the admin's per-item decisions with service-role writes.
- Types: `HandoverItem`, `HandoverList`, `HandoverDecisions`, `HandoverResult`; helper `orThrow`; error class `HandoverReadError` (exported).

## Discipline confirmed in place

- **Fail-CLOSED reads:** every read in `buildHandover` goes through `orThrow`, which throws `HandoverReadError` on any Supabase `{ error }` — a bad column can never read as an empty list. The 4 access-count reads use `Promise.all` of `orThrow` calls (also fail-closed).
- **Best-effort `executeHandover`:** per-source errors are pushed into `errors[]`, never thrown; ACCESS rows (board_members/team_members/agent_whatsapp_settings/favorites) are ALWAYS deleted at the end regardless of decisions; AUDIT rows are never touched.
- **`isAssignableUser` validation:** every reassign/reparent target is run through the local `validate()` wrapper → `isAssignableUser(serviceClient, to)` before any write (writes bypass RLS, so we self-enforce). A missing/non-active target is recorded as an error and the write is skipped.
- Lead reassign fires `notifyBatch` with `type: 'lead_transferred'` (Arabic strings carry `// i18n-exempt:` comments).

## RED → GREEN evidence (`isOpenLeadStage`)

- **RED:** `pnpm test -- --run __tests__/handover.test.ts` → `Failed to resolve import "@/lib/hr/handover". Does the file exist?` (module absent). Suite: 1 file failed, 187 other tests still passing.
- **GREEN:** after writing the module → `Test Files 27 passed`, `Tests 189 passed` (187 → 189; the 2 new `isOpenLeadStage` cases pass). Coordinator independently re-ran the full suite: 189/189 green.

## Board-column approach used

**Three-read fallback (NOT the `pyra_board_columns!inner(is_done_column)` embed).** I deliberately avoided the PostgREST FK-embed alias because a fail-closed read would `throw` and abort the entire exit if the FK relationship on `pyra_tasks.column_id` isn't detectable by PostgREST. Instead:
1. `pyra_task_assignees.task_id` where `username = leaver` (de-duped),
2. `pyra_tasks` `id, title, column_id` where `id IN (...)` AND `is_archived = false`,
3. `pyra_board_columns` `id, is_done_column` for those `column_id`s → a `Set` of done-column ids; a task is open unless its column is a done column (a NULL/unknown column counts as open).

The brief explicitly sanctions this fallback. It costs ~3 extra lines vs the embed but is schema-robust.

## Typed-row / cast adaptations

- `orThrow` returns `(data ?? []) as unknown as T`; each call site casts the result to an explicit row shape (e.g. `{ id: string; name: string | null; stage_id: string | null }[]`) — no `as never` anywhere (strict-safe).
- `PIPELINE_FINAL_STAGES` (typed `PipelineStageId[]`) is cast `as readonly string[]` for `.includes(stageId: string)`.
- `Promise.all([...orThrow])` result cast `as { id: string }[][]` for the access counts.
- Update/delete write results read via `(data ?? [])` / `{ error }` destructuring (no casts needed).

## Line count / concern

`lib/hr/handover.ts` = **354 lines** — slightly over the 300 soft limit (and just over the 350 flag threshold in my instructions, hence DONE_WITH_CONCERNS). Not split on my own initiative per the brief. The brief's suggested split is `handover-build.ts` + `handover-execute.ts` if a future task wants it; the 3-read board-column fallback accounts for ~10–15 of the extra lines vs the embed.

## Gates

- `pnpm test -- --run __tests__/handover.test.ts` → PASS (189/189 in full suite).
- `pnpm run check` (`tsc --noEmit && i18n-check`) → clean (tsc exit 0, verified twice via background runs; new file not in migrated-paths manifest + i18n-exempt comments on the Arabic strings).

## Review Fix

**Commit:** `fix(offboarding): scope handover board-task execute to open tasks + avoid assignee unique-constraint collision`

**Issue (Important, confirmed):** `executeHandover`'s board-task branch read ALL of the
leaver's `pyra_task_assignees` rows (no archived/done-column filter), so
reassign/archive acted on tasks the admin never saw in `buildHandover`'s OPEN-only
list ("what you see is what you act on" violated). Additionally, the reassign was a
single bulk `.update({ username: to }).eq('username', leaver).in('task_id', allIds)`
— since `pyra_task_assignees` has `UNIQUE (task_id, username)`, if `to` was already
co-assigned to even ONE of those tasks, the whole bulk update would violate the
constraint and the entire reassign would silently no-op (error caught, pushed to
`errors[]`, but nothing reassigned).

**Fix:**

1. **New helper `getOpenTaskIds(serviceClient, username, errors)`** (private,
   module-local, placed just above `executeHandover`) — recomputes the leaver's OPEN
   task ids using the EXACT SAME predicate as `buildHandover` (assigned via
   `pyra_task_assignees`, task `is_archived=false`, task's `column_id` not in a
   `is_done_column=true` column; NULL/unknown column counts as open). Unlike
   `buildHandover`'s fail-closed `orThrow`, this is best-effort: any read error is
   pushed to `errors` (prefixed `tasks:`) and the function returns `[]` (skip, don't
   throw — this is `executeHandover`, not `buildHandover`). `buildHandover` itself was
   NOT touched — its `orThrow`-based 3-read logic is untouched and still fail-closed.
2. **Board-task branch now calls `getOpenTaskIds` instead of a raw
   `pyra_task_assignees` select-all** — both the `archive` and `reassign` actions
   operate only on this OPEN id list. `applied.tasks` count now reflects the OPEN
   subset, not the leaver's full assignment count.
3. **Reassign collision avoidance:** before writing, the code SELECTs
   `pyra_task_assignees` for `username = to AND task_id IN (openTaskIds)` to find
   which of the open tasks `to` is already assigned to. Ids are split:
   `toUpdateIds` (target not yet assigned → safe bulk `.update({ username: to })`
   scoped to the leaver's rows for those tasks) and `toDropIds` (target already
   assigned → bulk `.delete()` the leaver's row for those tasks instead, avoiding the
   unique-constraint collision). Both writes are best-effort; either failing pushes to
   `errors[]` and `applied.tasks` is only set when NEITHER errored.
4. **Minor (also fixed):** the leads-reassign pre-read (previously
   `const { data: leadRows } = await ...` with no error check) now destructures
   `{ data: leadRows, error: leadReadError }` and pushes `leads: <message>` to
   `errors[]` on failure instead of silently proceeding with an empty/stale row set.
   The task_assignees pre-read that used to have the same gap in the board-task
   branch was replaced entirely by `getOpenTaskIds`, which already checks every read's
   `{ error }`.

**Verification:**
- `pnpm test -- --run __tests__/handover.test.ts` → PASS, `Test Files 27 passed (27)`,
  `Tests 189 passed (189)` — the `isOpenLeadStage` cases are unchanged and still pass
  (that function was not touched).
- `pnpm run check` (`tsc --noEmit && i18n-check`) → clean (`i18n:check ✓ clean`, tsc
  exit 0).
- New line count: **449 lines** (up from 354; +95 lines, mostly the new
  `getOpenTaskIds` helper + the split-update/delete reassign logic + doc comments).
  Still over the 300-line soft limit — same pre-existing DONE_WITH_CONCERNS note
  applies; no further action taken here per the fix's scope (fix ONLY the Important
  board-task issue, don't restructure the file).

**Untouched (confirmed intact):** `buildHandover`'s fail-closed `orThrow` reads,
`isAssignableUser` validation on every reassign/reparent target, unconditional
ACCESS-row removal at the end of `executeHandover`, no `as never` casts, AUDIT rows
never written to.
