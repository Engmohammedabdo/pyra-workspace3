import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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
  const auth = await requireApiPermission('tasks.create');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const body = await req.json();
  const allowed = [
    'title', 'description', 'column_id', 'position', 'priority',
    'due_date', 'start_date', 'estimated_hours', 'actual_hours',
    'cover_image', 'is_archived',
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }
  updates.updated_at = new Date().toISOString();

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('pyra_tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return apiServerError(error.message);
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
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('pyra_tasks').delete().eq('id', id);
  if (error) return apiServerError(error.message);
  return apiSuccess({ deleted: true });
}
