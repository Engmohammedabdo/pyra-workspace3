import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiNotFound, apiForbidden } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { checkBoardScope } from '@/lib/auth/task-scope';
import { logActivity } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { notifyMany } from '@/lib/notifications/notify';
import { sendWhatsAppToUser, APP_URL } from '@/lib/notifications/whatsapp';

type RouteCtx = { params: Promise<{ id: string; taskId: string }> };

// =============================================================
// POST /api/boards/[id]/tasks/[taskId]/advance
// Move task to the next stage in a pipeline board
// =============================================================
export async function POST(req: NextRequest, ctx: RouteCtx) {
  try {
    const auth = await requireApiPermission('tasks.create');
    if (isApiError(auth)) return auth;

    const { id: boardId, taskId } = await ctx.params;

    // Board-scope gate: BASE_EMPLOYEE grants tasks.create to all internal
    // users, so permission alone doesn't prove board access.
    if (!(await checkBoardScope(boardId, auth))) {
      return apiForbidden('لا تملك صلاحية الوصول لهذه المهمة');
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const isHttpsUrl = (v: unknown): v is string =>
      typeof v === 'string' && /^https:\/\/.+/i.test(v.trim());
    const supabase = await createServerSupabaseClient();

    // Fetch board + columns
    const { data: board } = await supabase
      .from('pyra_boards')
      .select('id, is_pipeline, auto_advance, pyra_board_columns(id, name, position, is_done_column, requires_approval, default_assignee, column_type)')
      .eq('id', boardId)
      .single();

    if (!board) return apiNotFound('اللوحة غير موجودة');

    // Fetch task
    const { data: task } = await supabase
      .from('pyra_tasks')
      .select('id, title, column_id, board_id, stage_entered_at')
      .eq('id', taskId)
      .eq('board_id', boardId)
      .single();

    if (!task) return apiNotFound('المهمة غير موجودة');

    // Sort columns by position
    const columns = ((board.pyra_board_columns as Array<{
      id: string; name: string; position: number;
      is_done_column: boolean; requires_approval: boolean; default_assignee: string | null;
      column_type: string | null;
    }>) || []).sort((a, b) => a.position - b.position);

    const currentIdx = columns.findIndex(c => c.id === task.column_id);
    if (currentIdx === -1) return apiValidationError('العمود الحالي غير موجود');
    if (currentIdx >= columns.length - 1) return apiValidationError('المهمة بالفعل في المرحلة الأخيرة');

    const nextCol = columns[currentIdx + 1];

    // Check if next stage requires approval
    if (nextCol.requires_approval) {
      return apiValidationError('المرحلة التالية تتطلب موافقة. استخدم endpoint الموافقة.');
    }

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

    // Calculate time in current stage
    const timeInStage = task.stage_entered_at
      ? `${Math.round((Date.now() - new Date(task.stage_entered_at).getTime()) / 60000)} minutes`
      : null;

    // Calculate completion percentage
    const completionPct = Math.round(((currentIdx + 2) / columns.length) * 100);

    // Move task
    const { error: moveError } = await supabase
      .from('pyra_tasks')
      .update({
        column_id: nextCol.id,
        stage_entered_at: new Date().toISOString(),
        completion_percentage: completionPct,
      })
      .eq('id', taskId);

    if (moveError) return apiServerError(moveError.message);

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

    // Record stage history
    await supabase.from('pyra_task_stage_history').insert({
      id: generateId('sh'),
      task_id: taskId,
      board_id: boardId,
      from_column_id: task.column_id,
      to_column_id: nextCol.id,
      moved_by: auth.pyraUser.username,
      time_in_stage: timeInStage,
    });

    // Auto-assign if default_assignee is set
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
          assigned_by: 'system',
          column_id: nextCol.id,
          is_stage_assignee: true,
        });
      }
    }

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

    // Admins are blind to plain advances otherwise (only assignees are
    // notified above) — alert active admins too, EXCEPT when the target
    // column is 'review' or 'delivery' (those already get their own
    // dedicated admin alert blocks below — adding admins here too would
    // double-notify on those two column types).
    if (nextCol.column_type !== 'review' && nextCol.column_type !== 'delivery') {
      const { data: adminRowsForAdvance } = await supabase
        .from('pyra_users')
        .select('username')
        .eq('role', 'admin')
        .eq('status', 'active');

      await notifyMany(supabase, (adminRowsForAdvance || []).map(a => a.username), {
        type: 'task_stage_advanced',
        title: `📌 «${task.title}» انتقلت إلى ${nextCol.name}`,
        message: `${auth.pyraUser.display_name} نقل المهمة إلى "${nextCol.name}"`,
        link: taskLink,
        entity: { type: 'task', id: taskId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
    }

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

    // Log activity
    await supabase.from('pyra_task_activity').insert({
      id: generateId('act'),
      task_id: taskId,
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      action: 'stage_advanced',
      details: JSON.stringify({
        from: task.column_id,
        to: nextCol.id,
        stage_name: nextCol.name,
      }),
    });

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'task_advanced',
      `/dashboard/boards/${boardId}`,
      { task_id: taskId, to_stage: nextCol.name, completion_pct: completionPct },
    );

    return apiSuccess({ advanced: true, to_column: nextCol.id, completion_percentage: completionPct });

  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'task_advance' } });
    console.error('[POST /api/boards/[id]/tasks/[taskId]/advance] error:', err);
    return apiServerError();
  }
}
