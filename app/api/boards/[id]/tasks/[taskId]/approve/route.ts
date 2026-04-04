import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiNotFound } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';

type RouteCtx = { params: Promise<{ id: string; taskId: string }> };

// =============================================================
// POST /api/boards/[id]/tasks/[taskId]/approve
// Approve task advancement to a gated stage, or reject
// Body: { action: 'approve' | 'reject', note?: string }
// =============================================================
export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const { id: boardId, taskId } = await ctx.params;
    const body = await req.json();
    const action = body.action as string; // 'approve' | 'reject'
    const note = (body.note as string) || '';

    if (!action || !['approve', 'reject'].includes(action)) {
      return apiValidationError('يجب تحديد الإجراء: approve أو reject');
    }

    const supabase = await createServerSupabaseClient();

    // Fetch task
    const { data: task } = await supabase
      .from('pyra_tasks')
      .select('id, column_id, board_id, title, stage_entered_at')
      .eq('id', taskId)
      .eq('board_id', boardId)
      .single();

    if (!task) return apiNotFound('المهمة غير موجودة');

    // Get columns
    const { data: cols } = await supabase
      .from('pyra_board_columns')
      .select('id, name, position, is_done_column, requires_approval, default_assignee')
      .eq('board_id', boardId)
      .order('position');

    if (!cols) return apiServerError('فشل تحميل الأعمدة');

    const currentIdx = cols.findIndex(c => c.id === task.column_id);
    if (currentIdx >= cols.length - 1) return apiValidationError('المهمة في المرحلة الأخيرة');

    const nextCol = cols[currentIdx + 1];

    if (action === 'approve') {
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

      // Notify assignees
      const { data: assignees } = await supabase
        .from('pyra_task_assignees')
        .select('username')
        .eq('task_id', taskId);

      if (assignees) {
        const notifs = assignees
          .filter(a => a.username !== auth.pyraUser.username)
          .map(a => ({
            id: generateId('ntf'),
            username: a.username,
            type: 'task_approved',
            title: `تمت الموافقة: ${task.title}`,
            message: `تمت الموافقة على المهمة وانتقلت إلى "${nextCol.name}"${note ? ` — ${note}` : ''}`,
            link: `/dashboard/boards/${boardId}`,
            is_read: false,
          }));
        if (notifs.length > 0) {
          await supabase.from('pyra_notifications').insert(notifs);
        }
      }

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

      // Notify — rejection
      const { data: assignees } = await supabase
        .from('pyra_task_assignees')
        .select('username')
        .eq('task_id', taskId);

      if (assignees) {
        const notifs = assignees
          .filter(a => a.username !== auth.pyraUser.username)
          .map(a => ({
            id: generateId('ntf'),
            username: a.username,
            type: 'task_revision_requested',
            title: `مطلوب تعديل: ${task.title}`,
            message: `تم رفض المهمة وإرجاعها${note ? ` — السبب: ${note}` : ''}`,
            link: `/dashboard/boards/${boardId}`,
            is_read: false,
          }));
        if (notifs.length > 0) {
          await supabase.from('pyra_notifications').insert(notifs);
        }
      }

      // Comment with rejection note
      if (note) {
        await supabase.from('pyra_task_comments').insert({
          id: generateId('tc'),
          task_id: taskId,
          author_username: auth.pyraUser.username,
          author_name: auth.pyraUser.display_name,
          content: `❌ مطلوب تعديل: ${note}`,
        });
      }

      // Activity log
      await supabase.from('pyra_task_activity').insert({
        id: generateId('act'),
        task_id: taskId,
        username: auth.pyraUser.username,
        display_name: auth.pyraUser.display_name,
        action: 'stage_rejected',
        details: JSON.stringify({ note, sent_back_to: prevCol?.name || 'نفس المرحلة' }),
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
    console.error('[POST /api/boards/[id]/tasks/[taskId]/approve] error:', err);
    return apiServerError();
  }
}
