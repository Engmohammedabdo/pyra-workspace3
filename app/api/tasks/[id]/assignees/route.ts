import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// GET /api/tasks/[id]/assignees
// List all assignees for a task
// =============================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('pyra_task_assignees')
    .select('id, username, assigned_by, created_at')
    .eq('task_id', id)
    .order('created_at');

  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

// =============================================================
// POST /api/tasks/[id]/assignees
// Add assignee(s) to a task  { usernames: string[] }
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.create');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const { usernames } = await req.json();
  if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
    return apiValidationError('usernames مطلوب (مصفوفة)');
  }

  const supabase = await createServerSupabaseClient();

  // Get existing assignees to avoid duplicates
  const { data: existing } = await supabase
    .from('pyra_task_assignees')
    .select('username')
    .eq('task_id', id);

  const existingUsernames = new Set((existing || []).map((a) => a.username));
  const newUsernames = usernames.filter((u: string) => !existingUsernames.has(u));

  if (newUsernames.length === 0) {
    return apiSuccess({ added: 0, message: 'المستخدمون مُعيّنون بالفعل' });
  }

  const inserts = newUsernames.map((username: string) => ({
    id: generateId('ta'),
    task_id: id,
    username,
    assigned_by: auth.pyraUser.username,
  }));

  const { error } = await supabase.from('pyra_task_assignees').insert(inserts);
  if (error) return apiServerError(error.message);

  // Log activity
  await supabase.from('pyra_task_activity').insert({
    id: generateId('tl'),
    task_id: id,
    username: auth.pyraUser.username,
    display_name: auth.pyraUser.display_name,
    action: 'assignee_added',
    details: { added: newUsernames },
  });

  return apiSuccess({ added: newUsernames.length }, undefined, 201);
}

// =============================================================
// DELETE /api/tasks/[id]/assignees?username=xxx
// Remove an assignee from a task
// =============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.create');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const username = req.nextUrl.searchParams.get('username');
  if (!username) return apiValidationError('username مطلوب');

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from('pyra_task_assignees')
    .delete()
    .eq('task_id', id)
    .eq('username', username);

  if (error) return apiServerError(error.message);

  // Log activity
  await supabase.from('pyra_task_activity').insert({
    id: generateId('tl'),
    task_id: id,
    username: auth.pyraUser.username,
    display_name: auth.pyraUser.display_name,
    action: 'assignee_removed',
    details: { removed: username },
  });

  return apiSuccess({ removed: username });
}
