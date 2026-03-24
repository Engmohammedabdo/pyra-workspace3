import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiNotFound } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

type RouteCtx = { params: Promise<{ id: string; taskId: string }> };

// =============================================================
// GET /api/boards/[id]/tasks/[taskId]/attachments
// List all attachments for a task
// =============================================================
export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const auth = await requireApiPermission('tasks.view');
  if (isApiError(auth)) return auth;

  const { taskId } = await ctx.params;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('pyra_task_attachments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });

  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

// =============================================================
// POST /api/boards/[id]/tasks/[taskId]/attachments
// Record a file attachment for a task
// Body: { file_name, file_url, file_size, storage_path }
// =============================================================
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const auth = await requireApiPermission('tasks.create');
  if (isApiError(auth)) return auth;

  const { id: boardId, taskId } = await ctx.params;
  const body = await req.json();
  const { file_name, file_url, file_size, storage_path } = body;

  if (!file_name || !file_url) return apiValidationError('اسم الملف والرابط مطلوبان');

  const supabase = await createServerSupabaseClient();

  // Verify task exists
  const { data: task } = await supabase
    .from('pyra_tasks')
    .select('id, title')
    .eq('id', taskId)
    .eq('board_id', boardId)
    .single();

  if (!task) return apiNotFound('المهمة غير موجودة');

  const id = generateId('att');
  const { data, error } = await supabase
    .from('pyra_task_attachments')
    .insert({
      id,
      task_id: taskId,
      file_name,
      file_url,
      file_size: file_size || 0,
      storage_path: storage_path || null,
      uploaded_by: auth.pyraUser.username,
      review_status: 'uploaded',
    })
    .select()
    .single();

  if (error) return apiServerError(error.message);

  // Activity log
  await supabase.from('pyra_task_activity').insert({
    id: generateId('act'),
    task_id: taskId,
    username: auth.pyraUser.username,
    display_name: auth.pyraUser.display_name,
    action: 'file_uploaded',
    details: JSON.stringify({ file_name }),
  });

  return apiSuccess(data, undefined, 201);
}
