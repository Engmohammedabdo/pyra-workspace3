import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiForbidden } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { checkBoardScope } from '@/lib/auth/task-scope';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, logActivity } from '@/lib/api/activity';

// =============================================================
// GET /api/boards/[id]/labels
// =============================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('boards.view');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;

    if (!(await checkBoardScope(boardId, auth))) {
      return apiForbidden(t('common.noAccessBoard'));
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
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;

    if (!(await checkBoardScope(boardId, auth))) {
      return apiForbidden(t('common.noAccessBoard'));
    }

    const { name, color } = await req.json();
    if (!name) return apiValidationError(t('boards.labelNameRequired'));

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('pyra_board_labels')
      .insert({ id: generateId('bl'), board_id: boardId, name, color: color || 'gray' })
      .select()
      .single();

    if (error) return apiServerError(error.message, error, req);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.BOARD}_${ACTIVITY_ACTIONS.CREATE}`,
      `/dashboard/boards/${boardId}`,
      { source: 'board_label', label_name: name, color: color || 'gray' },
    );

    return apiSuccess(data, undefined, 201);

  } catch (err) {
    console.error('[POST /api/boards/[id]/labels] error:', err);
    return apiServerError(undefined, err, req);
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
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;

    if (!(await checkBoardScope(boardId, auth))) {
      return apiForbidden(t('common.noAccessBoard'));
    }

    const body = await req.json();
    if (!body.id) return apiValidationError(t('boards.labelIdRequired'));

    const supabase = await createServerSupabaseClient();
    const updates: Record<string, string> = {};
    if (body.name) updates.name = body.name;
    if (body.color) updates.color = body.color;

    const { data, error } = await supabase
      .from('pyra_board_labels')
      .update(updates)
      .eq('id', body.id)
      .eq('board_id', boardId)
      .select()
      .maybeSingle();

    if (error) return apiServerError(error.message, error, req);
    if (!data) return apiValidationError(t('boards.labelNotInBoard'));

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.BOARD}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/boards/${boardId}`,
      { source: 'board_label', label_id: body.id, updated_fields: Object.keys(updates) },
    );

    return apiSuccess(data);

  } catch (err) {
    console.error('[PATCH /api/boards/[id]/labels] error:', err);
    return apiServerError(undefined, err, req);
  }
}

// =============================================================
// DELETE /api/boards/[id]/labels?labelId=xxx
// =============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;

    if (!(await checkBoardScope(boardId, auth))) {
      return apiForbidden(t('common.noAccessBoard'));
    }

    const labelId = req.nextUrl.searchParams.get('labelId');
    if (!labelId) return apiValidationError(t('boards.labelIdQueryRequired'));

    const supabase = await createServerSupabaseClient();
    const { data: deletedLabel, error } = await supabase
      .from('pyra_board_labels')
      .delete()
      .eq('id', labelId)
      .eq('board_id', boardId)
      .select('id')
      .maybeSingle();
    if (error) return apiServerError(error.message, error, req);
    if (!deletedLabel) return apiValidationError(t('boards.labelNotInBoard'));

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.BOARD}_${ACTIVITY_ACTIONS.DELETE}`,
      `/dashboard/boards/${boardId}`,
      { source: 'board_label', label_id: labelId },
    );

    return apiSuccess({ deleted: true });

  } catch (err) {
    console.error('[DELETE /api/boards/[id]/labels] error:', err);
    return apiServerError(undefined, err, req);
  }
}
