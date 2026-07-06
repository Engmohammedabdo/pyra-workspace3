import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiForbidden } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { checkTaskScope } from '@/lib/auth/task-scope';
import { logActivity } from '@/lib/api/activity';

// =============================================================
// POST /api/tasks/[id]/checklist
// Add a checklist item  { title: string }
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('tasks.create');
    if (isApiError(auth)) return auth;

    const { id } = await params;

    if (!(await checkTaskScope(id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const { title } = await req.json();
    if (!title || !title.trim()) {
      return apiValidationError(t('tasks.checklistTitleRequired'));
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

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'checklist_item_added',
      `/dashboard/boards`,
      { task_id: id, title: title.trim() },
    );

    return apiSuccess(data, undefined, 201);

  } catch (err) {
    console.error('[POST /api/tasks/[id]/checklist] error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/tasks/[id]/checklist?itemId=xxx
// Toggle a checklist item  { is_checked: boolean } or { title: string }
// =============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('tasks.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;

    if (!(await checkTaskScope(id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const itemId = req.nextUrl.searchParams.get('itemId');
    if (!itemId) return apiValidationError(t('tasks.itemIdRequired'));

    const body = await req.json();
    const updates: Record<string, unknown> = {};
    if ('is_checked' in body) updates.is_checked = body.is_checked;
    if ('title' in body) updates.title = body.title;

    if (Object.keys(updates).length === 0) {
      return apiValidationError(t('tasks.noDataToUpdate'));
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

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'checklist_item_updated',
      `/dashboard/boards`,
      { task_id: id, item_id: itemId, fields: Object.keys(updates) },
    );

    return apiSuccess(data);

  } catch (err) {
    console.error('[PATCH /api/tasks/[id]/checklist] error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/tasks/[id]/checklist?itemId=xxx
// Delete a checklist item
// =============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('tasks.create');
    if (isApiError(auth)) return auth;

    const { id } = await params;

    if (!(await checkTaskScope(id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const itemId = req.nextUrl.searchParams.get('itemId');
    if (!itemId) return apiValidationError(t('tasks.itemIdRequired'));

    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from('pyra_task_checklist')
      .delete()
      .eq('id', itemId)
      .eq('task_id', id);

    if (error) return apiServerError(error.message);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'checklist_item_deleted',
      `/dashboard/boards`,
      { task_id: id, item_id: itemId },
    );

    return apiSuccess({ deleted: true });

  } catch (err) {
    console.error('[DELETE /api/tasks/[id]/checklist] error:', err);
    return apiServerError();
  }
}
