import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// POST /api/tasks/[id]/checklist
// Add a checklist item  { title: string }
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.create');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const { title } = await req.json();
  if (!title || !title.trim()) {
    return apiValidationError('عنوان العنصر مطلوب');
  }

  const supabase = await createServerSupabaseClient();

  // Get max position
  const { data: maxPos } = await supabase
    .from('pyra_task_checklist')
    .select('position')
    .eq('task_id', id)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const { data, error } = await supabase
    .from('pyra_task_checklist')
    .insert({
      id: generateId('cl'),
      task_id: id,
      title: title.trim(),
      is_checked: false,
      position: (maxPos?.position ?? -1) + 1,
    })
    .select()
    .single();

  if (error) return apiServerError(error.message);
  return apiSuccess(data, undefined, 201);
}

// =============================================================
// PATCH /api/tasks/[id]/checklist?itemId=xxx
// Toggle a checklist item  { is_checked: boolean } or { title: string }
// =============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const itemId = req.nextUrl.searchParams.get('itemId');
  if (!itemId) return apiValidationError('itemId مطلوب');

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if ('is_checked' in body) updates.is_checked = body.is_checked;
  if ('title' in body) updates.title = body.title;

  if (Object.keys(updates).length === 0) {
    return apiValidationError('لا توجد بيانات للتحديث');
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('pyra_task_checklist')
    .update(updates)
    .eq('id', itemId)
    .eq('task_id', id)
    .select()
    .single();

  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

// =============================================================
// DELETE /api/tasks/[id]/checklist?itemId=xxx
// Delete a checklist item
// =============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.create');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const itemId = req.nextUrl.searchParams.get('itemId');
  if (!itemId) return apiValidationError('itemId مطلوب');

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from('pyra_task_checklist')
    .delete()
    .eq('id', itemId)
    .eq('task_id', id);

  if (error) return apiServerError(error.message);
  return apiSuccess({ deleted: true });
}
