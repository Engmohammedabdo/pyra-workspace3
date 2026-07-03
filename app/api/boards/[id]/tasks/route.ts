import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { resolveUserScope, invalidateScopeCache } from '@/lib/auth/scope';
import { logActivity } from '@/lib/api/activity';
import { notifyMany } from '@/lib/notifications/notify';
import { sendWhatsAppToUser, APP_URL } from '@/lib/notifications/whatsapp';

// =============================================================
// GET /api/boards/[id]/tasks
// List all non-archived tasks for a board
// =============================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('tasks.view');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;

    // Verify non-admin employee has access to this board
    const scope = await resolveUserScope(auth);
    if (!scope.isAdmin && !scope.boardIds.includes(boardId)) {
      return apiError('ليس لديك صلاحية الوصول إلى هذه اللوحة', 403);
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('pyra_tasks')
      .select(`
        *,
        pyra_task_assignees(id, username, assigned_by),
        pyra_task_labels(label_id, pyra_board_labels(id, name, color)),
        pyra_task_checklist(id, title, is_checked, position)
      `)
      .eq('board_id', boardId)
      .eq('is_archived', false)
      .order('position');

    if (error) return apiServerError(error.message);
    return apiSuccess(data);

  } catch (err) {
    console.error('[GET /api/boards/[id]/tasks] error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/boards/[id]/tasks
// Create a new task in a board column
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('tasks.create');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;
    const body = await req.json();
    const { title, column_id, description, priority, due_date, start_date, estimated_hours, assignees } = body;

    if (!title) return apiValidationError('عنوان المهمة مطلوب');
    if (!column_id) return apiValidationError('العمود مطلوب');

    const supabase = await createServerSupabaseClient();

    // Verify column belongs to this board
    const { data: column, error: colError } = await supabase
      .from('pyra_board_columns')
      .select('id')
      .eq('id', column_id)
      .eq('board_id', boardId)
      .single();

    if (colError || !column) {
      return apiValidationError('العمود المحدد لا ينتمي لهذه اللوحة');
    }

    const taskId = generateId('tk');

    // Get max position in column
    const { data: maxPos } = await supabase
      .from('pyra_tasks')
      .select('position')
      .eq('column_id', column_id)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    // Get next task_number for this board
    const { data: maxNum } = await supabase
      .from('pyra_tasks')
      .select('task_number')
      .eq('board_id', boardId)
      .order('task_number', { ascending: false, nullsFirst: false })
      .limit(1)
      .single();

    const { data, error } = await supabase
      .from('pyra_tasks')
      .insert({
        id: taskId,
        board_id: boardId,
        column_id,
        title,
        description: description || null,
        priority: priority || 'medium',
        due_date: due_date || null,
        start_date: start_date || null,
        estimated_hours: estimated_hours || null,
        position: (maxPos?.position ?? -1) + 1,
        task_number: (maxNum?.task_number ?? 0) + 1,
        created_by: auth.pyraUser.username,
      })
      .select()
      .single();

    if (error) return apiServerError(error.message);

    // Add assignees if provided
    if (assignees && Array.isArray(assignees) && assignees.length > 0) {
      const assigneeInserts = assignees.map((username: string) => ({
        id: generateId('ta'),
        task_id: taskId,
        username,
        assigned_by: auth.pyraUser.username,
      }));
      await supabase.from('pyra_task_assignees').insert(assigneeInserts);

      assignees.forEach((a: any) => {
        const uname = typeof a === 'string' ? a : a.username;
        if (uname) invalidateScopeCache(uname);
      });

      // Notify + WhatsApp each assignee (2026-07-03 fix: creation inserted
      // assignees SILENTLY — only later additions via /assignees notified)
      const assigneeNames: string[] = assignees
        .map((a: any) => (typeof a === 'string' ? a : a?.username))
        .filter(Boolean);
      const taskLink = `/dashboard/boards/${boardId}?task=${taskId}`;

      await notifyMany(supabase, assigneeNames, {
        type: 'task_assigned',
        title: `📌 مهمة جديدة: ${title}`,
        message: `عيّنك ${auth.pyraUser.display_name} على مهمة جديدة${due_date ? ` — الموعد النهائي ${due_date}` : ''}`,
        link: taskLink,
        entity: { type: 'task', id: taskId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
      for (const uname of assigneeNames) {
        if (uname === auth.pyraUser.username) continue;
        await sendWhatsAppToUser(
          supabase,
          uname,
          `📌 مهمة جديدة اتعينت عليك: ${title}\nالموعد النهائي: ${due_date || 'غير محدد'}\n${APP_URL}${taskLink}`,
        );
      }
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'task_created',
      `/dashboard/boards/${boardId}`,
      { task_id: taskId, title, column_id, priority: priority || 'medium' },
    );

    return apiSuccess(data, undefined, 201);

  } catch (err) {
    console.error('[POST /api/boards/[id]/tasks] error:', err);
    return apiServerError();
  }
}
