# Task Time Tracking — Design Spec (2026-07-10)

## Goal

Measure — to the second — how long each production task actually takes, and
**separate the employee's work time from time spent waiting on the reviewer**.
Everything is DERIVED automatically from the stage history the board already
records; no timers, no employee data entry, and it works retroactively on
existing tasks. Give the admin (a) per-task detail, (b) per-employee monthly
aggregates, and (c) a live "stuck task" alert to control flow in both
directions (slow employee AND slow reviewer).

## Why derived, not a timer (locked)

Two ways to "measure time" exist and they answer different questions:
- **Elapsed / flow** (derived from stage timestamps): honest, automatic,
  ungameable, second-precise — but doesn't know "9h of real editing" from
  "spread across 2 days with breaks."
- **Active effort** (start/stop timer): true work seconds — but depends on the
  employee's discipline and is easy to forget/game. Wrong first tool for a
  remote team being held accountable.

Decision: build the **derived, split** model now. A timer can bolt on later
only if true billable effort is ever needed (v1.1).

## Core decisions (locked during brainstorming)

1. **Source = `pyra_task_stage_history`** — already records every column move to
   the second. No timer, no employee input, retroactive on existing tasks, no
   DB migration.
2. **Split by stage role**, classified from `pyra_board_columns.column_type`
   (verified on `bd_production`):

   | column_type | example column | bucket |
   |---|---|---|
   | `backlog` | «جديد» | ⚪ not started (excluded from cycle) |
   | `in_progress` | «قيد التنفيذ» | 🟢 employee active work |
   | `review` | «جاهز للمراجعة» | 🟡 waiting on reviewer (admin) |
   | `approved` | «معتمد» | 🟢 employee active (finalizing / delivering) |
   | `delivery` (is_done_column) | «تم التسليم» | ✅ terminal — cycle ends here |

3. **Business-hours is the PRIMARY unit.** Every duration is clipped to the
   assignee's work window (`pyra_work_schedules.start_time`–`end_time` on
   `work_days`; the weekly rest day and off-hours are excluded). Raw wall-clock
   (24/7) is computed too and exposed behind a "عرض الخام" toggle. Precision:
   seconds.
4. **Rework accumulates.** Each stage's time is SUMMED across all visits — a
   return-for-revision adds to the `in_progress` total. **Cycle time = first
   entry into any non-`backlog` stage (normally `in_progress`) → entry into the
   delivery (done) column** (or `now` if still in-flight).
5. **Three surfaces** (bottleneck report deferred):
   - Per-task breakdown (task sheet)
   - Per-employee monthly aggregates (productivity report)
   - Live aging flag on the board + daily cron alert
6. **Aging thresholds** (business-hours; constants in v1, config UI later):

   | stage | threshold | notify |
   |---|---|---|
   | `in_progress` | > 16h (2 work-days) | assignee + admin |
   | `review` | > 8h (1 work-day) | admin (reviewer's own bottleneck) |

   Card flag: amber at threshold, red at 2×.

## Non-goals (v1.1+)

- Timer / true active-effort seconds.
- Bottleneck ("where does work pile up across the team") report.
- Admin UI for editing thresholds (v1 = constants).
- Public-holiday calendar (only the weekly rest day is excluded; no holiday table exists).

## Architecture

### Pure core — `lib/production/time-tracking.ts` (new, unit-tested)

Mirrors the existing pure-helper pattern (`lib/production/metrics.ts`,
`lib/hr/attendance-policy.ts`) — no DB, no side effects.

- `businessSecondsBetween(startIso, endIso, schedule): number`
  Seconds inside the work window (`start_time`–`end_time` on `work_days`)
  between two UTC timestamps, UAE wall-clock (UTC+4, no DST). Handles nights,
  the weekly rest day, partial windows, and multi-day spans. Returns 0 for
  zero/negative spans.
- `computeTaskTime(input): TaskTime` — replays a task's sorted stage events,
  classifies each interval by the DESTINATION column's `column_type`, and sums
  both business and raw seconds per bucket:

  ```
  TaskTime = {
    active_seconds, review_seconds, cycle_seconds,        // business-hours
    raw_active_seconds, raw_review_seconds, raw_cycle_seconds,
    rework_rounds,                                          // # of review entries
    current_stage,            // 'backlog'|'in_progress'|'review'|'approved'|'done'|null
    current_stage_seconds,    // business-hours, LIVE (now − stage_entered)
    first_started_at, delivered_at,
  }
  ```

  Inputs: `stageEvents` (sorted asc), `columnTypeById` map, `schedule`,
  `nowIso`. Active buckets = `in_progress` + `approved`; waiting = `review`;
  cycle = first non-`backlog` entry → delivery entry (or `now` if in-flight).

### Data sources (all existing — nothing new stored)

- `pyra_task_stage_history` (task_id, from/to column id, created_at)
- `pyra_board_columns` (id, column_type, is_done_column)
- `pyra_work_schedules` (start_time, end_time, work_days) — via the assignee's `work_schedule_id`
- Assignee = the task's primary (first) `pyra_task_assignees` row; multi-assignee
  tasks use the primary's schedule (documented simplification).

### Surface 1 — per-task breakdown

- `GET /api/tasks/[id]/time` (new; gate `tasks.view` + `checkTaskScope`) →
  returns `TaskTime`.
- Hook `useTaskTime(taskId)`; panel in `components/boards/task-sheet.tsx` (see
  the approved mockup: cycle-time hero, 🟢 active / 🟡 review-wait tiles, stacked
  bar, rework-rounds + live "قاعد في … من X" line). "عرض الخام" toggles
  business↔raw client-side (both are in the response).

### Surface 2 — per-employee monthly

- Extend `lib/production/report.ts::computeProductivity`: per employee add
  `avg_cycle_seconds`, `avg_active_seconds`, `avg_review_wait_seconds`
  (over the month's delivered/active tasks). Surface in the productivity report
  UI beside the existing KPIs, with the "review-wait" framed as the reviewer's
  latency signal.

### Surface 3 — live aging + alert

- `GET /api/boards/[id]/tasks` response gains `current_stage_seconds` +
  `aging: 'ok'|'warn'|'over'` per task (from `stage_entered_at` + schedule +
  the stage's threshold). Board card renders the flag.
- New cron `POST /api/cron/task-aging-check` — Phase-11 cron pattern
  (`getExternalAuth` + `cron.task-aging-check` or `*`, service role): scans
  in-flight pipeline tasks, computes current-stage business-hours, and
  `notify()`s when over threshold (recipient per the table above). Per-task/day
  dedup via `pyra_notifications.entity_id` (as other crons). n8n daily trigger.

### Constants — `lib/constants/production.ts` (new)

```ts
export const AGING_THRESHOLDS = { in_progress: 16 * 3600, review: 8 * 3600 }; // business-seconds
export const AGING_RED_MULTIPLIER = 2;
```

## Edge cases

- No stage history → all zero; `current_stage` from `task.column_id`.
- Open (undelivered) task → `cycle_seconds` is live (first-started → now).
- Task that never hit `in_progress` (e.g. created straight in review) →
  `active_seconds` 0; cycle starts at first non-backlog entry.
- Missing assignee schedule → fall back to the default (`is_default`) schedule.
- Zero/reversed interval → 0 seconds.
- DST: none (UAE is a fixed UTC+4).

## Testing

`__tests__/time-tracking.test.ts`:
- `businessSecondsBetween`: same-day within window; overnight; across the weekly
  rest day; multi-day; starts/ends outside the window; zero/reversed.
- `computeTaskTime`: simple straight-through; one rework; two reworks
  (accumulation); open/in-flight task; skipped-stage; `approved` counted as
  active.

## Rollout order

1. Pure lib + unit tests.
2. Per-task endpoint + task-sheet panel + hook.
3. Productivity-report extension (per-employee aggregates).
4. Board aging fields + card flag.
5. `task-aging-check` cron + n8n daily trigger.

No DB migration (all derived); no backfill (stage history already exists).
