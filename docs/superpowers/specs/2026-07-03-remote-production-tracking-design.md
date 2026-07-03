# Remote Production Work Tracking — Design Spec

**Date:** 2026-07-03
**Status:** Approved by Abdou (brainstorming session)
**Audience:** Video editor (wael.hany) + graphic designer (abdelrahman.morshedy) — remote employees in Egypt; generalizes to any future remote production employee.

---

## 1. Problem

The current production workflow is fully manual and untracked:

1. Abdou uploads raw material to Google Drive, sends the link over WhatsApp.
2. Wael edits, uploads a review copy to frame.io (his personal account), sends the link over WhatsApp.
3. Abdou reviews on frame.io — writes timestamped comments there, or says "تمام" on WhatsApp.
4. Wael uploads the final to a Drive folder, sends the link over WhatsApp.

Consequences: no visibility into what each employee is working on or how far along it is, no deadlines, and no way to answer at month-end: how much was delivered, was it on time, how many revision rounds, and was the employee showing up on time.

## 2. Locked Decisions (from brainstorming, 2026-07-03)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Build on the **existing boards/tasks system**, scoped v1 to the production flow (video + graphics), generalizable to any remote employee | The boards system already has due dates, assignees, comments, attachments, activity history, My Work integration |
| D2 | **Files NEVER uploaded to Pyra.** Google Drive stays the storage; frame.io stays the video-review surface. Pyra stores links only | Abdou's explicit requirement; multi-GB video has no place in app storage |
| D3 | **No frame.io API integration in v1** — the frame.io account is Wael's personal account. Employee pastes the frame.io link and presses a button | Webhook integration requires a company-owned frame.io workspace; deferred to v1.1 (see §10) |
| D4 | Review decision (**approve / request changes**) is recorded in Pyra with an explicit button — detailed frame-level notes stay on frame.io | The decision timestamps are what drive revision-round and review-time metrics |
| D5 | **Notifications must be strong and audible** — in-dashboard sound + browser notification + WhatsApp as a backup channel | Abdou's explicit requirement ("الاشعارات في النظام تكون شغاله كويس وبصوت") |
| D6 | **Attendance enabled** for both employees — they have fixed schedules. Clock-in/out via existing attendance system, work schedules configured per employee | Abdou confirmed fixed schedules; existing system computes lateness automatically |
| D7 | **On-time is measured against the FIRST submission for review**, not the final delivery. Review wait time and revision rounds are tracked as separate metrics | The employee controls the first submission; review latency is Abdou's own metric and must not penalize the employee |
| D8 | Monthly report includes ALL four metric groups: deliveries count, on-time % + avg delay, revision rounds + speed, attendance | Abdou selected all four |

## 3. Existing Infrastructure Reused (discovery findings)

The codebase already contains a **pipeline-board subsystem** that covers most of the review cycle:

| Piece | Where | State |
|---|---|---|
| `pyra_boards.is_pipeline`, `auto_advance` | boards schema | exists |
| `pyra_board_columns.requires_approval`, `approval_role`, `default_assignee`, `column_type`, `is_done_column` | boards schema | exists |
| `pyra_tasks.stage_entered_at`, `completion_percentage`, `due_date`, `start_date` | tasks schema | exists |
| `pyra_task_stage_history` (from/to column, moved_by, approved_by, time_in_stage) | stage-history table | exists — **this is the metrics source of truth** |
| `POST /api/boards/[id]/tasks/[taskId]/advance` — move to next stage, blocked if next requires approval | `app/api/boards/[id]/tasks/[taskId]/advance/route.ts` | exists |
| `POST /api/boards/[id]/tasks/[taskId]/approve` — `{action: 'approve'\|'reject', note}`; approve → next column; reject → previous column + note becomes comment + notification | `app/api/boards/[id]/tasks/[taskId]/approve/route.ts` | exists |
| Per-attachment `review_status` (approved / revision_requested) + review endpoint | `.../attachments/[attId]/review/route.ts`, `task-sheet.tsx` | exists |
| Attendance: clock-in/out, per-employee `pyra_work_schedules`, automatic late detection, monthly summary API | `app/api/dashboard/attendance/*`, `hooks/useAttendance.ts` | exists |
| WhatsApp send via Evolution (`pyra_agent_whatsapp_settings` routing + working cron example) | `lib/evolution/client.ts`, `app/api/cron/follow-up-reminders/route.ts` | exists |
| Cron auth pattern (`getExternalAuth` + `cron.<name>` permission), n8n schedule triggers | Phase 11 / Phase D §7 locks | exists |
| My Work inbox + my-tasks page (overdue/today/this_week buckets) | `app/api/my-work/route.ts`, `app/dashboard/my-tasks/` | exists |

**Known defect found during discovery:** the `advance` and `approve` routes insert notifications directly into `pyra_notifications` using the legacy wrong column names (`username`, `link`) instead of going through `notify()` — per the CLAUDE.md notifications lock these inserts silently fail. Migrating them to `notify()` is in scope (it is load-bearing for this feature's notification requirements).

## 4. Architecture

### 4.1 The production board (data setup, not code)

One board **«الإنتاج»** with `is_pipeline = true` and five columns:

```
📥 جديد → 🎬 قيد التنفيذ → 👀 جاهز للمراجعة → ✅ معتمد → 📦 تم التسليم
```

| Column | `column_type` | `requires_approval` | Notes |
|---|---|---|---|
| جديد | `backlog` | no | Task created here by admin |
| قيد التنفيذ | `in_progress` | no | Employee working; **rejected reviews land back here** with a «مطلوب تعديل» badge |
| جاهز للمراجعة | `review` | — (entering it requires a review link) | Leaving it forward requires approval (admin) |
| معتمد | `approved` | yes (gate on entry) | Approved, awaiting final upload to Drive |
| تم التسليم | `delivery` + `is_done_column = true` | no | Entering it requires the final Drive link |

- Task creation (admin): title + description + **mandatory `due_date`** + assignee + raw-material Drive link as attachment. Labels «فيديو» / «تصميم» for report segmentation.
- Board members: wael.hany, abdelrahman.morshedy (+ admins). Adding a future remote employee = add board member + work schedule. Zero code.
- The «تعديلات» state is represented by the card being back in «قيد التنفيذ» with an open-revision badge (derived from the latest `stage_rejected` activity), NOT a sixth column — the existing approve/reject machinery moves rejects to the *previous* column, and keeping that machinery untouched is worth more than a dedicated column.

### 4.2 Review cycle (extends existing advance/approve)

| Actor | Button (task sheet + drag-intercept) | Behavior |
|---|---|---|
| Employee | **«رفع للمراجعة»** | Extended `advance`: when the target column is `column_type='review'`, a `review_link` (frame.io/Drive URL) is **required** in the body → stored as a task attachment + stage-history entry → notify admin (in-app w/ sound + WhatsApp) |
| Admin | **«اعتماد ✓»** | Existing `approve` `{action:'approve'}` → card moves to «معتمد» → notify employee "ارفع الفاينل" |
| Admin | **«طلب تعديل ✗»** | Existing `approve` `{action:'reject', note}` (note **required** — UI enforces) → card back to «قيد التنفيذ», note becomes comment → notify employee |
| Employee | **«تسليم نهائي»** | Extended `advance`: when the target column is `column_type='delivery'`, a `delivery_link` (final Drive URL) is **required** → stored as attachment → card closes in done column → notify admin |

Drag-and-drop into these gated columns opens the same dialog (reuse of the CRM pipeline `MoveStageConfirmModal` pattern) so no path bypasses the link requirement or the timestamps. Moves recorded by the generic drag `move` route on a pipeline board must also write `pyra_task_stage_history` (verify in plan; restrict or wire as needed).

**Metrics source of truth = `pyra_task_stage_history`** (+ approve/reject activity):
- `first_submitted_at` = first transition INTO the review column
- revision rounds = count of transitions INTO the review column (round N = Nth entry)
- review wait per round = time between entering review and the approve/reject decision
- `delivered_at` = transition into the done column
- No derived counters stored on the task row (derive, never increment — finance lock doctrine applies)

### 4.3 Notifications layer (D5)

1. **Migrate `advance`/`approve` notification inserts to `notify()`** — fixes the silent failure and gives correct deep links.
2. **Sound + browser notifications in the dashboard:** the existing notifications hook polls every 30s; when the unread count increases, play a notification sound and fire a browser `Notification` (permission requested once, per-user mute toggle persisted). Applies to ALL notification types, not just production — a general dashboard upgrade.
3. **WhatsApp fan-out for key production events** via existing `pyra_agent_whatsapp_settings` routing (rows added for both employees): task assigned, submitted for review (→ admin), revision requested (→ employee), approved (→ employee), deadline reminders, attendance reminder. A small server helper `sendWhatsAppToUser(username, text)` wraps the two-step lookup (settings row → connected instance) exactly like the follow-up-reminders cron.
4. **New cron `POST /api/cron/task-deadline-reminders`** (daily, Phase 11/D-7 pattern): open production-board tasks with `due_date` tomorrow → remind assignee; `due_date` today → remind assignee; overdue and not yet first-submitted → notify assignee + admins. Dedup per task/day via `pyra_notifications.entity_id` + Dubai day key (same dedup pattern as contract-expiring alerts). All date math via `dubaiDayKey()`.
5. **New cron `POST /api/cron/attendance-checkin-reminder`** (every 15 min during work hours): active employees with a work schedule and no attendance row today, current time > schedule start + 15 min → in-app + WhatsApp reminder, once per day per employee (notification-dedup as above).

### 4.4 Attendance (D6 — configuration only)

- Create a work schedule per employee with their fixed hours expressed in UAE-clock equivalents (system computes "today" as UTC+4; Egypt hours land within the same UAE date, so this is a pure data-entry convention — e.g. Egypt 10:00 = schedule start 12:00). Assign via `pyra_users.work_schedule_id`.
- No code changes: clock-in button, late detection, and the monthly summary already exist.

### 4.5 Monthly productivity report

**API:** `GET /api/hr/productivity?month=YYYY-MM[&username=]` — `hr.view` gate then service-role (HR aggregator pattern). Computes per employee, from `pyra_task_stage_history` + `pyra_tasks` + attendance summary:

| Metric | Formula |
|---|---|
| Deliveries | count of tasks whose done-column transition ∈ month |
| On-time % | tasks where `first_submitted_at` ≤ `due_date` / tasks with a due date delivered or first-submitted in month |
| Avg delay (late only) | avg(`first_submitted_at` − `due_date`) in days, late tasks only |
| Revision rounds | avg(count of review-column entries) per delivered task |
| Speed | avg(`first_submitted_at` − task `created_at`) |
| Review wait (Abdou's own metric) | avg(decision time − review-entry time) per round |
| Attendance | late days, absent days, total hours (existing summary API) |

Metric computation lives in **pure functions** in `lib/production/metrics.ts` (unit-tested, mirroring `lib/hr/overview-helpers.ts` pattern).

**Admin page:** `/dashboard/hr/productivity` — month picker, per-employee KPI cards, expandable per-task table (each task's full journey: created → submitted → rounds → approved → delivered, with deltas) so every headline number is traceable.

**Employee self-view:** `GET /api/my-productivity` (own-scope, gated by a BASE_EMPLOYEE-level view permission) surfacing the same current-month numbers as a compact card on `/dashboard/my-tasks`. Transparency drives behavior.

### 4.6 Who sees what (4 audiences)

| Audience | Access |
|---|---|
| Admin | Board + approve/reject + report page + all notifications |
| Employee (wael, abdelrahman) | Board (member) + my-tasks + submit/deliver buttons + own attendance + own monthly stats. No access to other employees' reports |
| Sales agent | Unaffected |
| Client (portal) | Out of scope v1 (see §10 — portal review is a future candidate) |

New permissions follow existing conventions; report gate is `hr.view` (admin-only, per HR lock). Employee self-stats use a `*.view` own-scope permission in `BASE_EMPLOYEE`.

## 5. Error handling

- Crons: per-row try/catch + `logError()`; reminder idempotency = notification-dedup by `entity_id` + Dubai day (flag-free); WhatsApp send failure never blocks the in-app notify (graceful-degradation lock from Phase 11 Refinement).
- Advance/approve: link validation server-side (non-empty, `https://` URL); reject requires note server-side (422 with Arabic message).
- Report: months with no data render zeros + empty states, never errors.

## 6. Testing

- Unit tests for `lib/production/metrics.ts` (on-time edge cases: no due date, submitted exactly on due date, multiple rounds, month boundaries in Dubai time).
- `pnpm run check` + `pnpm build` per phase (mandatory workflow).
- Live verification: run one full task lifecycle end-to-end with a test task before rollout to the employees.

## 7. Implementation phases

1. **Phase 1 — Review-cycle core:** extend advance (link requirements by `column_type`), migrate advance/approve to `notify()`, verify/wire stage-history on drag moves, board + columns + members data setup.
2. **Phase 2 — Task-sheet & board UI:** action buttons per role, link dialogs, drag-intercept dialog, revision badge, «الإنتاج» board polish (RTL/dark/empty states).
3. **Phase 3 — Notifications:** sound + browser notifications in dashboard, WhatsApp helper + routing rows, two new crons + n8n schedule triggers.
4. **Phase 4 — Attendance config:** schedules for both employees + clock-in reminder verification (mostly data).
5. **Phase 5 — Reports:** metrics lib + tests, admin report API/page, employee self-view card, module-guide + sidebar + docs.

Each phase: code → `pnpm run check` → `pnpm build` → commit → push (auto-deploy).

## 8. Non-goals (v1)

- Uploading video/design files into Pyra storage — never.
- frame.io API/webhook integration — blocked on a company-owned frame.io account.
- Client-facing review via portal.
- Tying report numbers to evaluations/KPIs/bonus — the report measures; decisions stay human.
- Per-task time tracking (timesheets) for these employees — deliverable-based measurement was chosen.

## 9. Open items to verify during planning (not user decisions)

- `pyra_task_stage_history` exact columns (`created_at` presence) — metrics depend on it.
  **FINDING: confirmed ✓** — `created_at` exists on `pyra_task_stage_history`; the
  metrics lib reads it directly, no migration needed.
- Whether the generic drag `move` route writes stage history on pipeline boards.
  **FINDING: it did NOT** — the plain drag `move` route was silently skipping the
  `pyra_task_stage_history` insert, so drag-moves on a pipeline board left no
  metrics trail. **Fixed in Task 4** (the move route now writes stage history on
  every move, pipeline or not).
- Current pipeline UI coverage in `board-view-client.tsx` (how much of advance/approve is already surfaced).
  **FINDING: the pipeline action UI (advance/approve/reject buttons) existed but
  was admin-only and un-gated** (no `column_type`/`requires_approval` enforcement
  in the UI layer), **AND it targeted `TaskDetailDialog` inside
  `board-view-client.tsx` — a dead component that is never rendered** by the live
  board view. The real, live task dialog is `components/boards/task-sheet.tsx`.
  **Reworked in Task 11**: the pipeline actions (submit-for-review, approve,
  reject, deliver) were rebuilt directly in `task-sheet.tsx` with proper
  role/column-type gating; `TaskDetailDialog` was left untouched (dead-code
  cleanup is a separate pending chip, not part of this feature).
- Confirm the wrong-column notification inserts in advance/approve (migrate regardless).
  **FINDING: confirmed** — both routes inserted directly into
  `pyra_notifications` using the legacy wrong column names (`username`, `link`),
  which silently failed per the existing CLAUDE.md notifications lock.
  **Fixed in Task 2** — both routes migrated to `notify()`.

**Conscious deviation from §4.1 (recorded, not a gap):** the per-card
«مطلوب تعديل» badge described in §4.1 was NOT built as a per-card visual badge.
It was replaced by the mandatory reject-note comment (`❌ مطلوب تعديل: …`,
enforced server-side as a required field on reject) plus a loud notification to
the employee. A real per-card badge would require an activity/stage-history
lookup on every card render across the whole board (N+1-shaped cost); the
comment + notification gives the same "this needs rework" signal without that
cost. Revisit as a v1.1 item if the comment-only signal proves insufficient in
practice.

## 10. v1.1 backlog

- **frame.io webhooks** (V4 API: `file.versioned`, `comment.created`, HMAC-signed) — auto-advance to review + auto revision-round counting; requires migrating to a company frame.io workspace and verifying API availability on its plan ("Tokens"/"Webhooks" visible in the developer portal).
- Client review via portal (replaces frame.io share links for client-facing approvals).
- Web Push (closed-tab notifications) — piggybacks on the deferred Phase 15.2 Commit 3 VAPID work.
- Report PDF/export; multi-month trends.
- Auto-create recurring production tasks (e.g. monthly retainer deliverables) from contracts.
