import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiForbidden } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { resolveUserScope } from '@/lib/auth/scope';

/** Check if user has access to the task's board via scope */
async function checkTaskScope(taskId: string, auth: ApiAuthResult) {
  const scope = await resolveUserScope(auth);
  if (scope.isAdmin) return true;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from('pyra_tasks').select('board_id').eq('id', taskId).maybeSingle();
  if (!data) return false;
  return scope.boardIds.includes(data.board_id);
}

// =============================================================
// GET /api/tasks/[id]
// Retrieve a single task with all related data
// =============================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;

  // Scope check: user must have access to the task's board
  if (!(await checkTaskScope(id, auth))) return apiForbidden();

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('pyra_tasks')
    .select(`
      *,
      pyra_task_assignees(id, username, assigned_by),
      pyra_task_labels(label_id, pyra_board_labels(id, name, color)),
      pyra_task_checklist(id, title, is_checked, position),
      pyra_task_comments(id, author_username, author_name, content, created_at),
      pyra_task_attachments(id, file_name, file_url, file_size, uploaded_by, created_at),
      pyra_task_activity(id, username, display_name, action, details, created_at)
    `)
    .eq('id', id)
    .single();

  if (error || !data) return apiNotFound('المهمة غير موجودة');
  return apiSuccess(data);
}

// =============================================================
// PATCH /api/tasks/[id]
// Update task properties
// =============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;

  // Scope check
  if (!(await checkTaskScope(id, auth))) return apiForbidden();

  const body = await req.json();
  const supabase = await createServerSupabaseClient();

  // ── Label operations (handle before normal updates) ──
  if (body._add_label) {
    const labelId = body._add_label as string;
    const { error: lErr } = await supabase.from('pyra_task_labels').insert({
      task_id: id,
      label_id: labelId,
    });
    if (lErr && !lErr.message.includes('duplicate')) return apiServerError(lErr.message);
    await supabase.from('pyra_task_activity').insert({
      id: generateId('tl'),
      task_id: id,
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      action: 'label_added',
      details: JSON.stringify({ label_id: labelId }),
    });
    return apiSuccess({ label_added: labelId });
  }

  if (body._remove_label) {
    const labelId = body._remove_label as string;
    await supabase.from('pyra_task_labels').delete().eq('task_id', id).eq('label_id', labelId);
    await supabase.from('pyra_task_activity').insert({
      id: generateId('tl'),
      task_id: id,
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      action: 'label_removed',
      details: JSON.stringify({ label_id: labelId }),
    });
    return apiSuccess({ label_removed: labelId });
  }

  // ── Normal field updates ──
  const allowed = [
    'title', 'description', 'column_id', 'position', 'priority',
    'due_date', 'start_date', 'estimated_hours', 'actual_hours',
    'cover_image', 'is_archived',
    'payment_amount', 'payment_currency', 'payment_status', 'task_hourly_rate',
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('pyra_tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return apiServerError(error.message);

  // Log task activity
  const changedFields = Object.keys(updates).filter(k => k !== 'updated_at');
  if (changedFields.length > 0) {
    await supabase.from('pyra_task_activity').insert({
      id: generateId('tl'),
      task_id: id,
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      action: 'updated',
      details: JSON.stringify({ fields: changedFields }),
    });
  }

  return apiSuccess(data);
}

// =============================================================
// DELETE /api/tasks/[id]
// Permanently delete a task
// =============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;

  // Scope check
  if (!(await checkTaskScope(id, auth))) return apiForbidden();

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('pyra_tasks').delete().eq('id', id);
  if (error) return apiServerError(error.message);
  return apiSuccess({ deleted: true });
}
