# Remote Production Work Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track remote production employees' work (video editor wael.hany, graphic designer abdelrahman.morshedy) end-to-end — task → review rounds → delivery — with enforced deadline/link discipline, loud notifications (sound + WhatsApp), attendance, and a monthly productivity report.

**Architecture:** Builds ON the existing pipeline-board subsystem (`is_pipeline` boards, `requires_approval` columns, `/advance` + `/approve` endpoints, `pyra_task_stage_history` as metrics source of truth). Adds: link gates on gated columns, `notify()` migration (fixes silently-failing pipeline notifications), a WhatsApp user-send helper, sound/browser alerts in the dashboard bell, two crons, one data migration (board + columns + members + schedules — NO schema changes), a pure metrics lib, and report surfaces (admin + self).

**Tech Stack:** Next.js 15 App Router, Supabase (service-role after permission gate), React Query, jsPDF not needed, Vitest for the metrics lib, Evolution API for WhatsApp, n8n Schedule Triggers for crons.

**Spec:** `docs/superpowers/specs/2026-07-03-remote-production-tracking-design.md`

## Global Constraints

- pnpm ONLY (never npm). Verify each task with `pnpm run check`; run `pnpm build` before each push.
- RTL: `ms-/me-/ps-/pe-/start-/end-/text-start/text-end` — never `ml-/mr-/pl-/pr-/left-/right-`.
- Dark mode pairs mandatory (`bg-{c}-50` → `dark:bg-{c}-950/30` etc.).
- Notifications ONLY via `notify()`/`notifyMany()`/`notifyBatch()` from `@/lib/notifications/notify` — never direct `pyra_notifications` inserts. Real columns are `recipient_username` + `target_path` (verified 2026-07-03); direct inserts with `username`/`link` fail silently.
- Cron endpoints follow the Phase 11/D-7 pattern verbatim: `getExternalAuth` → `cron.<name>` or `*` permission → `createServiceRoleClient()` → per-row try/catch + `logError()`.
- Sensitive aggregates: gate THEN `createServiceRoleClient()` (`hr.view` for the admin report).
- All "today in Dubai" comparisons via `dubaiDayKey()` from `@/lib/utils/format` — never `.toISOString().slice(0,10)`.
- Derived counters, never increments: revision rounds/delivery timestamps are ALWAYS derived from `pyra_task_stage_history` — no counter columns.
- Arabic in SQL: any non-ASCII SQL runs via `pnpm db:query path/to/file.sql` (UTF-8 file), never inline. Re-read rows after writing to confirm glyphs.
- Supabase filter builders: `let query = ...; query = query.eq(...)` — never chain off `const` without reassignment. Never `void <supabase-builder>` without `.then()`/await.
- `board-view-client.tsx` predates the React Query mandate and uses raw `fetch` — match the file's existing style there; new hooks elsewhere use `fetchAPI`/`useQuery`.
- Verified schema facts (2026-07-03): `pyra_task_stage_history(id, task_id, board_id, from_column_id, to_column_id, moved_by, approved_by, time_in_stage interval, created_at)`; `pyra_board_columns` has `column_type varchar`, `requires_approval bool`, `is_done_column bool`; `pyra_task_attachments(id, task_id, file_name, file_url, uploaded_by, review_status, ...)`; `pyra_work_schedules(id, name, name_ar, work_days jsonb, start_time time, end_time time, break_minutes, daily_hours, overtime_multiplier, weekend_multiplier, is_default)`; `pyra_agent_whatsapp_settings(agent_username UNIQUE, sender_instance_name, recipient_phone, is_active)`.
- Both employees are `role='employee'`, `role_id=null` → permissions = BASE_EMPLOYEE only (verified). Task 5 adds the board permissions there.
- Latest migration = 032. This effort adds **033 (data-only)**.

---

### Task 1: WhatsApp user-send helper

**Files:**
- Create: `lib/notifications/whatsapp.ts`

**Interfaces:**
- Consumes: `evolutionClient.sendText(instanceName, { number, text })` from `@/lib/evolution/client`.
- Produces: `sendWhatsAppToUser(supabase: SupabaseClient, username: string, text: string): Promise<boolean>` — used by Tasks 2, 3, 12. Never throws; `false` on any skip/failure.

- [ ] **Step 1: Create the helper**

```ts
// lib/notifications/whatsapp.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { evolutionClient } from '@/lib/evolution/client';

/**
 * Send a WhatsApp text to an internal USER (employee/agent) via their
 * pyra_agent_whatsapp_settings routing row (Phase 11 Refinement model:
 * one shared connected instance can serve many recipients).
 *
 * Two-step lookup (locked contract):
 *   1. settings row (is_active=true) → (sender_instance_name, recipient_phone)
 *   2. pyra_whatsapp_instances → the configured instance must be 'connected'
 *
 * Graceful degradation: never throws, returns false on any skip/failure —
 * callers ALWAYS do the in-app notify() regardless of this result.
 */
export async function sendWhatsAppToUser(
  supabase: SupabaseClient,
  username: string,
  text: string,
): Promise<boolean> {
  try {
    const { data: setting } = await supabase
      .from('pyra_agent_whatsapp_settings')
      .select('sender_instance_name, recipient_phone')
      .eq('agent_username', username)
      .eq('is_active', true)
      .maybeSingle();
    if (!setting?.sender_instance_name || !setting?.recipient_phone) return false;

    const { data: instance } = await supabase
      .from('pyra_whatsapp_instances')
      .select('instance_name')
      .eq('instance_name', setting.sender_instance_name)
      .eq('status', 'connected')
      .maybeSingle();
    if (!instance) {
      console.warn('[sendWhatsAppToUser] instance not connected:', setting.sender_instance_name);
      return false;
    }

    const digits = setting.recipient_phone.replace(/\D/g, '');
    if (digits.length < 7) return false;

    await evolutionClient.sendText(setting.sender_instance_name, { number: digits, text });
    return true;
  } catch (err) {
    console.error('[sendWhatsAppToUser] failed for', username, err);
    return false;
  }
}

/** Production URL for links embedded in WhatsApp message bodies. */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'https://workspace.pyramedia.cloud';
```

- [ ] **Step 2: Type-check**

Run: `pnpm run check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add lib/notifications/whatsapp.ts
git commit -m "feat(production): WhatsApp user-send helper (agent-settings routing)"
```

---

### Task 2: Fix pipeline notifications (notify() migration) + WhatsApp fan-out

**Files:**
- Modify: `lib/notifications/notify.ts` (NotificationType union)
- Modify: `app/api/boards/[id]/tasks/[taskId]/advance/route.ts:110-132`
- Modify: `app/api/boards/[id]/tasks/[taskId]/approve/route.ts:100-121, 166-187`

**Interfaces:**
- Consumes: `sendWhatsAppToUser`, `APP_URL` (Task 1); `notify`/`notifyMany` (existing).
- Produces: new `NotificationType` members used by Tasks 3, 11, 12: `'task_submitted_for_review' | 'task_stage_advanced' | 'task_approved' | 'task_revision_requested' | 'task_delivered' | 'task_overdue' | 'attendance_checkin_reminder'`.

- [ ] **Step 1: Extend the NotificationType union**

In `lib/notifications/notify.ts`, replace the task-lifecycle block:

```ts
  // Task lifecycle
  | 'task_assigned'
  | 'task_due_soon'
  | 'task_status_changed'
  | 'task_comment'
  | 'task_mention'
```

with:

```ts
  // Task lifecycle
  | 'task_assigned'
  | 'task_due_soon'
  | 'task_overdue'
  | 'task_status_changed'
  | 'task_comment'
  | 'task_mention'
  // Production pipeline (2026-07-03 remote-production-tracking)
  | 'task_submitted_for_review'
  | 'task_stage_advanced'
  | 'task_approved'
  | 'task_revision_requested'
  | 'task_delivered'
  // Attendance
  | 'attendance_checkin_reminder'
```

- [ ] **Step 2: Migrate the advance route's broken insert**

In `advance/route.ts`, add imports:

```ts
import { notifyMany } from '@/lib/notifications/notify';
import { sendWhatsAppToUser, APP_URL } from '@/lib/notifications/whatsapp';
```

Replace the whole "Create notification for assignees" block (the `const { data: assignees } = ...` through the `pyra_notifications` insert — lines 110-132) with:

```ts
    // Notify assignees (fixed 2026-07-03: was a direct insert with wrong
    // column names `username`/`link` — silently failed; see notify() docblock)
    const { data: assignees } = await supabase
      .from('pyra_task_assignees')
      .select('username')
      .eq('task_id', taskId);

    const assigneeNames = (assignees || []).map(a => a.username);
    const taskLink = `/dashboard/boards/${boardId}?task=${taskId}`;

    await notifyMany(supabase, assigneeNames, {
      type: 'task_stage_advanced',
      title: `مهمة انتقلت لمرحلة: ${nextCol.name}`,
      message: `المهمة انتقلت إلى "${nextCol.name}"`,
      link: taskLink,
      entity: { type: 'task', id: taskId },
      from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
    });
```

- [ ] **Step 3: Migrate the approve route's two broken inserts + require the reject note**

In `approve/route.ts`, add the same two imports as Step 2. After the `if (!action || ...)` validation add:

```ts
    if (action === 'reject' && !note.trim()) {
      return apiValidationError('ملاحظة التعديل مطلوبة — اكتب ملخص المطلوب تغييره');
    }
```

Replace the approve-branch notification block (lines 100-121) with:

```ts
      const { data: assignees } = await supabase
        .from('pyra_task_assignees')
        .select('username')
        .eq('task_id', taskId);
      const assigneeNames = (assignees || []).map(a => a.username);
      const taskLink = `/dashboard/boards/${boardId}?task=${taskId}`;

      const isDelivery = nextCol.is_done_column === true;
      await notifyMany(supabase, assigneeNames, {
        type: 'task_approved',
        title: `✅ تمت الموافقة: ${task.title}`,
        message: isDelivery
          ? `تمت الموافقة والمهمة اكتملت${note ? ` — ${note}` : ''}`
          : `تمت الموافقة — ${nextCol.name === 'معتمد' ? 'ارفع التسليم النهائي على Drive' : `انتقلت إلى "${nextCol.name}"`}${note ? ` — ${note}` : ''}`,
        link: taskLink,
        entity: { type: 'task', id: taskId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
      for (const u of assigneeNames) {
        if (u === auth.pyraUser.username) continue;
        await sendWhatsAppToUser(supabase, u,
          `✅ تمت الموافقة على: ${task.title}\n${isDelivery ? 'المهمة اكتملت' : 'ارفع التسليم النهائي على Drive وسجّله من الداشبورد'}\n${APP_URL}${taskLink}`);
      }
```

Replace the reject-branch notification block (lines 166-187) with:

```ts
      const { data: assignees } = await supabase
        .from('pyra_task_assignees')
        .select('username')
        .eq('task_id', taskId);
      const assigneeNames = (assignees || []).map(a => a.username);
      const taskLink = `/dashboard/boards/${boardId}?task=${taskId}`;

      await notifyMany(supabase, assigneeNames, {
        type: 'task_revision_requested',
        title: `✏️ مطلوب تعديل: ${task.title}`,
        message: `رجعت المهمة للتنفيذ — ${note}`,
        link: taskLink,
        entity: { type: 'task', id: taskId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
      for (const u of assigneeNames) {
        if (u === auth.pyraUser.username) continue;
        await sendWhatsAppToUser(supabase, u,
          `✏️ مطلوب تعديل على: ${task.title}\nالملاحظة: ${note}\nالتفاصيل على frame.io/التعليقات — ${APP_URL}${taskLink}`);
      }
```

Note: the approve route selects columns without `is_done_column` in one code path — its `cols` select already includes `is_done_column` (line 44). No change needed there.

- [ ] **Step 4: WhatsApp on task assignment**

Find the existing `task_assigned` notify sites:

Run: `grep -rn "'task_assigned'" app/ --include=route.ts`

For each site that notifies a newly-assigned user (expected: the assignees POST route under `app/api/boards/[id]/tasks/[taskId]/assignees/` or `app/api/tasks/`), add directly after its `notify(...)` call (imports as in Step 2):

```ts
    await sendWhatsAppToUser(supabase, assignedUsername,
      `📌 اتعينت على مهمة جديدة: ${taskTitle}\nالموعد النهائي: ${dueDate || 'غير محدد'}\n${APP_URL}/dashboard/boards/${boardId}?task=${taskId}`);
```

(adapt the local variable names to the route's actual variables — the message content and placement after the existing notify are the contract).

- [ ] **Step 5: Verify + commit**

Run: `pnpm run check`
Expected: 0 errors.

```bash
git add lib/notifications/notify.ts "app/api/boards/[id]/tasks/[taskId]/advance/route.ts" "app/api/boards/[id]/tasks/[taskId]/approve/route.ts" app/api
git commit -m "fix(boards): pipeline notifications via notify() + WhatsApp fan-out (were silently failing)"
```

---

### Task 3: Link gates on advance (review link / delivery link)

**Files:**
- Modify: `app/api/boards/[id]/tasks/[taskId]/advance/route.ts`

**Interfaces:**
- Consumes: `column_type` values `'review'` / `'delivery'` (seeded in Task 6).
- Produces: `POST /advance` body contract used by Task 11 UI: `{ review_link?: string, note?: string }` when entering a `review` column; `{ delivery_link?: string }` when entering a `delivery` column. Round number derived from stage history (never stored).

- [ ] **Step 1: Parse body + gate links**

In `advance/route.ts`, the handler currently never reads the body. After `const { id: boardId, taskId } = await ctx.params;` add:

```ts
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const isHttpsUrl = (v: unknown): v is string =>
      typeof v === 'string' && /^https:\/\/.+/i.test(v.trim());
```

After the existing `if (nextCol.requires_approval) { ... }` guard, add:

```ts
    // ── Gated columns: link requirements (remote-production-tracking) ──
    let attachmentToCreate: { name: string; url: string } | null = null;

    if (nextCol.column_type === 'review') {
      if (!isHttpsUrl(body.review_link)) {
        return apiValidationError('رابط المراجعة (frame.io أو Google Drive) مطلوب لرفع المهمة للمراجعة');
      }
      // round number = prior entries into the review column + 1 (derived, never stored)
      const { count } = await supabase
        .from('pyra_task_stage_history')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', taskId)
        .eq('to_column_id', nextCol.id);
      attachmentToCreate = {
        name: `نسخة للمراجعة — جولة ${(count || 0) + 1}`,
        url: (body.review_link as string).trim(),
      };
    }

    if (nextCol.column_type === 'delivery') {
      if (!isHttpsUrl(body.delivery_link)) {
        return apiValidationError('رابط التسليم النهائي على Google Drive مطلوب لإغلاق المهمة');
      }
      attachmentToCreate = {
        name: 'التسليم النهائي',
        url: (body.delivery_link as string).trim(),
      };
    }
```

Note: `nextCol` is typed inline in this file — extend its type annotation with `column_type: string | null` (it is selected in the board query at line 25; add `column_type` to that select: `pyra_board_columns(id, name, position, is_done_column, requires_approval, default_assignee, column_type)`).

- [ ] **Step 2: Create the attachment after a successful move**

After the successful `pyra_tasks` update (`if (moveError) return ...`), add:

```ts
    if (attachmentToCreate) {
      const { error: attError } = await supabase.from('pyra_task_attachments').insert({
        id: generateId('att'),
        task_id: taskId,
        file_name: attachmentToCreate.name,
        file_url: attachmentToCreate.url,
        uploaded_by: auth.pyraUser.username,
      });
      if (attError) console.error('[advance] attachment insert failed:', attError.message);
    }
```

- [ ] **Step 3: Notify admins on review submission (with WhatsApp)**

Still in `advance/route.ts`, after the assignee notification block from Task 2, add:

```ts
    // Entering review → alert active admins (the reviewers) loudly
    if (nextCol.column_type === 'review') {
      const { data: adminRows } = await supabase
        .from('pyra_users')
        .select('username')
        .eq('role', 'admin')
        .eq('status', 'active');
      const adminNames = (adminRows || []).map(a => a.username);

      await notifyMany(supabase, adminNames, {
        type: 'task_submitted_for_review',
        title: `👀 نسخة جاهزة للمراجعة`,
        message: `${auth.pyraUser.display_name} رفع نسخة للمراجعة${body.note ? ` — ${String(body.note).slice(0, 200)}` : ''}`,
        link: taskLink,
        entity: { type: 'task', id: taskId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
      for (const admin of adminNames) {
        if (admin === auth.pyraUser.username) continue;
        await sendWhatsAppToUser(supabase, admin,
          `👀 نسخة جاهزة للمراجعة من ${auth.pyraUser.display_name}\nالرابط: ${attachmentToCreate?.url}\n${APP_URL}${taskLink}`);
      }
    }

    // Entering delivery → alert admins the task closed
    if (nextCol.column_type === 'delivery') {
      const { data: adminRows } = await supabase
        .from('pyra_users')
        .select('username')
        .eq('role', 'admin')
        .eq('status', 'active');
      await notifyMany(supabase, (adminRows || []).map(a => a.username), {
        type: 'task_delivered',
        title: `📦 تم التسليم النهائي`,
        message: `${auth.pyraUser.display_name} سلّم المهمة نهائياً — الفاينل على Drive`,
        link: taskLink,
        entity: { type: 'task', id: taskId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
    }
```

(`taskLink` was defined in Task 2's replacement block; keep a single definition above both blocks.)

- [ ] **Step 4: Verify + commit**

Run: `pnpm run check`
Expected: 0 errors.

```bash
git add "app/api/boards/[id]/tasks/[taskId]/advance/route.ts"
git commit -m "feat(production): advance link gates — review/delivery links required + admin alerts"
```

---

### Task 4: Move route — stage history + gated-column guard

**Files:**
- Modify: `app/api/tasks/[id]/move/route.ts`

**Interfaces:**
- Produces: every cross-column move on a pipeline board writes `pyra_task_stage_history` (metrics completeness); cross-column moves INTO `review`/`delivery`/`requires_approval` columns via raw move are rejected 422 (defense-in-depth under the UI intercept of Task 11).

- [ ] **Step 1: Restructure the board fetch + add the guard**

In `move/route.ts`, the board is currently fetched only inside the `completionPct` branch. Replace the block starting at `// Calculate completion % for pipeline boards` (lines 64-87) with:

```ts
    // Fetch board pipeline flag once (used by guard, history, and completion %)
    const effectiveBoardId = target_board_id || currentTask.board_id;
    let isPipelineBoard = false;
    if (isCrossColumn) {
      const { data: board } = await supabase
        .from('pyra_boards')
        .select('is_pipeline')
        .eq('id', effectiveBoardId)
        .single();
      isPipelineBoard = board?.is_pipeline === true;
    }

    // Pipeline gated columns must go through /advance (link gates) or
    // /approve (admin gate) — a raw drag-move would bypass required links
    // and the approval permission (remote-production-tracking).
    if (isCrossColumn && isPipelineBoard) {
      const { data: targetCol } = await supabase
        .from('pyra_board_columns')
        .select('id, column_type, requires_approval')
        .eq('id', column_id)
        .single();
      if (
        targetCol &&
        (targetCol.column_type === 'review' ||
          targetCol.column_type === 'delivery' ||
          targetCol.requires_approval)
      ) {
        return apiValidationError(
          'هذا العمود له إجراء مخصوص — افتح المهمة واستخدم الزر (رفع للمراجعة / اعتماد / تسليم نهائي)'
        );
      }
    }

    // Calculate completion % for pipeline boards
    let completionPct: number | undefined;
    if (isCrossColumn && isPipelineBoard) {
      const { data: allCols } = await supabase
        .from('pyra_board_columns')
        .select('id, position')
        .eq('board_id', effectiveBoardId)
        .order('position');
      if (allCols) {
        const colIdx = allCols.findIndex(c => c.id === column_id);
        if (colIdx >= 0) {
          completionPct = Math.round(((colIdx + 1) / allCols.length) * 100);
        }
      }
    }
```

- [ ] **Step 2: Write stage history on pipeline cross-column moves**

After the successful `pyra_tasks` update (`if (error) return apiServerError(error.message);`), add:

```ts
    // Record stage history on pipeline boards so drag moves are visible to
    // the productivity metrics (advance/approve already record their own)
    if (isCrossColumn && isPipelineBoard) {
      const { error: histError } = await supabase.from('pyra_task_stage_history').insert({
        id: generateId('sh'),
        task_id: id,
        board_id: effectiveBoardId,
        from_column_id: currentTask.column_id,
        to_column_id: column_id,
        moved_by: auth.pyraUser.username,
      });
      if (histError) console.error('[move] stage history insert failed:', histError.message);
    }
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm run check`
Expected: 0 errors.

```bash
git add "app/api/tasks/[id]/move/route.ts"
git commit -m "feat(production): move route — pipeline stage history + gated-column guard"
```

---

### Task 5: RBAC — board permissions for employees + productivity.view

**Files:**
- Modify: `lib/auth/rbac.ts:797-814` (BASE_EMPLOYEE), PERMISSIONS map, catalogue

**Interfaces:**
- Produces: permission string `'productivity.view'` (own-scope, BASE_EMPLOYEE) used by Task 9's endpoint; `boards.view`/`tasks.view`/`tasks.create` in BASE_EMPLOYEE so both employees can see their member boards and use `/advance`.

- [ ] **Step 1: Add PERMISSIONS entries**

In the `PERMISSIONS` map (near `HR_VIEW: 'hr.view'` at line ~145), add:

```ts
  // Productivity (own-scope monthly stats; admin report is gated by hr.view)
  PRODUCTIVITY_VIEW: 'productivity.view',
```

- [ ] **Step 2: Extend BASE_EMPLOYEE**

In `BASE_EMPLOYEE` (line 797), after `'documents.view',` add:

```ts
  // Boards/tasks self-service — production employees work from their member
  // boards (board list API scopes non-admins to member boards; verified
  // app/api/boards/route.ts:36-41)
  'boards.view',
  'tasks.view',
  'tasks.create',
  'productivity.view',  // own monthly production stats (my-tasks card)
```

- [ ] **Step 3: Add catalogue entry for the role editor**

Find the catalogue block (grep `'tasks.create'` around line 564) and add next to the tasks entries:

```ts
      { key: 'productivity.view', label: 'View Own Productivity', labelAr: 'عرض إنتاجيتي' },
```

- [ ] **Step 4: Verify + commit**

Run: `pnpm run check`
Expected: 0 errors.

```bash
git add lib/auth/rbac.ts
git commit -m "feat(rbac): boards/tasks in BASE_EMPLOYEE + productivity.view"
```

---

### Task 6: Migration 033 — production board + schedules (data-only)

**Files:**
- Create: `supabase/migrations/033_production_board.sql`

**Interfaces:**
- Produces: fixed IDs consumed by later tasks and ops: board `bd_production`; columns `col_prod_new`, `col_prod_wip`, `col_prod_review` (column_type `review`), `col_prod_approved` (requires_approval), `col_prod_done` (is_done_column + column_type `delivery`); schedule `ws_egypt_production`.

- [ ] **Step 1: Write the migration (Arabic content → MUST be a UTF-8 file, never inline)**

```sql
-- 033_production_board.sql
-- Data-only: production pipeline board + members + Egypt work schedule.
-- Remote-production-tracking (spec 2026-07-03). Idempotent (ON CONFLICT DO NOTHING).

INSERT INTO pyra_boards (id, name, description, is_default, position, created_by, view_mode, is_pipeline, auto_advance)
VALUES ('bd_production', 'الإنتاج', 'لوحة تتبع شغل الإنتاج (فيديو + تصميم) للموظفين الريموت — خام → تنفيذ → مراجعة → معتمد → تسليم', false, 99, 'system', 'kanban', true, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO pyra_board_columns (id, board_id, name, color, position, is_done_column, requires_approval, column_type) VALUES
  ('col_prod_new',      'bd_production', 'جديد',          '#6b7280', 0, false, false, 'backlog'),
  ('col_prod_wip',      'bd_production', 'قيد التنفيذ',   '#3b82f6', 1, false, false, 'in_progress'),
  ('col_prod_review',   'bd_production', 'جاهز للمراجعة', '#f59e0b', 2, false, false, 'review'),
  ('col_prod_approved', 'bd_production', 'معتمد',         '#10b981', 3, false, true,  'approved'),
  ('col_prod_done',     'bd_production', 'تم التسليم',    '#22c55e', 4, true,  false, 'delivery')
ON CONFLICT (id) DO NOTHING;

INSERT INTO pyra_board_members (id, board_id, username, role, added_by) VALUES
  ('bm_prod_wael', 'bd_production', 'wael.hany',            'editor', 'system'),
  ('bm_prod_abdo', 'bd_production', 'abdelrahman.morshedy', 'editor', 'system')
ON CONFLICT (id) DO NOTHING;

-- Egypt production schedule. Times are stored in UAE clock (attendance
-- computes "today"/lateness at UTC+4): Egypt 10:00–18:00 = UAE 12:00–20:00.
-- Work week Mon–Sat (company weekend = Sunday only, day 0).
-- Abdou can adjust times later from /dashboard/hr/work-schedules.
INSERT INTO pyra_work_schedules (id, name, name_ar, work_days, start_time, end_time, break_minutes, daily_hours, overtime_multiplier, weekend_multiplier, is_default)
VALUES ('ws_egypt_production', 'Egypt Production', 'دوام الإنتاج — مصر', '[1,2,3,4,5,6]'::jsonb, '12:00', '20:00', 60, 8, 1.5, 1.5, false)
ON CONFLICT (id) DO NOTHING;

UPDATE pyra_users
SET work_schedule_id = 'ws_egypt_production'
WHERE username IN ('wael.hany', 'abdelrahman.morshedy')
  AND (work_schedule_id IS NULL OR work_schedule_id = '');
```

- [ ] **Step 2: Backup, apply, verify Arabic glyphs**

```bash
pnpm db:backup pre-033
pnpm db:query supabase/migrations/033_production_board.sql
pnpm db:query "SELECT id, name FROM pyra_boards WHERE id = 'bd_production'"
pnpm db:query "SELECT id, name, column_type, requires_approval, is_done_column FROM pyra_board_columns WHERE board_id = 'bd_production' ORDER BY position"
pnpm db:query "SELECT username, work_schedule_id FROM pyra_users WHERE username IN ('wael.hany','abdelrahman.morshedy')"
```

Expected: board name renders as proper Arabic (`الإنتاج`, NOT `?????` or mojibake); 5 columns in order; both users assigned `ws_egypt_production`. If glyphs are corrupted, restore from backup and re-run through the .sql file path (never inline).

- [ ] **Step 3: Record + commit**

```bash
pnpm db:record 033 --by=abdou --notes="production board + egypt schedule (data-only)"
git add supabase/migrations/033_production_board.sql
git commit -m "feat(production): migration 033 — production board, members, Egypt schedule (data)"
```

---

### Task 7: Metrics library (pure functions, TDD)

**Files:**
- Create: `lib/production/metrics.ts`
- Test: `__tests__/production-metrics.test.ts`

**Interfaces:**
- Consumes: `dubaiDayKey(date?)` from `@/lib/utils/format`.
- Produces (used by Task 8's report helper):
  - `buildTaskJourney(task: ProductionTaskInput, events: StageEvent[]): TaskJourney`
  - `summarizeEmployee(journeys: TaskJourney[], monthKey: string, todayKey: string): EmployeeProductivity`
  - exported types `StageEvent`, `ProductionTaskInput`, `TaskJourney`, `EmployeeProductivity`.

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/production-metrics.test.ts
import { describe, it, expect } from 'vitest';
import {
  buildTaskJourney,
  summarizeEmployee,
  type ProductionTaskInput,
  type StageEvent,
} from '@/lib/production/metrics';

const TASK: ProductionTaskInput = {
  id: 't1', title: 'فيديو تجريبي', assignee: 'wael.hany',
  due_date: '2026-07-10', created_at: '2026-07-01T08:00:00Z',
  review_column_id: 'col_prod_review', done_column_id: 'col_prod_done',
};

function ev(task_id: string, from: string | null, to: string, at: string): StageEvent {
  return { task_id, from_column_id: from, to_column_id: to, created_at: at };
}

describe('buildTaskJourney', () => {
  it('computes first submission, rounds, delivery, and review waits', () => {
    const events = [
      ev('t1', 'col_prod_new', 'col_prod_wip', '2026-07-01T09:00:00Z'),
      ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-05T10:00:00Z'),   // round 1
      ev('t1', 'col_prod_review', 'col_prod_wip', '2026-07-06T10:00:00Z'),   // rejected after 24h
      ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-07T10:00:00Z'),   // round 2
      ev('t1', 'col_prod_review', 'col_prod_approved', '2026-07-07T16:00:00Z'), // approved after 6h
      ev('t1', 'col_prod_approved', 'col_prod_done', '2026-07-08T09:00:00Z'),
    ];
    const j = buildTaskJourney(TASK, events);
    expect(j.first_submitted_at).toBe('2026-07-05T10:00:00Z');
    expect(j.review_rounds).toBe(2);
    expect(j.delivered_at).toBe('2026-07-08T09:00:00Z');
    expect(j.review_wait_hours).toEqual([24, 6]);
    expect(j.on_time).toBe(true);   // submitted 07-05 <= due 07-10
    expect(j.delay_days).toBeNull();
    expect(j.days_to_first_submission).toBeCloseTo(4.1, 1);
  });

  it('flags late first submission with delay in days (Dubai day of submission)', () => {
    const events = [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-12T10:00:00Z')];
    const j = buildTaskJourney(TASK, events);
    expect(j.on_time).toBe(false);
    expect(j.delay_days).toBe(2); // 07-12 vs due 07-10
  });

  it('uses the DUBAI day for the on-time comparison (UTC 21:00 = next Dubai day)', () => {
    // 2026-07-10T21:00Z is 2026-07-11 in Dubai → late by 1 day
    const events = [ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-10T21:00:00Z')];
    const j = buildTaskJourney(TASK, events);
    expect(j.on_time).toBe(false);
    expect(j.delay_days).toBe(1);
  });

  it('returns null on_time when there is no due date or no submission yet', () => {
    expect(buildTaskJourney({ ...TASK, due_date: null }, [
      ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-05T10:00:00Z'),
    ]).on_time).toBeNull();
    expect(buildTaskJourney(TASK, []).on_time).toBeNull();
    expect(buildTaskJourney(TASK, []).review_rounds).toBe(0);
  });

  it('ignores events belonging to other tasks', () => {
    const events = [ev('OTHER', 'col_prod_wip', 'col_prod_review', '2026-07-05T10:00:00Z')];
    expect(buildTaskJourney(TASK, events).first_submitted_at).toBeNull();
  });
});

describe('summarizeEmployee', () => {
  const delivered = buildTaskJourney(TASK, [
    ev('t1', 'col_prod_wip', 'col_prod_review', '2026-07-05T10:00:00Z'),
    ev('t1', 'col_prod_review', 'col_prod_approved', '2026-07-06T10:00:00Z'),
    ev('t1', 'col_prod_approved', 'col_prod_done', '2026-07-07T09:00:00Z'),
  ]);
  const lateTask = buildTaskJourney(
    { ...TASK, id: 't2', title: 'متأخر', due_date: '2026-07-02' },
    [ev('t2', 'col_prod_wip', 'col_prod_review', '2026-07-05T10:00:00Z')],
  );

  it('counts deliveries and on-time % for the month', () => {
    const s = summarizeEmployee([delivered, lateTask], '2026-07', '2026-07-20');
    expect(s.deliveries).toBe(1);
    expect(s.on_time_pct).toBe(50);   // t1 on time, t2 late
    expect(s.late_count).toBe(1);
    expect(s.avg_delay_days).toBe(3); // 07-05 vs 07-02
    expect(s.avg_rounds).toBe(1);     // only delivered tasks count
  });

  it('excludes tasks from other months', () => {
    const juneTask = buildTaskJourney(
      { ...TASK, id: 't3' },
      [
        ev('t3', 'col_prod_wip', 'col_prod_review', '2026-06-10T10:00:00Z'),
        ev('t3', 'col_prod_review', 'col_prod_done', '2026-06-12T10:00:00Z'),
      ],
    );
    const s = summarizeEmployee([juneTask], '2026-07', '2026-07-20');
    expect(s.deliveries).toBe(0);
    expect(s.on_time_pct).toBeNull();
  });

  it('counts open overdue tasks (due passed, never submitted)', () => {
    const openOverdue = buildTaskJourney(
      { ...TASK, id: 't4', due_date: '2026-07-01' },
      [],
    );
    const s = summarizeEmployee([openOverdue], '2026-07', '2026-07-20');
    expect(s.open_overdue).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test __tests__/production-metrics.test.ts`
Expected: FAIL — cannot resolve `@/lib/production/metrics`.

- [ ] **Step 3: Implement the metrics lib**

```ts
// lib/production/metrics.ts
// Pure functions — NO DB access, NO side effects (mirrors lib/hr/overview-helpers.ts).
// Source of truth for all numbers = pyra_task_stage_history events.
import { dubaiDayKey } from '@/lib/utils/format';

export interface StageEvent {
  task_id: string;
  from_column_id: string | null;
  to_column_id: string;
  created_at: string; // UTC ISO
}

export interface ProductionTaskInput {
  id: string;
  title: string;
  assignee: string;
  due_date: string | null; // YYYY-MM-DD (date-only)
  created_at: string;      // UTC ISO
  review_column_id: string;
  done_column_id: string;
}

export interface TaskJourney {
  task_id: string;
  title: string;
  assignee: string;
  due_date: string | null;
  created_at: string;
  first_submitted_at: string | null;
  delivered_at: string | null;
  review_rounds: number;
  /** one entry per DECIDED round (entered review → left review), in hours */
  review_wait_hours: number[];
  /** null = no due date OR not yet submitted */
  on_time: boolean | null;
  /** whole days late (>0 only when on_time === false) */
  delay_days: number | null;
  days_to_first_submission: number | null;
}

export interface EmployeeProductivity {
  deliveries: number;
  on_time_pct: number | null;
  late_count: number;
  avg_delay_days: number | null;
  avg_rounds: number | null;
  avg_days_to_first_submission: number | null;
  avg_review_wait_hours: number | null;
  /** due date passed, never submitted, not delivered */
  open_overdue: number;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

function monthOf(iso: string): string {
  return dubaiDayKey(new Date(iso)).slice(0, 7);
}

function avg(nums: number[], digits = 1): number | null {
  if (!nums.length) return null;
  const f = 10 ** digits;
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * f) / f;
}

export function buildTaskJourney(
  task: ProductionTaskInput,
  events: StageEvent[],
): TaskJourney {
  const mine = events
    .filter((e) => e.task_id === task.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const reviewEntries = mine.filter((e) => e.to_column_id === task.review_column_id);
  const firstSubmitted = reviewEntries[0]?.created_at ?? null;
  const delivered = mine.find((e) => e.to_column_id === task.done_column_id)?.created_at ?? null;

  const waits: number[] = [];
  for (const entry of reviewEntries) {
    const decision = mine.find(
      (e) => e.from_column_id === task.review_column_id && e.created_at > entry.created_at,
    );
    if (decision) {
      waits.push(
        Math.round(((Date.parse(decision.created_at) - Date.parse(entry.created_at)) / HOUR) * 10) / 10,
      );
    }
  }

  let onTime: boolean | null = null;
  let delayDays: number | null = null;
  if (task.due_date && firstSubmitted) {
    const submittedDay = dubaiDayKey(new Date(firstSubmitted));
    onTime = submittedDay <= task.due_date;
    if (!onTime) {
      delayDays = Math.round((Date.parse(submittedDay) - Date.parse(task.due_date)) / DAY);
    }
  }

  return {
    task_id: task.id,
    title: task.title,
    assignee: task.assignee,
    due_date: task.due_date,
    created_at: task.created_at,
    first_submitted_at: firstSubmitted,
    delivered_at: delivered,
    review_rounds: reviewEntries.length,
    review_wait_hours: waits,
    on_time: onTime,
    delay_days: delayDays,
    days_to_first_submission: firstSubmitted
      ? Math.round(((Date.parse(firstSubmitted) - Date.parse(task.created_at)) / DAY) * 10) / 10
      : null,
  };
}

export function summarizeEmployee(
  journeys: TaskJourney[],
  monthKey: string, // 'YYYY-MM'
  todayKey: string, // dubaiDayKey()
): EmployeeProductivity {
  const deliveredInMonth = journeys.filter(
    (j) => j.delivered_at && monthOf(j.delivered_at) === monthKey,
  );
  const submittedInMonth = journeys.filter(
    (j) => j.first_submitted_at && monthOf(j.first_submitted_at) === monthKey,
  );

  // a task is "active this month" if it was delivered OR first-submitted in it
  const active = new Map<string, TaskJourney>();
  for (const j of [...deliveredInMonth, ...submittedInMonth]) active.set(j.task_id, j);
  const activeJourneys = [...active.values()];

  const onTimeEligible = activeJourneys.filter((j) => j.on_time !== null);
  const onTimeCount = onTimeEligible.filter((j) => j.on_time === true).length;
  const late = onTimeEligible.filter((j) => j.on_time === false);

  return {
    deliveries: deliveredInMonth.length,
    on_time_pct: onTimeEligible.length
      ? Math.round((onTimeCount / onTimeEligible.length) * 100)
      : null,
    late_count: late.length,
    avg_delay_days: avg(late.map((j) => j.delay_days || 0)),
    avg_rounds: avg(deliveredInMonth.map((j) => j.review_rounds)),
    avg_days_to_first_submission: avg(
      submittedInMonth.map((j) => j.days_to_first_submission || 0),
    ),
    avg_review_wait_hours: avg(activeJourneys.flatMap((j) => j.review_wait_hours)),
    open_overdue: journeys.filter(
      (j) => !j.first_submitted_at && !j.delivered_at && j.due_date && j.due_date < todayKey,
    ).length,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test __tests__/production-metrics.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/production/metrics.ts __tests__/production-metrics.test.ts
git commit -m "feat(production): pure metrics lib (journeys + monthly summary) with unit tests"
```

---

### Task 8: Report server helper + admin API + admin page

**Files:**
- Create: `lib/production/report.ts`
- Create: `app/api/hr/productivity/route.ts`
- Create: `hooks/useProductivity.ts`
- Create: `app/dashboard/hr/productivity/page.tsx`
- Create: `app/dashboard/hr/productivity/productivity-client.tsx`
- Modify: `components/layout/sidebar.tsx` (nav item), `lib/config/module-guide.ts` + `app/dashboard/guide/page.tsx` (guide entry)

**Interfaces:**
- Consumes: Task 7 exports; `requireApiPermission`/`createServiceRoleClient`; `fetchAPI`.
- Produces: `computeProductivity(supabase, monthKey, usernames?): Promise<ProductivityReport>` (also used by Task 9); `GET /api/hr/productivity?month=YYYY-MM` → `ProductivityReport`; hooks `useProductivityReport(month)`, `useMyProductivity()`.

- [ ] **Step 1: Server report helper**

```ts
// lib/production/report.ts
// Server-side aggregation for the productivity report. Callers pass a
// service-role client AFTER their own permission gate (hr.view / productivity.view).
import type { SupabaseClient } from '@supabase/supabase-js';
import { dubaiDayKey } from '@/lib/utils/format';
import {
  buildTaskJourney,
  summarizeEmployee,
  type EmployeeProductivity,
  type ProductionTaskInput,
  type StageEvent,
  type TaskJourney,
} from './metrics';

export interface EmployeeReport {
  username: string;
  display_name: string;
  metrics: EmployeeProductivity;
  attendance: {
    present_days: number;
    late_days: number;
    absent_days: number;
    total_hours: number;
  };
  tasks: TaskJourney[];
}

/** Expected work days in the month UP TO todayKey, given a schedule's work_days. */
function countExpectedWorkDays(
  workDays: number[],
  monthKey: string,
  todayKey: string,
): number {
  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  let expected = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
    if (dateStr > todayKey) break;
    const dow = new Date(y, m - 1, d).getDay(); // 0=Sunday
    if (workDays.includes(dow)) expected++;
  }
  return expected;
}

export interface ProductivityReport {
  month: string;
  employees: EmployeeReport[];
}

export async function computeProductivity(
  supabase: SupabaseClient,
  monthKey: string,
  usernames?: string[],
): Promise<ProductivityReport> {
  // 1. pipeline boards → per-board review/done columns
  const { data: boards } = await supabase
    .from('pyra_boards')
    .select('id, pyra_board_columns(id, column_type, is_done_column)')
    .eq('is_pipeline', true);

  const boardCols = new Map<string, { review: string; done: string }>();
  for (const b of boards || []) {
    const cols =
      (b.pyra_board_columns as Array<{
        id: string;
        column_type: string | null;
        is_done_column: boolean | null;
      }>) || [];
    const review = cols.find((c) => c.column_type === 'review');
    const done = cols.find((c) => c.is_done_column);
    if (review && done) boardCols.set(b.id, { review: review.id, done: done.id });
  }
  if (boardCols.size === 0) return { month: monthKey, employees: [] };

  // 2. tasks on those boards + assignees
  const { data: tasks } = await supabase
    .from('pyra_tasks')
    .select('id, title, board_id, due_date, created_at, pyra_task_assignees(username)')
    .in('board_id', [...boardCols.keys()]);

  const taskInputs: ProductionTaskInput[] = [];
  for (const t of tasks || []) {
    const cols = boardCols.get(t.board_id);
    if (!cols) continue;
    const assignees = ((t.pyra_task_assignees as Array<{ username: string }>) || []).map(
      (a) => a.username,
    );
    for (const assignee of assignees) {
      if (usernames && !usernames.includes(assignee)) continue;
      taskInputs.push({
        id: t.id,
        title: t.title,
        assignee,
        due_date: t.due_date,
        created_at: t.created_at,
        review_column_id: cols.review,
        done_column_id: cols.done,
      });
    }
  }

  // 3. stage events for those tasks
  const taskIds = [...new Set(taskInputs.map((t) => t.id))];
  let events: StageEvent[] = [];
  if (taskIds.length) {
    const { data } = await supabase
      .from('pyra_task_stage_history')
      .select('task_id, from_column_id, to_column_id, created_at')
      .in('task_id', taskIds)
      .order('created_at');
    events = (data as StageEvent[]) || [];
  }

  // 4. group per employee
  const byUser = new Map<string, ProductionTaskInput[]>();
  for (const t of taskInputs) {
    const arr = byUser.get(t.assignee) || [];
    arr.push(t);
    byUser.set(t.assignee, arr);
  }
  const userList = usernames?.length ? usernames : [...byUser.keys()];
  if (!userList.length) return { month: monthKey, employees: [] };

  // 5. display names + schedules + month attendance
  const { data: users } = await supabase
    .from('pyra_users')
    .select('username, display_name, work_schedule_id')
    .in('username', userList);

  const scheduleIds = [
    ...new Set((users || []).map((u) => u.work_schedule_id).filter(Boolean)),
  ] as string[];
  const { data: schedules } = scheduleIds.length
    ? await supabase
        .from('pyra_work_schedules')
        .select('id, work_days')
        .in('id', scheduleIds)
    : { data: [] as Array<{ id: string; work_days: unknown }> };

  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const { data: att } = await supabase
    .from('pyra_attendance')
    .select('username, status, total_hours')
    .in('username', userList)
    .gte('date', `${monthKey}-01`)
    .lte('date', `${monthKey}-${String(lastDay).padStart(2, '0')}`);

  const todayKey = dubaiDayKey();
  const employees: EmployeeReport[] = userList.map((username) => {
    const journeys = (byUser.get(username) || [])
      .map((t) => buildTaskJourney(t, events))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const rows = (att || []).filter((r) => r.username === username);
    const user = users?.find((u) => u.username === username);
    const workDays =
      ((schedules || []).find((s) => s.id === user?.work_schedule_id)
        ?.work_days as number[]) || [0, 1, 2, 3, 4];
    const presentDays = rows.filter((r) => r.status === 'present').length;
    const lateDays = rows.filter((r) => r.status === 'late').length;
    const expected = countExpectedWorkDays(workDays, monthKey, todayKey);
    return {
      username,
      display_name: user?.display_name || username,
      metrics: summarizeEmployee(journeys, monthKey, todayKey),
      attendance: {
        present_days: presentDays,
        late_days: lateDays,
        absent_days: Math.max(0, expected - (presentDays + lateDays)),
        total_hours:
          Math.round(rows.reduce((s, r) => s + (r.total_hours || 0), 0) * 10) / 10,
      },
      tasks: journeys,
    };
  });

  return { month: monthKey, employees };
}
```

- [ ] **Step 2: Admin API route**

```ts
// app/api/hr/productivity/route.ts
import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { computeProductivity } from '@/lib/production/report';
import { dubaiDayKey } from '@/lib/utils/format';
import { logError } from '@/lib/observability/log-error';

// =============================================================
// GET /api/hr/productivity?month=YYYY-MM
// Admin productivity report (all production employees).
// Gate-then-service-role (HR aggregator pattern).
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('hr.view');
    if (isApiError(auth)) return auth;

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || dubaiDayKey().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return apiValidationError('صيغة الشهر غير صحيحة — المطلوب YYYY-MM');
    }

    const supabase = createServiceRoleClient();
    const report = await computeProductivity(supabase, month);
    return apiSuccess(report);
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'hr-productivity-report' } });
    console.error('[GET /api/hr/productivity] error:', err);
    return apiServerError();
  }
}
```

- [ ] **Step 3: Hooks**

```ts
// hooks/useProductivity.ts
import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';
import type { ProductivityReport } from '@/lib/production/report';

export type { ProductivityReport };

export function useProductivityReport(month: string) {
  return useQuery<ProductivityReport>({
    queryKey: ['hr-productivity', month],
    queryFn: () => fetchAPI(`/api/hr/productivity?month=${month}`),
    staleTime: 60_000,
  });
}

export function useMyProductivity() {
  return useQuery<ProductivityReport>({
    queryKey: ['my-productivity'],
    queryFn: () => fetchAPI('/api/my-productivity'),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 4: Admin page (server + client)**

```tsx
// app/dashboard/hr/productivity/page.tsx
import { requirePermission } from '@/lib/auth/guards';
import { ProductivityClient } from './productivity-client';

export const metadata = { title: 'تقرير الإنتاجية | Pyra Workspace' };

export default async function ProductivityPage() {
  await requirePermission('hr.view');
  return <ProductivityClient />;
}
```

```tsx
// app/dashboard/hr/productivity/productivity-client.tsx
'use client';

import { useState } from 'react';
import { useProductivityReport } from '@/hooks/useProductivity';
import type { EmployeeReport } from '@/lib/production/report';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils/format';
import { dubaiDayKey } from '@/lib/utils/format';
import { BarChart3, ChevronDown, Clock, PackageCheck, RefreshCcw, Timer } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

function Kpi({ label, value, hint, tone = 'default' }: {
  label: string; value: string; hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  return (
    <div className={cn(
      'rounded-lg border p-3',
      tone === 'good' && 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/30',
      tone === 'warn' && 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/30',
      tone === 'bad' && 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/30',
    )}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function onTimeTone(pct: number | null): 'default' | 'good' | 'warn' | 'bad' {
  if (pct === null) return 'default';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'warn';
  return 'bad';
}

function EmployeeCard({ emp }: { emp: EmployeeReport }) {
  const [open, setOpen] = useState(false);
  const m = emp.metrics;
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{emp.display_name}</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          دوام: {emp.attendance.present_days} حضور · {emp.attendance.late_days} تأخير · {emp.attendance.absent_days} غياب · {emp.attendance.total_hours} ساعة
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <Kpi label="تسليمات مكتملة" value={String(m.deliveries)} />
        <Kpi label="الالتزام بالمواعيد" value={m.on_time_pct === null ? '—' : `${m.on_time_pct}%`} tone={onTimeTone(m.on_time_pct)} hint="على أول رفع للمراجعة" />
        <Kpi label="متوسط التأخير" value={m.avg_delay_days === null ? '—' : `${m.avg_delay_days} يوم`} tone={m.avg_delay_days ? 'warn' : 'default'} hint={`${m.late_count} مهمة متأخرة`} />
        <Kpi label="جولات التعديل" value={m.avg_rounds === null ? '—' : String(m.avg_rounds)} hint="متوسط لكل تسليم" />
        <Kpi label="سرعة أول نسخة" value={m.avg_days_to_first_submission === null ? '—' : `${m.avg_days_to_first_submission} يوم`} hint="من إنشاء المهمة" />
        <Kpi label="انتظار مراجعتك" value={m.avg_review_wait_hours === null ? '—' : `${m.avg_review_wait_hours} س`} hint="متوسط لكل جولة" />
        <Kpi label="متأخرة ولم تُرفع" value={String(m.open_overdue)} tone={m.open_overdue > 0 ? 'bad' : 'default'} />
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        تفاصيل المهام ({emp.tasks.length})
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="p-2 text-start">المهمة</th>
                <th scope="col" className="p-2 text-start">الديدلاين</th>
                <th scope="col" className="p-2 text-start">أول رفع</th>
                <th scope="col" className="p-2 text-start">الالتزام</th>
                <th scope="col" className="p-2 text-start">جولات</th>
                <th scope="col" className="p-2 text-start">التسليم النهائي</th>
              </tr>
            </thead>
            <tbody>
              {emp.tasks.map((t) => (
                <tr key={t.task_id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                  <td className="p-2 font-medium">{t.title}</td>
                  <td className="p-2">{t.due_date ? formatDate(t.due_date) : '—'}</td>
                  <td className="p-2">{t.first_submitted_at ? formatDate(t.first_submitted_at) : '—'}</td>
                  <td className="p-2">
                    {t.on_time === null ? <span className="text-muted-foreground">—</span>
                      : t.on_time ? <Badge className="bg-emerald-500/10 text-emerald-600 border-0">في الموعد</Badge>
                      : <Badge className="bg-red-500/10 text-red-600 border-0">متأخر {t.delay_days} يوم</Badge>}
                  </td>
                  <td className="p-2">{t.review_rounds}</td>
                  <td className="p-2">{t.delivered_at ? formatDate(t.delivered_at) : <span className="text-muted-foreground">لم يُسلم</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function ProductivityClient() {
  const [month, setMonth] = useState(dubaiDayKey().slice(0, 7));
  const { data, isLoading } = useProductivityReport(month);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="size-5 text-orange-500" aria-hidden />
            تقرير الإنتاجية
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            التسليمات والالتزام بالمواعيد وجولات التعديل والدوام — لكل موظف إنتاج
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
          aria-label="اختر الشهر"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !data?.employees.length ? (
        <EmptyState
          icon={PackageCheck}
          title="لا توجد بيانات إنتاج"
          description="لا توجد مهام على لوحة الإنتاج لهذا الشهر بعد"
        />
      ) : (
        data.employees.map((emp) => <EmployeeCard key={emp.username} emp={emp} />)
      )}

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Timer className="size-3" aria-hidden />
        الالتزام يُقاس على أول رفع للمراجعة (قرار مقفول 2026-07-03) — وقت انتظار المراجعة والجولات أرقام منفصلة.
        <RefreshCcw className="size-3 ms-2" aria-hidden />
        الأرقام مشتقة من سجل حركة المهام — لا عدادات مخزنة.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Sidebar + module guide**

In `components/layout/sidebar.tsx`, find the HR admin entries (grep `'/dashboard/hr'`) and add next to the HR overview item:

```ts
      { href: '/dashboard/hr/productivity', label: 'تقرير الإنتاجية', labelEn: 'Productivity', icon: BarChart3, permission: 'hr.view' },
```

(import `BarChart3` from `lucide-react` if not present).

In `lib/config/module-guide.ts`, copy the shape of the `/dashboard/hr` entry and add a `/dashboard/hr/productivity` entry with: description «تقرير شهري لإنتاجية موظفي الإنتاج: التسليمات، الالتزام بالمواعيد، جولات التعديل، سرعة التنفيذ، والدوام»; goal «تعرف آخر الشهر مين سلّم إيه وقد إيه اتأخر ومين شغله بيترجعله»; tips (6+ actionable, per Phase 17 standard):
1. «اختر الشهر من الـ month picker أعلى الصفحة — الافتراضي الشهر الحالي (توقيت دبي)»
2. «"الالتزام بالمواعيد" يُقاس على أول رفع للمراجعة — مش التسليم النهائي — عشان وقت مراجعتك ما يتحسبش على الموظف»
3. «"انتظار مراجعتك" رقمك أنت: متوسط الوقت من رفع النسخة لحد قرارك (اعتماد/تعديل)»
4. «اضغط "تفاصيل المهام" تحت أي موظف لجدول بكل مهمة ورحلتها — كل رقم في الكروت قابل للتتبع لمصدره»
5. «"متأخرة ولم تُرفع" = مهام عدى ديدلاينها من غير أي نسخة مراجعة — دي أول حاجة تسأل عنها»
6. «الأرقام كلها مشتقة من سجل حركة المهام (pyra_task_stage_history) — النقل بالأزرار أو بالسحب الاتنين بيتسجلوا»

Add the href to `app/dashboard/guide/page.tsx` SECTIONS (HR section).

- [ ] **Step 6: Verify + commit**

Run: `pnpm run check && pnpm test __tests__/production-metrics.test.ts`
Expected: 0 type errors; tests pass.

```bash
git add lib/production/report.ts app/api/hr/productivity hooks/useProductivity.ts app/dashboard/hr/productivity components/layout/sidebar.tsx lib/config/module-guide.ts app/dashboard/guide/page.tsx
git commit -m "feat(hr): monthly productivity report — API + admin page + guide"
```

---

### Task 9: Employee self-view (my-productivity)

**Files:**
- Create: `app/api/my-productivity/route.ts`
- Create: `components/dashboard/MyProductivityCard.tsx`
- Modify: `app/dashboard/my-tasks/my-tasks-client.tsx` (mount the card)

**Interfaces:**
- Consumes: `computeProductivity` (Task 8), `useMyProductivity` (Task 8 hook), permission `productivity.view` (Task 5).
- Produces: `GET /api/my-productivity` → `ProductivityReport` scoped to the caller.

- [ ] **Step 1: Self-scope API route**

```ts
// app/api/my-productivity/route.ts
import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { computeProductivity } from '@/lib/production/report';
import { dubaiDayKey } from '@/lib/utils/format';
import { logError } from '@/lib/observability/log-error';

// =============================================================
// GET /api/my-productivity
// Current-month production stats for the CALLING employee only.
// Own-scope is hardcoded server-side (documents.view precedent).
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('productivity.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const month = dubaiDayKey().slice(0, 7);
    const report = await computeProductivity(supabase, month, [auth.pyraUser.username]);
    return apiSuccess(report);
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'my-productivity' } });
    console.error('[GET /api/my-productivity] error:', err);
    return apiServerError();
  }
}
```

- [ ] **Step 2: The card component**

```tsx
// components/dashboard/MyProductivityCard.tsx
'use client';

import { useMyProductivity } from '@/hooks/useProductivity';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="text-center">
      <p className={cn('text-lg font-bold', danger && 'text-red-500')}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

/** Compact current-month stats strip for the my-tasks page. */
export function MyProductivityCard() {
  const { data, isLoading } = useMyProductivity();
  if (isLoading) return <Skeleton className="h-20 w-full" />;

  const me = data?.employees[0];
  if (!me || (me.tasks.length === 0)) return null; // not a production employee — render nothing

  const m = me.metrics;
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="size-4 text-orange-500" aria-hidden />
        <h3 className="text-sm font-semibold">إنتاجيتي هذا الشهر</h3>
      </div>
      <div className="grid grid-cols-5 gap-2">
        <Stat label="تسليمات" value={String(m.deliveries)} />
        <Stat label="الالتزام" value={m.on_time_pct === null ? '—' : `${m.on_time_pct}%`} />
        <Stat label="جولات تعديل" value={m.avg_rounds === null ? '—' : String(m.avg_rounds)} />
        <Stat label="سرعة أول نسخة" value={m.avg_days_to_first_submission === null ? '—' : `${m.avg_days_to_first_submission}ي`} />
        <Stat label="متأخرة بلا رفع" value={String(m.open_overdue)} danger={m.open_overdue > 0} />
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Mount on my-tasks**

In `app/dashboard/my-tasks/my-tasks-client.tsx`: add
`import { MyProductivityCard } from '@/components/dashboard/MyProductivityCard';`
and render `<MyProductivityCard />` directly under the page header (above the existing stats/filter row — locate the header with `grep -n "مهامي" app/dashboard/my-tasks/my-tasks-client.tsx`).

- [ ] **Step 4: Verify + commit**

Run: `pnpm run check`
Expected: 0 errors.

```bash
git add app/api/my-productivity components/dashboard/MyProductivityCard.tsx app/dashboard/my-tasks/my-tasks-client.tsx
git commit -m "feat(production): employee self-productivity card on my-tasks"
```

---

### Task 10: Notification sound + desktop alerts (dashboard-wide)

**Files:**
- Create: `lib/utils/notification-sound.ts`
- Modify: `hooks/useNotifications.ts` (dashboard hook only)
- Modify: `components/layout/NotificationBell.tsx` (mute toggle + permission request)

**Interfaces:**
- Produces: `playNotificationSound()`, `isNotificationSoundEnabled()`, `setNotificationSoundEnabled(on)` — localStorage-persisted, Web Audio chime (no binary asset).

- [ ] **Step 1: Sound util**

```ts
// lib/utils/notification-sound.ts
'use client';

const STORAGE_KEY = 'pyra_notification_sound';

export function isNotificationSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) !== 'off'; // default ON
}

export function setNotificationSoundEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
}

/**
 * Two-tone ascending chime via Web Audio — no audio asset needed.
 * Browsers block audio before the first user gesture; failures are ignored
 * (the visual badge + desktop notification still fire).
 */
export function playNotificationSound(): void {
  if (typeof window === 'undefined' || !isNotificationSoundEnabled()) return;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const tone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    };
    tone(880, 0, 0.18);       // A5
    tone(1174.66, 0.15, 0.22); // D6
    setTimeout(() => { ctx.close().catch(() => undefined); }, 900);
  } catch {
    // audio unavailable — ignore
  }
}
```

- [ ] **Step 2: Wire into the dashboard notifications hook**

In `hooks/useNotifications.ts`:

1. Add import: `import { playNotificationSound } from '@/lib/utils/notification-sound';`
2. Generalize the private `showDesktopNotification` — change its signature to `function showDesktopNotification(title: string, body: string, tag = 'pyra-portal')` and pass `tag` into the `new Notification(...)` options object (replacing the hardcoded `tag: 'pyra-portal'`).
3. In `useNotifications()`, add `const prevUnreadRef = useRef<number | null>(null);` (add `useRef` to the react import) and replace the body of `refresh` success branch:

```ts
      if (json.data) {
        setNotifications(json.data);
        const newCount =
          json.meta?.unread_count ??
          json.data.filter((n: Notification) => !n.is_read).length;
        setUnreadCount(newCount);

        // Loud alert on NEW unread (skip the very first load)
        if (prevUnreadRef.current !== null && newCount > prevUnreadRef.current) {
          playNotificationSound();
          const newest = json.data.find((n: Notification) => !n.is_read);
          if (newest) {
            showDesktopNotification(newest.title, newest.message || '', 'pyra-dashboard');
          }
        }
        prevUnreadRef.current = newCount;
      }
```

- [ ] **Step 3: Mute toggle + permission request in the bell**

In `components/layout/NotificationBell.tsx`:

1. Imports:

```ts
import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { requestNotificationPermission } from '@/hooks/useNotifications';
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
} from '@/lib/utils/notification-sound';
```

2. Inside the component add:

```ts
  const [soundOn, setSoundOn] = useState(() => isNotificationSoundEnabled());
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setNotificationSoundEnabled(next);
  };
```

3. On the `<Popover>` add `onOpenChange={(open) => { if (open) requestNotificationPermission(); }}` — first open asks for browser-notification permission.
4. In the popover header (next to «تعليم الكل كمقروء») add:

```tsx
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleSound}
            title={soundOn ? 'كتم صوت الإشعارات' : 'تفعيل صوت الإشعارات'}
            aria-label={soundOn ? 'كتم صوت الإشعارات' : 'تفعيل صوت الإشعارات'}
          >
            {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />}
          </Button>
```

Note: `requestNotificationPermission` is already exported from `hooks/useNotifications.ts` (verified line 182).

- [ ] **Step 4: Verify + commit**

Run: `pnpm run check`
Expected: 0 errors. Manual check after deploy: trigger any notification → chime + badge; toggle mute → silent.

```bash
git add lib/utils/notification-sound.ts hooks/useNotifications.ts components/layout/NotificationBell.tsx
git commit -m "feat(notifications): sound chime + desktop alerts + mute toggle in dashboard bell"
```

---

### Task 11: Board UI — role-aware pipeline actions + link dialogs + drag intercept

**Files:**
- Modify: `app/dashboard/boards/[id]/board-view-client.tsx` (states ~line 507-519, handlers ~line 567-610, actions JSX ~line 1375-1420, `handleDragEnd` ~line 1643-1706)

**Interfaces:**
- Consumes: Task 3 advance body contract (`review_link`/`delivery_link`/`note`); `boards.manage` for approve visibility; column `column_type` values.

- [ ] **Step 1: New states + canApprove**

Next to the existing pipeline states (line ~507), add:

```tsx
  const [linkDialog, setLinkDialog] = useState<null | 'review' | 'delivery'>(null);
  const [actionLink, setActionLink] = useState('');
  const [actionNote, setActionNote] = useState('');
  const canApprove = hasPermission(session.pyraUser.rolePermissions, 'boards.manage');
```

- [ ] **Step 2: Link-gated advance handler**

After `handleAdvance` add:

```tsx
  const handleAdvanceWithLink = async (kind: 'review' | 'delivery') => {
    if (!board) return;
    const link = actionLink.trim();
    if (!/^https:\/\/.+/i.test(link)) {
      toast.error('الصق رابط صحيح يبدأ بـ https:// (frame.io أو Google Drive)');
      return;
    }
    setAdvancing(true);
    try {
      const res = await fetch(`/api/boards/${board.id}/tasks/${task.id}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          kind === 'review'
            ? { review_link: link, note: actionNote.trim() }
            : { delivery_link: link }
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'فشل في نقل المهمة');
        return;
      }
      toast.success(kind === 'review' ? 'تم رفع النسخة للمراجعة ✓' : 'تم تسجيل التسليم النهائي ✓');
      setLinkDialog(null);
      setActionLink('');
      setActionNote('');
      onUpdate();
      onClose();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setAdvancing(false);
    }
  };
```

- [ ] **Step 3: Replace the Pipeline Actions JSX block (lines 1375-1420)**

```tsx
            {/* ── Pipeline Actions (role-aware, link-gated) ── */}
            {board?.is_pipeline && nextCol && !isLastStage && (
              <div className="pt-3 border-t space-y-2">
                {/* Submit for review — needs a review link */}
                {nextCol.column_type === 'review' && canManage && (
                  linkDialog === 'review' ? (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 space-y-2">
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-300">رابط النسخة (frame.io أو Google Drive)</p>
                      <Input value={actionLink} onChange={e => setActionLink(e.target.value)} placeholder="https://f.io/..." className="h-8 text-xs" dir="ltr" />
                      <Input value={actionNote} onChange={e => setActionNote(e.target.value)} placeholder="ملاحظة اختيارية..." className="h-8 text-xs" />
                      <div className="flex gap-1.5">
                        <Button size="sm" className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-white" disabled={advancing || !actionLink.trim()} onClick={() => handleAdvanceWithLink('review')}>
                          {advancing ? 'جاري...' : 'رفع للمراجعة 👀'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setLinkDialog(null)}>إلغاء</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" className="h-9 text-xs w-full bg-amber-500 hover:bg-amber-600 text-white" onClick={() => setLinkDialog('review')}>
                      👀 رفع للمراجعة
                    </Button>
                  )
                )}

                {/* Approval gate — admin approves/rejects; employee sees waiting state */}
                {nextCol.requires_approval && (
                  canApprove ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                      <GitBranch className="h-4 w-4 text-emerald-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-emerald-700 dark:text-emerald-300">قرار المراجعة — راجع الرابط في المرفقات أولاً</p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {showReject ? (
                          <div className="flex items-center gap-1.5">
                            <Input value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="ملخص التعديلات المطلوبة (إجباري)..." className="h-8 text-xs w-44" />
                            <Button size="sm" variant="destructive" className="h-8 text-xs" disabled={advancing || !rejectNote.trim()} onClick={handleReject}>طلب تعديل ✗</Button>
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowReject(false)}>إلغاء</Button>
                          </div>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" className="h-8 text-xs text-red-500" onClick={() => setShowReject(true)}>طلب تعديل</Button>
                            <Button size="sm" className="h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white" disabled={advancing} onClick={handleAdvance}>
                              {advancing ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري...</> : 'اعتماد ✓'}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-center">
                      <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">⏳ في انتظار مراجعة الأدمن</p>
                    </div>
                  )
                )}

                {/* Final delivery — needs the final Drive link */}
                {nextCol.column_type === 'delivery' && canManage && (
                  linkDialog === 'delivery' ? (
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 space-y-2">
                      <p className="text-xs font-medium text-green-800 dark:text-green-300">رابط الفاينل على Google Drive (فولدر التسليمات)</p>
                      <Input value={actionLink} onChange={e => setActionLink(e.target.value)} placeholder="https://drive.google.com/..." className="h-8 text-xs" dir="ltr" />
                      <div className="flex gap-1.5">
                        <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white" disabled={advancing || !actionLink.trim()} onClick={() => handleAdvanceWithLink('delivery')}>
                          {advancing ? 'جاري...' : 'تسليم نهائي 📦'}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setLinkDialog(null)}>إلغاء</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" className="h-9 text-xs w-full bg-green-600 hover:bg-green-700 text-white" onClick={() => setLinkDialog('delivery')}>
                      📦 تسليم نهائي
                    </Button>
                  )
                )}

                {/* Generic advance for untyped, non-gated columns */}
                {!nextCol.requires_approval && nextCol.column_type !== 'review' && nextCol.column_type !== 'delivery' && canManage && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                    <GitBranch className="h-4 w-4 text-emerald-500 shrink-0" />
                    <p className="flex-1 text-xs text-emerald-700 dark:text-emerald-300">المرحلة التالية: <strong>{nextCol.name}</strong></p>
                    <Button size="sm" className="h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white" disabled={advancing} onClick={handleAdvance}>
                      {advancing ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري...</> : 'نقل للتالي'}
                    </Button>
                  </div>
                )}
              </div>
            )}
```

Note: the `Column` type used for `nextCol` must include `column_type?: string` — it already does (verified `board-view-client.tsx:125`).

- [ ] **Step 4: Drag intercept for gated columns**

In `handleDragEnd`, directly BEFORE the `// Optimistic update` comment (line ~1682), add:

```tsx
    // Pipeline gated columns must go through the task action buttons —
    // the server rejects raw moves into them (see /api/tasks/[id]/move guard)
    if (board?.is_pipeline && task.column_id !== targetColumnId) {
      const targetCol = columns.find((c) => c.id === targetColumnId);
      if (
        targetCol &&
        (targetCol.column_type === 'review' ||
          targetCol.column_type === 'delivery' ||
          targetCol.requires_approval)
      ) {
        toast.info('هذا العمود له إجراء مخصوص — افتح المهمة واستخدم الزر (رفع للمراجعة / اعتماد / تسليم نهائي)');
        return;
      }
    }
```

- [ ] **Step 5: Verify + commit**

Run: `pnpm run check && pnpm build`
Expected: clean build.

```bash
git add "app/dashboard/boards/[id]/board-view-client.tsx"
git commit -m "feat(boards): role-aware pipeline actions — link dialogs, required reject note, drag intercept"
```

---

### Task 12: Crons — deadline reminders + attendance check-in reminder

**Files:**
- Create: `app/api/cron/task-deadline-reminders/route.ts`
- Create: `app/api/cron/attendance-checkin-reminder/route.ts`

**Interfaces:**
- Consumes: `getExternalAuth`, `notify`/`notifyMany`, `sendWhatsAppToUser`/`APP_URL`, `dubaiDayKey`.
- Produces: cron permissions `cron.task-deadline-reminders`, `cron.attendance-checkin-reminder` (the n8n «Integration» key holds `*` so no key change needed).

- [ ] **Step 1: Deadline reminders cron**

```ts
// app/api/cron/task-deadline-reminders/route.ts
import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyMany } from '@/lib/notifications/notify';
import { sendWhatsAppToUser, APP_URL } from '@/lib/notifications/whatsapp';
import { logError } from '@/lib/observability/log-error';
import { dubaiDayKey } from '@/lib/utils/format';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/cron/task-deadline-reminders
// Auth: x-api-key → pyra_api_keys; permission cron.task-deadline-reminders or *
// Schedule: daily 09:00 Asia/Dubai via n8n Schedule Trigger → HTTP Request
//
// Scope: tasks on PIPELINE boards only (is_pipeline=true), with a due_date,
// not archived, not in a done column.
// Buckets: overdue / due today / due tomorrow (Dubai days).
// Dedup: one reminder per task per Dubai day via pyra_notifications
// (type IN task_due_soon|task_overdue, entity_id = task id, created today).
// WhatsApp failure never blocks the in-app notify (graceful degradation).
// ────────────────────────────────────────────────────────────────────────────

interface AssigneeRow { username: string }
interface TaskRow {
  id: string;
  title: string;
  board_id: string;
  column_id: string;
  due_date: string;
  is_archived: boolean | null;
  pyra_task_assignees: AssigneeRow[] | null;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.task-deadline-reminders') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.task-deadline-reminders', 403);
    }

    const supabase = createServiceRoleClient();
    const todayKey = dubaiDayKey();
    const tomorrowKey = dubaiDayKey(new Date(Date.now() + 86_400_000));
    const dayStartUtcIso = new Date(Date.parse(`${todayKey}T00:00:00+04:00`)).toISOString();

    const { data: boards } = await supabase
      .from('pyra_boards')
      .select('id, pyra_board_columns(id, is_done_column)')
      .eq('is_pipeline', true);
    const boardIds = (boards || []).map((b) => b.id);
    if (!boardIds.length) return apiSuccess({ processed: 0 });

    const doneCols = new Set<string>();
    for (const b of boards || []) {
      for (const c of (b.pyra_board_columns as Array<{ id: string; is_done_column: boolean | null }>) || []) {
        if (c.is_done_column) doneCols.add(c.id);
      }
    }

    const { data: tasks } = await supabase
      .from('pyra_tasks')
      .select('id, title, board_id, column_id, due_date, is_archived, pyra_task_assignees(username)')
      .in('board_id', boardIds)
      .not('due_date', 'is', null)
      .lte('due_date', tomorrowKey);

    let processed = 0;
    for (const task of (tasks as TaskRow[]) || []) {
      try {
        if (task.is_archived || doneCols.has(task.column_id)) continue;

        const bucket =
          task.due_date < todayKey ? 'overdue'
          : task.due_date === todayKey ? 'today'
          : 'tomorrow';
        const type = bucket === 'overdue' ? 'task_overdue' : 'task_due_soon';

        // dedup: one reminder per task per Dubai day
        const { count } = await supabase
          .from('pyra_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('entity_id', task.id)
          .in('type', ['task_due_soon', 'task_overdue'])
          .gte('created_at', dayStartUtcIso);
        if ((count || 0) > 0) continue;

        const assignees = (task.pyra_task_assignees || []).map((a) => a.username);
        if (!assignees.length) continue;

        const label =
          bucket === 'overdue' ? `متأخرة عن موعدها (${task.due_date})`
          : bucket === 'today' ? 'موعد تسليمها اليوم'
          : 'موعد تسليمها غداً';
        const title = bucket === 'overdue' ? `⚠️ مهمة متأخرة: ${task.title}` : `⏰ تذكير موعد: ${task.title}`;
        const link = `/dashboard/boards/${task.board_id}?task=${task.id}`;

        await notifyMany(supabase, assignees, {
          type,
          title,
          message: `المهمة "${task.title}" ${label} — ارفع نسخة للمراجعة`,
          link,
          entity: { type: 'task', id: task.id },
        });
        for (const u of assignees) {
          await sendWhatsAppToUser(supabase, u, `${title}\n${label}\n${APP_URL}${link}`);
        }

        if (bucket === 'overdue') {
          const { data: adminRows } = await supabase
            .from('pyra_users')
            .select('username')
            .eq('role', 'admin')
            .eq('status', 'active');
          await notifyMany(supabase, (adminRows || []).map((a) => a.username), {
            type: 'task_overdue',
            title: `مهمة متأخرة: ${task.title}`,
            message: `تجاوزت موعد التسليم (${task.due_date}) — المسؤول: ${assignees.join('، ')}`,
            link,
            entity: { type: 'task', id: task.id },
          });
        }
        processed++;
      } catch (rowErr) {
        logError({ error: rowErr, request, metadata: { action: 'task-deadline-reminder-row', task_id: task.id } });
      }
    }

    return apiSuccess({ processed });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'task-deadline-reminders' } });
    console.error('[cron/task-deadline-reminders] threw:', err);
    return apiServerError();
  }
}
```

- [ ] **Step 2: Attendance check-in reminder cron**

```ts
// app/api/cron/attendance-checkin-reminder/route.ts
import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notifications/notify';
import { sendWhatsAppToUser, APP_URL } from '@/lib/notifications/whatsapp';
import { logError } from '@/lib/observability/log-error';
import { dubaiDayKey } from '@/lib/utils/format';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/cron/attendance-checkin-reminder
// Auth: x-api-key → pyra_api_keys; cron.attendance-checkin-reminder or *
// Schedule: every 30 minutes 08:00–16:00 Asia/Dubai via n8n
//
// Scope: ACTIVE users with a PERSONAL work_schedule_id (assigning a personal
// schedule = opting into reminders; users on the org default are skipped).
// Fires when: today is a work day AND now > schedule start + 15 min AND no
// attendance row today AND not on approved leave. One reminder per user/day
// (dedup via pyra_notifications type=attendance_checkin_reminder + Dubai day).
// ────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.attendance-checkin-reminder') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.attendance-checkin-reminder', 403);
    }

    const supabase = createServiceRoleClient();
    const now = new Date();
    const todayKey = dubaiDayKey(now);
    const dubai = new Date(now.getTime() + 4 * 3_600_000);
    const dowDubai = dubai.getUTCDay(); // 0=Sunday (company weekend)
    const minutesNow = dubai.getUTCHours() * 60 + dubai.getUTCMinutes();
    const dayStartUtcIso = new Date(Date.parse(`${todayKey}T00:00:00+04:00`)).toISOString();
    const GRACE_MINUTES = 15;

    const { data: users } = await supabase
      .from('pyra_users')
      .select('username, work_schedule_id')
      .eq('status', 'active')
      .not('work_schedule_id', 'is', null);
    if (!users?.length) return apiSuccess({ reminded: 0 });

    const scheduleIds = [...new Set(users.map((u) => u.work_schedule_id as string))];
    const { data: schedules } = await supabase
      .from('pyra_work_schedules')
      .select('id, work_days, start_time')
      .in('id', scheduleIds);

    let reminded = 0;
    for (const u of users) {
      try {
        const sched = schedules?.find((s) => s.id === u.work_schedule_id);
        if (!sched?.start_time) continue;

        const workDays = (sched.work_days as number[]) || [];
        if (!workDays.includes(dowDubai)) continue;

        const [h, m] = String(sched.start_time).split(':').map(Number);
        if (Number.isNaN(h) || minutesNow < h * 60 + (m || 0) + GRACE_MINUTES) continue;

        const { data: att } = await supabase
          .from('pyra_attendance')
          .select('id')
          .eq('username', u.username)
          .eq('date', todayKey)
          .maybeSingle();
        if (att) continue;

        const { count: onLeave } = await supabase
          .from('pyra_leave_requests')
          .select('id', { count: 'exact', head: true })
          .eq('username', u.username)
          .eq('status', 'approved')
          .lte('start_date', todayKey)
          .gte('end_date', todayKey);
        if ((onLeave || 0) > 0) continue;

        const { count: already } = await supabase
          .from('pyra_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_username', u.username)
          .eq('type', 'attendance_checkin_reminder')
          .gte('created_at', dayStartUtcIso);
        if ((already || 0) > 0) continue;

        await notify(supabase, {
          to: u.username,
          type: 'attendance_checkin_reminder',
          title: '⏰ تذكير تسجيل الحضور',
          message: 'موعد دوامك بدأ ولم تسجل حضورك بعد — سجل من صفحة الحضور',
          link: '/dashboard/attendance',
        });
        await sendWhatsAppToUser(
          supabase,
          u.username,
          `⏰ تذكير: موعد دوامك بدأ ولم تسجل حضورك بعد.\nسجل من هنا: ${APP_URL}/dashboard/attendance`,
        );
        reminded++;
      } catch (rowErr) {
        logError({ error: rowErr, request, metadata: { action: 'attendance-reminder-row', username: u.username } });
      }
    }

    return apiSuccess({ reminded });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'attendance-checkin-reminder' } });
    console.error('[cron/attendance-checkin-reminder] threw:', err);
    return apiServerError();
  }
}
```

- [ ] **Step 3: Verify + commit**

Run: `pnpm run check`
Expected: 0 errors. Manual smoke after deploy:

```bash
curl -X POST "https://workspace.pyramedia.cloud/api/cron/task-deadline-reminders" -H "x-api-key: <Integration key>"
curl -X POST "https://workspace.pyramedia.cloud/api/cron/attendance-checkin-reminder" -H "x-api-key: <Integration key>"
```

Expected: `{ data: { processed: N } }` / `{ data: { reminded: N } }`.

```bash
git add app/api/cron/task-deadline-reminders app/api/cron/attendance-checkin-reminder
git commit -m "feat(cron): task deadline reminders + attendance check-in reminder (in-app + WhatsApp)"
```

---

### Task 13: Operational wiring (n8n + WhatsApp routing + rollout data)

No code — a rollout checklist executed against production after deploy.

- [ ] **Step 1: n8n schedules** — in the n8n instance, create workflow **PyraHR_Cron** (mirroring PyraCRM_Cron): Schedule Trigger daily 09:00 Asia/Dubai → HTTP Request POST `https://workspace.pyramedia.cloud/api/cron/task-deadline-reminders` with header `x-api-key` = the Integration key; second Schedule Trigger every 30 min (08:00–16:00 Dubai) → POST `/api/cron/attendance-checkin-reminder` same header. Activate.
- [ ] **Step 2: WhatsApp routing rows** — dashboard → الإعدادات → agent WhatsApp settings: add rows for `wael.hany` and `abdelrahman.morshedy` (sender = the connected shared instance, e.g. `pyraai`; recipient = each employee's personal WhatsApp number, digits only; `is_active` ON). Without these rows everything still works in-app — WhatsApp is a graceful add-on.
- [ ] **Step 3: Confirm schedule times with Abdou** — `ws_egypt_production` seeded as UAE 12:00–20:00 (= Egypt 10:00–18:00), Mon–Sat. Adjust from `/dashboard/hr/work-schedules` if their real hours differ.
- [ ] **Step 4: End-to-end dry run** — as admin create a test task on «الإنتاج» (due date tomorrow, assignee wael.hany, raw Drive link attached); as wael (or with Abdou coordinating) verify: sees board + my-tasks → «رفع للمراجعة» requires the link → admin gets loud notification → «طلب تعديل» with note → round 2 → «اعتماد» → «تسليم نهائي» requires Drive link → task closes → `/dashboard/hr/productivity` shows 1 delivery, 2 rounds, on-time ✓. Then delete the test task.
- [ ] **Step 5: Verify employee login basics** — wael.hany can clock in from `/dashboard/attendance`; late status computes vs the 12:00 UAE start.

---

### Task 14: Docs + final verification

**Files:**
- Modify: `CLAUDE.md` (architecture entries + a short locked-decisions section)
- Modify: `docs/superpowers/specs/2026-07-03-remote-production-tracking-design.md` (mark §9 open items resolved)

- [ ] **Step 1: CLAUDE.md architecture entries** — add under the Architecture tree:

```
app/api/hr/productivity/     → Admin productivity report (hr.view gate + service role; metrics derived from pyra_task_stage_history)
app/api/my-productivity/     → Employee own-scope current-month production stats (productivity.view)
app/api/cron/task-deadline-reminders/    → Daily pipeline-task deadline reminders (in-app + WhatsApp; per-task/day dedup)
app/api/cron/attendance-checkin-reminder/ → Check-in reminder for users with personal work schedules (15-min grace)
lib/production/metrics.ts    → Pure journey/summary metrics (unit-tested in __tests__/production-metrics.test.ts)
lib/production/report.ts     → computeProductivity() server aggregation (boards → tasks → stage history → attendance)
lib/notifications/whatsapp.ts → sendWhatsAppToUser() — user-level WA via pyra_agent_whatsapp_settings routing
lib/utils/notification-sound.ts → Web Audio chime + mute persistence (dashboard bell)
hooks/useProductivity.ts     → useProductivityReport(month) + useMyProductivity()
```

And a compact "Remote Production Tracking — Locked Decisions (2026-07-03)" section recording: on-time = first review submission; metrics derived from stage history only (no counters); files stay on Drive/frame.io (links only, no uploads); gated columns (`column_type` review/delivery + requires_approval) must go through advance/approve — raw moves rejected server-side; `boards.view`/`tasks.view`/`tasks.create`/`productivity.view` now in BASE_EMPLOYEE; pipeline notification inserts migrated to `notify()` (the old direct inserts silently failed); frame.io API integration deferred (personal account — v1.1).

- [ ] **Step 2: Spec cleanup** — in the spec's §9, annotate each open item with its finding (stage history has `created_at` ✓; move route did NOT write history — fixed Task 4; pipeline UI existed but admin-only and un-gated — reworked Task 11; wrong-column inserts confirmed — fixed Task 2). Also note one conscious deviation from §4.1: the per-card «مطلوب تعديل» badge was replaced by the mandatory reject-note comment (❌ مطلوب تعديل: …) + loud notification — a per-card badge would need an activity lookup per card render; revisit in v1.1 if the comment signal proves insufficient.

- [ ] **Step 3: Full verification + push**

Run: `pnpm run check && pnpm test && pnpm build`
Expected: all green.

```bash
git add CLAUDE.md docs/
git commit -m "docs: remote production tracking — architecture entries + locked decisions"
git push
```

---

## Post-v1 backlog (recorded in the spec §10)

frame.io webhooks (needs company account), portal client review, Web Push, report export/trends, recurring production tasks from retainer contracts.
