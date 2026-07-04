import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiForbidden } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { checkBoardScope } from '@/lib/auth/task-scope';
import { logActivity } from '@/lib/api/activity';

// =============================================================
// GET /api/boards/[id]/labels
// =============================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('boards.view');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;

    if (!(await checkBoardScope(boardId, auth))) {
      return apiForbidden('لا تملك صلاحية الوصول لهذه اللوحة');
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('pyra_board_labels')
      .select('*')
      .eq('board_id', boardId)
      .order('name');

    if (error) return apiServerError(error.message);
    return apiSuccess(data);

  } catch (err) {
    console.error('[GET /api/boards/[id]/labels] error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/boards/[id]/labels — create label
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;
    const { name, color } = await req.json();
    if (!name) return apiValidationError('اسم التصنيف مطلوب');

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('pyra_board_labels')
      .insert({ id: generateId('bl'), board_id: boardId, name, color: color || 'gray' })
      .select()
      .single();

    if (error) return apiServerError(error.message);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'label_created',
      `/dashboard/boards/${boardId}`,
      { label_name: name, color: color || 'gray' },
    );

    return apiSuccess(data, undefined, 201);

  } catch (err) {
    console.error('[POST /api/boards/[id]/labels] error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/boards/[id]/labels — update label
// Body: { id, name?, color? }
// =============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json();
    if (!body.id) return apiValidationError('معرف التصنيف مطلوب');

    const supabase = await createServerSupabaseClient();
    const updates: Record<string, string> = {};
    if (body.name) updates.name = body.name;
    if (body.color) updates.color = body.color;

    const { data, error } = await supabase
      .from('pyra_board_labels')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single();

    if (error) return apiServerError(error.message);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'label_updated',
      `/dashboard/boards/${(await params).id}`,
      { label_id: body.id, updated_fields: Object.keys(updates) },
    );

    return apiSuccess(data);

  } catch (err) {
    console.error('[PATCH /api/boards/[id]/labels] error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/boards/[id]/labels?labelId=xxx
// =============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const labelId = req.nextUrl.searchParams.get('labelId');
    if (!labelId) return apiValidationError('labelId مطلوب');

    const supabase = await createServerSupabaseClient();
    // Remove from tasks first
    await supabase.from('pyra_task_labels').delete().eq('label_id', labelId);
    // Delete label
    const { error } = await supabase.from('pyra_board_labels').delete().eq('id', labelId);
    if (error) return apiServerError(error.message);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'label_deleted',
      `/dashboard/boards/${(await params).id}`,
      { label_id: labelId },
    );

    return apiSuccess({ deleted: true });

  } catch (err) {
    console.error('[DELETE /api/boards/[id]/labels] error:', err);
    return apiServerError();
  }
}
