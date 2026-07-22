import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  compareIsoInstants,
  isUnverifiedProductionDeadline,
  isValidIsoInstant,
  legacyDubaiDayEndToIso,
} from '@/lib/production/deadlines';
import {
  chunkValues,
  collectCursorPages,
  MY_WORK_TASK_PAGE_SIZE,
} from '@/lib/production/my-work';
import { logError } from '@/lib/observability/log-error';

// =============================================================
// GET /api/my-tasks
// Aggregates ALL tasks assigned to the current user across:
//   - pyra_tasks (board tasks)        — existing
//   - pyra_lead_tasks (lead tasks)    — Phase 15.1 Commit 2 extension
//
// The two sources are unioned into a single array. Each entry carries
// `_source` discriminator + `target_path` field for the consumer's Link.
// Board task target_path uses the existing /dashboard/boards/{board_id}
// shape; lead task target_path uses /dashboard/crm/leads/{lead_id}?tab=tasks
// (FIX 1 from Commit 2 plan — future-correct path so Commit 3 routing just
// starts working when the tasks tab UI lands).
//
// Lead tasks are projected into a board-task-compatible synthetic shape
// (pyra_boards/pyra_board_columns stubs) so the existing my-tasks-client
// UI can render them without immediate refactor. Commit 3 will properly
// wire up source-aware rendering (icons, badges) — for v1 the synthetic
// stubs are sufficient.
// =============================================================
export async function GET() {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const supabase = await createServerSupabaseClient();
    const username = auth.pyraUser.username;

    // ── Source 1: board tasks (existing path) ────────────────
    const assignments = await collectCursorPages(
      async (after, pageSize) => {
        let query = supabase
          .from('pyra_task_assignees')
          .select('task_id')
          .eq('username', username)
          .order('task_id', { ascending: true })
          .limit(pageSize);
        if (after !== null) query = query.gt('task_id', after);
        const { data, error } = await query;
        if (error) throw new Error(`pyra_task_assignees: ${error.message}`);
        return data ?? [];
      },
      (assignment) => assignment.task_id,
    );

    const taskIds = [...new Set(assignments.map((assignment) => assignment.task_id))];

    let boardTasks: unknown[] = [];
    if (taskIds.length > 0) {
      for (const taskIdChunk of chunkValues(taskIds, MY_WORK_TASK_PAGE_SIZE)) {
        const { data, error } = await supabase
          .from('pyra_tasks')
          .select(`
            *,
            pyra_boards!inner(id, name, project_id, view_mode, is_pipeline, pyra_projects!left(id, name)),
            pyra_board_columns!inner(id, name, color, position, is_done_column, requires_approval),
            pyra_task_labels(label_id, pyra_board_labels(id, name, color)),
            pyra_task_checklist(id, title, is_checked),
            pyra_task_assignees(id, username)
          `)
          .in('id', taskIdChunk)
          .eq('is_archived', false)
          .order('id', { ascending: true })
          .range(0, taskIdChunk.length - 1);

        if (error) throw new Error(`pyra_tasks: ${error.message}`);
        boardTasks.push(...(data ?? []).map((task) => ({
          ...(task as Record<string, unknown>),
          _source: 'board_task',
          target_path: `/dashboard/boards/${(task as { board_id: string }).board_id}`,
        })));
      }
    }

    // ── Source 2: lead tasks (Phase 15.1 Commit 2) ───────────
    // Scope: tasks assigned_to the current username, NOT cancelled.
    // Completed tasks ARE included (the consumer categorizes them into
    // the "done" section via is_done_column). Cancelled is excluded
    // because it's a terminal off-ramp, not a "done" state.
    const leadTaskRows = await collectCursorPages(
      async (after, pageSize) => {
        let query = supabase
          .from('pyra_lead_tasks')
          .select('id, lead_id, title, description, due_date, priority, status, assigned_to, created_by, created_at, completed_at, metadata')
          .eq('assigned_to', username)
          .neq('status', 'cancelled')
          .order('id', { ascending: true })
          .limit(pageSize);
        if (after !== null) query = query.gt('id', after);
        const { data, error } = await query;
        if (error) throw new Error(`pyra_lead_tasks: ${error.message}`);
        return data ?? [];
      },
      (task) => task.id,
    );

    const leadTasks = (leadTaskRows ?? []).map((t) => {
      const isDone = t.status === 'completed';
      // FIX H1 (Reviewer) — the consumer's `upcoming` predicate is
      // `!t.due_date || (t.due_date > weekEnd && !is_done_column)`. For a
      // completed undated lead task, `!t.due_date` short-circuits to true
      // and the task appears in BOTH `upcoming` AND `done` buckets. Backfill
      // the synthetic due_date with completed_at (in the past) so the
      // predicate evaluates against a real date and lands the task cleanly
      // in `done`. Pure projection-layer fix — DB row's due_date stays null.
      const syntheticDueDate =
        isDone && !t.due_date && t.completed_at
          ? t.completed_at.split('T')[0]
          : t.due_date;
      return {
        // Core task fields (matching board-task shape for UI parity)
        id: t.id,
        title: t.title,
        description: t.description,
        due_date: syntheticDueDate,
        due_at: null,
        priority: t.priority ?? 'medium',
        status: t.status,
        created_at: t.created_at,
        completion_percentage: isDone ? 100 : 0,
        // Lead-task-specific
        lead_id: t.lead_id,
        completed_at: t.completed_at,
        assigned_to: t.assigned_to,
        created_by: t.created_by,
        // No real board — synthetic stub so the existing UI's
        // groupBy='board'/'project' don't blow up. Commit 3 swaps this
        // for source-aware rendering.
        board_id: null,
        pyra_boards: {
          id: null,
          name: 'مهام Lead', // i18n-exempt: legacy stub — client derives label from _source
          project_id: null,
          view_mode: 'list',
          is_pipeline: false,
          pyra_projects: null,
        },
        pyra_board_columns: {
          id: null,
          name: t.status,
          color: null,
          position: 0,
          is_done_column: isDone,
          requires_approval: false,
        },
        // FIX 1 — future-correct CRM tab path. Commit 3 adds the tasks
        // tab UI; this path starts working immediately when that lands.
        _source: 'lead_task',
        target_path: `/dashboard/crm/leads/${t.lead_id}?tab=tasks`,
      };
    });

    // ── Union ────────────────────────────────────────────────
    // Combined sort: exact deadline asc, then legacy date-only deadline,
    // then created_at desc. Lead tasks remain date-only.
    // The consumer further categorizes by overdue/today/week/upcoming.
    const all = [...boardTasks, ...leadTasks].sort((a, b) => {
      const deadline = (row: unknown): string | null => {
        const item = row as {
          _source: 'board_task' | 'lead_task';
          due_date: string | null;
          due_at?: string | null;
          production_deadline_exempt?: boolean;
        };
        if (item._source === 'board_task') {
          if (isUnverifiedProductionDeadline({
            dueDate: item.due_date,
            dueAt: item.due_at,
            deadlineExempt: item.production_deadline_exempt,
          })) return null;
          if (item.due_at !== null && item.due_at !== undefined) {
            return isValidIsoInstant(item.due_at) ? item.due_at : null;
          }
        }
        return item.due_date ? legacyDubaiDayEndToIso(item.due_date) : null;
      };
      const ad = deadline(a);
      const bd = deadline(b);
      if (ad && bd) {
        const exact = compareIsoInstants(ad, bd);
        if (exact !== null && exact !== 0) return exact;
      } else if (ad) return -1;
      else if (bd) return 1;
      const ac = (a as { created_at: string }).created_at ?? '';
      const bc = (b as { created_at: string }).created_at ?? '';
      return bc.localeCompare(ac);
    });

    return apiSuccess(all);
  } catch (err) {
    logError({ error: err, metadata: { action: 'my-tasks' } });
    console.error('[GET /api/my-tasks] error:', err);
    return apiServerError();
  }
}
