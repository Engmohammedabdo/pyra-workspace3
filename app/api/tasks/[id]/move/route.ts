import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiForbidden } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { checkTaskScope } from '@/lib/auth/task-scope';
import { logActivity } from '@/lib/api/activity';
import { notifyMany } from '@/lib/notifications/notify';
import { sendWhatsAppToUser, APP_URL } from '@/lib/notifications/whatsapp';

// =============================================================
// POST /api/tasks/[id]/move
// Move a task to a different column (and/or reorder)
// Reorders sibling tasks to prevent position collisions
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('tasks.create');
    if (isApiError(auth)) return auth;

    const { id } = await params;

    // Board-scope gate: BASE_EMPLOYEE grants tasks.create to all internal
    // users, so permission alone doesn't prove board access.
    if (!(await checkTaskScope(id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const body = await req.json();
    const { column_id, position, target_board_id } = body;
    if (!column_id) return apiValidationError('column_id is required');

    const supabase = await createServerSupabaseClient();
    const newPosition = position ?? 0;

    // Get the task's current column to know if it's a cross-column move
    const { data: currentTask, error: taskError } = await supabase
      .from('pyra_tasks')
      .select('column_id, position, board_id')
      .eq('id', id)
      .single();

    if (taskError || !currentTask) {
      return apiServerError(t('common.taskNotFound'));
    }

    const isCrossColumn = currentTask.column_id !== column_id;

    // Fetch all tasks in dest column (excluding the moved task), re-assign positions
    const { data: destTasks } = await supabase
      .from('pyra_tasks')
      .select('id, position')
      .eq('column_id', column_id)
      .neq('id', id)
      .order('position');

    if (destTasks) {
      let pos = 0;
      for (const t of destTasks) {
        if (pos === newPosition) pos++; // skip the slot for our task
        if (t.position !== pos) {
          await supabase
            .from('pyra_tasks')
            .update({ position: pos })
            .eq('id', t.id);
        }
        pos++;
      }
    }

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
    let targetCol: { id: string; name: string; column_type: string | null; requires_approval: boolean } | null = null;
    if (isCrossColumn && isPipelineBoard) {
      const { data: fetchedTargetCol } = await supabase
        .from('pyra_board_columns')
        .select('id, name, column_type, requires_approval')
        .eq('id', column_id)
        .single();
      targetCol = fetchedTargetCol;
      if (
        targetCol &&
        (targetCol.column_type === 'review' ||
          targetCol.column_type === 'delivery' ||
          targetCol.requires_approval)
      ) {
        return apiValidationError(t('tasks.gatedColumnMoveBlocked'));
      }

      // Also block a raw drag OUT of a review/approved/approval-gated source
      // column — that path is used to record a "decided" transition (approve/
      // reject) and a raw exit would write a phantom decided-round stage_history
      // row that corrupts productivity metrics.
      const { data: sourceCol } = await supabase
        .from('pyra_board_columns')
        .select('id, column_type, requires_approval')
        .eq('id', currentTask.column_id)
        .single();
      if (
        sourceCol &&
        (sourceCol.column_type === 'review' ||
          sourceCol.column_type === 'approved' ||
          sourceCol.requires_approval)
      ) {
        return apiValidationError(t('tasks.exitReviewApprovalBlocked'));
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

    // Cross-board move
    const isCrossBoard = target_board_id && target_board_id !== currentTask.board_id;

    // Move the task
    const updatePayload: Record<string, unknown> = {
      column_id,
      position: newPosition,
      updated_at: new Date().toISOString(),
    };
    if (isCrossBoard) {
      updatePayload.board_id = target_board_id;
      // Remove board-specific labels when moving cross-board
      await supabase.from('pyra_task_labels').delete().eq('task_id', id);
    }
    if (isCrossColumn) {
      updatePayload.stage_entered_at = new Date().toISOString();
    }
    if (completionPct !== undefined) {
      updatePayload.completion_percentage = completionPct;
    }

    const { data, error } = await supabase
      .from('pyra_tasks')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) return apiServerError(error.message);

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

      // Admins are blind to drag-moves otherwise (button-advances only
      // notify assignees) — alert active admins on every pipeline stage
      // move so they see e.g. "New -> In Progress". notifyMany auto-skips
      // the actor (from.username), so an admin dragging their own task
      // doesn't self-notify.
      if (targetCol) {
        const { data: adminRows } = await supabase
          .from('pyra_users')
          .select('username')
          .eq('role', 'admin')
          .eq('status', 'active');
        const adminNames = (adminRows || []).map(a => a.username);

        const adminTaskLink = `/dashboard/boards/${data.board_id}?task=${id}`;
        await notifyMany(supabase, adminNames, {
          type: 'task_stage_advanced',
          title: `📌 «${data.title}» انتقلت إلى ${targetCol.name}`, // i18n-exempt: notification content (Phase 8)
          message: `${auth.pyraUser.display_name} نقل المهمة إلى "${targetCol.name}"`, // i18n-exempt: notification content (Phase 8)
          link: adminTaskLink,
          entity: { type: 'task', id },
          from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
        });

        // WhatsApp the admins too (not just in-app) — the admin wants a push
        // on WhatsApp when an employee moves a task, e.g. "New -> In Progress".
        // Skip the actor so an admin dragging their own card isn't messaged.
        for (const admin of adminNames) {
          if (admin === auth.pyraUser.username) continue;
          await sendWhatsAppToUser(
            supabase,
            admin,
            `📌 ${auth.pyraUser.display_name} نقل «${data.title}» إلى ${targetCol.name}\n${APP_URL}${adminTaskLink}`, // i18n-exempt: notification content (Phase 8)
          );
        }

        // Raw drag-moves also silently skipped assignees (only button-driven
        // /advance and /approve notified them) — notify the task's assignees
        // too, matching the advance route's pattern. notifyMany auto-skips
        // the actor and dedups within this one call.
        const { data: assigneeRows } = await supabase
          .from('pyra_task_assignees')
          .select('username')
          .eq('task_id', id);
        const assigneeNames = (assigneeRows || []).map(a => a.username);

        await notifyMany(supabase, assigneeNames, {
          type: 'task_stage_advanced',
          title: `📌 «${data.title}» انتقلت إلى ${targetCol.name}`, // i18n-exempt: notification content (Phase 8)
          message: `انتقلت المهمة إلى "${targetCol.name}"`, // i18n-exempt: notification content (Phase 8)
          link: `/dashboard/boards/${data.board_id}?task=${id}`,
          entity: { type: 'task', id },
          from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
        });
      }
    }

    // If cross-column, compact the source column positions
    if (isCrossColumn) {
      const { data: srcTasks } = await supabase
        .from('pyra_tasks')
        .select('id')
        .eq('column_id', currentTask.column_id)
        .order('position');

      if (srcTasks) {
        for (let i = 0; i < srcTasks.length; i++) {
          await supabase
            .from('pyra_tasks')
            .update({ position: i })
            .eq('id', srcTasks[i].id);
        }
      }
    }

    // Log task activity
    await supabase.from('pyra_task_activity').insert({
      id: generateId('tl'),
      task_id: id,
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      action: 'moved',
      details: { column_id, position: newPosition },
    });

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'task_moved',
      `/dashboard/boards/${data.board_id}`,
      { task_id: id, column_id, position: newPosition, cross_board: !!isCrossBoard },
    );

    return apiSuccess(data);

  } catch (err) {
    console.error('[POST /api/tasks/[id]/move] error:', err);
    return apiServerError();
  }
}
