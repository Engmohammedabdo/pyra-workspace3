import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// GET /api/tasks/[id]/comments
// List all comments for a task
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
    .from('pyra_task_comments')
    .select('id, author_username, author_name, content, created_at')
    .eq('task_id', id)
    .order('created_at', { ascending: true });

  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

// =============================================================
// POST /api/tasks/[id]/comments
// Add a comment to a task  { content: string }
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const { content } = await req.json();
  if (!content || !content.trim()) {
    return apiValidationError('محتوى التعليق مطلوب');
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('pyra_task_comments')
    .insert({
      id: generateId('tc'),
      task_id: id,
      author_username: auth.pyraUser.username,
      author_name: auth.pyraUser.display_name,
      content: content.trim(),
    })
    .select()
    .single();

  if (error) return apiServerError(error.message);

  // Log activity
  await supabase.from('pyra_task_activity').insert({
    id: generateId('tl'),
    task_id: id,
    username: auth.pyraUser.username,
    display_name: auth.pyraUser.display_name,
    action: 'comment_added',
    details: { content: content.trim().slice(0, 100) },
  });

  return apiSuccess(data, undefined, 201);
}

// =============================================================
// DELETE /api/tasks/[id]/comments?commentId=xxx
// Delete a comment
// =============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.create');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const commentId = req.nextUrl.searchParams.get('commentId');
  if (!commentId) return apiValidationError('commentId مطلوب');

  const supabase = await createServerSupabaseClient();

  // Only allow deleting own comments (or admin)
  const { hasPermission: checkPerm } = await import('@/lib/auth/rbac');
  const isAdmin = checkPerm(auth.pyraUser.rolePermissions, 'tasks.manage');

  if (!isAdmin) {
    const { data: comment } = await supabase
      .from('pyra_task_comments')
      .select('author_username')
      .eq('id', commentId)
      .eq('task_id', id)
      .single();

    if (comment?.author_username !== auth.pyraUser.username) {
      return apiServerError('لا يمكنك حذف تعليقات الآخرين');
    }
  }

  const { error } = await supabase
    .from('pyra_task_comments')
    .delete()
    .eq('id', commentId)
    .eq('task_id', id);

  if (error) return apiServerError(error.message);
  return apiSuccess({ deleted: true });
}
