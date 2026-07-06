import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiNotFound } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { notifyMany } from '@/lib/notifications/notify';
import { sendWhatsAppToUser, APP_URL } from '@/lib/notifications/whatsapp';

type RouteCtx = { params: Promise<{ id: string; taskId: string }> };

// =============================================================
// POST /api/boards/[id]/tasks/[taskId]/approve
// Approve task advancement to a gated stage, or reject
// Body: { action: 'approve' | 'reject', note?: string }
// =============================================================
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const { id: boardId, taskId } = await ctx.params;
    const body = await req.json();
    const action = body.action as string; // 'approve' | 'reject'
    const note = (body.note as string) || '';

    if (!action || !['approve', 'reject'].includes(action)) {
      return apiValidationError(t('boards.actionRequiredApproveReject'));
    }

    if (action === 'reject' && !note.trim()) {
      return apiValidationError(t('boards.revisionNoteRequired'));
    }

    const supabase = await createServerSupabaseClient();

    // Fetch task
    const { data: task } = await supabase
      .from('pyra_tasks')
      .select('id, column_id, board_id, title, stage_entered_at')
      .eq('id', taskId)
      .eq('board_id', boardId)
      .single();

    if (!task) return apiNotFound(t('common.taskNotFound'));

    // Get columns
    const { data: cols } = await supabase
      .from('pyra_board_columns')
      .select('id, name, position, column_type, is_done_column, requires_approval, default_assignee')
      .eq('board_id', boardId)
      .order('position');

    if (!cols) return apiServerError(t('boards.columnsLoadFailed'));

    const currentIdx = cols.findIndex(c => c.id === task.column_id);
    if (currentIdx >= cols.length - 1) return apiValidationError(t('boards.taskAlreadyLastStageAlt'));

    const currentCol = cols[currentIdx];
    const nextCol = cols[currentIdx + 1];

    if (action === 'approve') {
      // Only makes sense when advancing INTO an approval-gated column —
      // otherwise this endpoint would let an admin skip a task straight
      // past a stage with no real approval gate, writing a phantom
      // stage_history row that corrupts productivity metrics.
      if (nextCol.requires_approval !== true) {
        return apiValidationError(t('boards.approveOnlyForGatedStage'));
      }
      // Move to next column
      const completionPct = Math.round(((currentIdx + 2) / cols.length) * 100);

      await supabase
        .from('pyra_tasks')
        .update({
          column_id: nextCol.id,
          stage_entered_at: new Date().toISOString(),
          completion_percentage: completionPct,
        })
        .eq('id', taskId);

      // Record history with approval
      await supabase.from('pyra_task_stage_history').insert({
        id: generateId('sh'),
        task_id: taskId,
        board_id: boardId,
        from_column_id: task.column_id,
        to_column_id: nextCol.id,
        moved_by: auth.pyraUser.username,
        approved_by: auth.pyraUser.username,
      });

      // Auto-assign next stage
      if (nextCol.default_assignee) {
        const { data: existing } = await supabase
          .from('pyra_task_assignees')
          .select('id')
          .eq('task_id', taskId)
          .eq('username', nextCol.default_assignee)
          .maybeSingle();

        if (!existing) {
          await supabase.from('pyra_task_assignees').insert({
            id: generateId('ta'),
            task_id: taskId,
            username: nextCol.default_assignee,
            assigned_by: auth.pyraUser.username,
            column_id: nextCol.id,
            is_stage_assignee: true,
          });
        }
      }

      const { data: assignees } = await supabase
        .from('pyra_task_assignees')
        .select('username')
        .eq('task_id', taskId);
      const assigneeNames = (assignees || []).map(a => a.username);
      const taskLink = `/dashboard/boards/${boardId}?task=${taskId}`;

      const isDelivery = nextCol.is_done_column === true;
      await notifyMany(supabase, assigneeNames, {
        type: 'task_approved',
        title: `✅ تمت الموافقة: ${task.title}`, // i18n-exempt: notification content (Phase 8)
        message: isDelivery
          ? `تمت الموافقة والمهمة اكتملت${note ? ` — ${note}` : ''}` // i18n-exempt: notification content (Phase 8)
          // i18n hazard (documented, Phase 2): business logic keyed on Arabic column name — do not localize without a column-type migration
          : `تمت الموافقة — ${nextCol.name === 'معتمد' ? 'ارفع التسليم النهائي على Drive' : `انتقلت إلى "${nextCol.name}"`}${note ? ` — ${note}` : ''}`, // i18n-exempt: notification content (Phase 8)
        link: taskLink,
        entity: { type: 'task', id: taskId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
      // i18n hazard (documented, Phase 2): business logic keyed on Arabic column name — do not localize without a column-type migration
      const approveWaLine = isDelivery
        ? 'المهمة اكتملت' // i18n-exempt: notification content (Phase 8)
        : nextCol.name === 'معتمد' // i18n-exempt: i18n hazard — business logic keyed on Arabic column name (documented, Phase 2)
          ? 'ارفع التسليم النهائي على Drive وسجّله من الداشبورد' // i18n-exempt: notification content (Phase 8)
          : `انتقلت إلى "${nextCol.name}"`; // i18n-exempt: notification content (Phase 8)
      // Fire-and-forget: WhatsApp is best-effort (the in-app notifyMany above
      // is the guaranteed channel) — don't serialize N×8s Evolution timeouts
      // in the response path. sendWhatsAppToUser never throws (returns false).
      void Promise.allSettled(
        assigneeNames
          .filter(u => u !== auth.pyraUser.username)
          .map(u => sendWhatsAppToUser(supabase, u,
            `✅ تمت الموافقة على: ${task.title}\n${approveWaLine}\n${APP_URL}${taskLink}`)) // i18n-exempt: notification content (Phase 8)
      ).catch(err => logError({ error: err, request: req, metadata: { action: 'task_approve_whatsapp' } }));

      // Activity log
      await supabase.from('pyra_task_activity').insert({
        id: generateId('act'),
        task_id: taskId,
        username: auth.pyraUser.username,
        display_name: auth.pyraUser.display_name,
        action: 'stage_approved',
        details: JSON.stringify({ to: nextCol.name, note }),
      });

      logActivity(
        auth.pyraUser.username,
        auth.pyraUser.display_name,
        'task_approved',
        `/dashboard/boards/${boardId}`,
        { task_id: taskId, title: task.title, to_stage: nextCol.name },
      );

      return apiSuccess({ approved: true, to_column: nextCol.id });
    } else {
      // Reject only applies when the task is actually pending review/approval —
      // either it's sitting in the review column, or the next column is itself
      // approval-gated (admin rejecting before it even entered review would be
      // a no-op transition otherwise).
      if (currentCol.column_type !== 'review' && nextCol.requires_approval !== true) {
        return apiValidationError(t('boards.noPendingReviewAction'));
      }

      // Reject — send back to previous column if exists, otherwise keep in place
      const prevCol = currentIdx > 0 ? cols[currentIdx - 1] : null;

      if (prevCol) {
        await supabase
          .from('pyra_tasks')
          .update({
            column_id: prevCol.id,
            stage_entered_at: new Date().toISOString(),
            completion_percentage: Math.round(((currentIdx) / cols.length) * 100),
          })
          .eq('id', taskId);

        await supabase.from('pyra_task_stage_history').insert({
          id: generateId('sh'),
          task_id: taskId,
          board_id: boardId,
          from_column_id: task.column_id,
          to_column_id: prevCol.id,
          moved_by: auth.pyraUser.username,
        });
      }

      const { data: assignees } = await supabase
        .from('pyra_task_assignees')
        .select('username')
        .eq('task_id', taskId);
      const assigneeNames = (assignees || []).map(a => a.username);
      const taskLink = `/dashboard/boards/${boardId}?task=${taskId}`;

      await notifyMany(supabase, assigneeNames, {
        type: 'task_revision_requested',
        title: `✏️ مطلوب تعديل: ${task.title}`, // i18n-exempt: notification content (Phase 8)
        message: `رجعت المهمة للتنفيذ — ${note}`, // i18n-exempt: notification content (Phase 8)
        link: taskLink,
        entity: { type: 'task', id: taskId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
      // Fire-and-forget: WhatsApp is best-effort (the in-app notifyMany above
      // is the guaranteed channel) — don't serialize N×8s Evolution timeouts
      // in the response path. sendWhatsAppToUser never throws (returns false).
      void Promise.allSettled(
        assigneeNames
          .filter(u => u !== auth.pyraUser.username)
          .map(u => sendWhatsAppToUser(supabase, u,
            `✏️ مطلوب تعديل على: ${task.title}\nالملاحظة: ${note}\nالتفاصيل على frame.io/التعليقات — ${APP_URL}${taskLink}`)) // i18n-exempt: notification content (Phase 8)
      ).catch(err => logError({ error: err, request: req, metadata: { action: 'task_reject_whatsapp' } }));

      // Comment with rejection note
      if (note) {
        await supabase.from('pyra_task_comments').insert({
          id: generateId('tc'),
          task_id: taskId,
          author_username: auth.pyraUser.username,
          author_name: auth.pyraUser.display_name,
          content: `❌ مطلوب تعديل: ${note}`, // i18n-exempt: DB data
        });
      }

      // Activity log
      await supabase.from('pyra_task_activity').insert({
        id: generateId('act'),
        task_id: taskId,
        username: auth.pyraUser.username,
        display_name: auth.pyraUser.display_name,
        action: 'stage_rejected',
        details: JSON.stringify({ note, sent_back_to: prevCol?.name || 'نفس المرحلة' }), // i18n-exempt: DB data
      });

      logActivity(
        auth.pyraUser.username,
        auth.pyraUser.display_name,
        'task_rejected',
        `/dashboard/boards/${boardId}`,
        { task_id: taskId, title: task.title, note },
      );

      return apiSuccess({ rejected: true, sent_back_to: prevCol?.id || task.column_id });
    }

  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'task_approve' } });
    console.error('[POST /api/boards/[id]/tasks/[taskId]/approve] error:', err);
    return apiServerError();
  }
}
