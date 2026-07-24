import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiServerError,
  apiNotFound,
  apiError,
  apiValidationError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { resolveUserScope } from '@/lib/auth/scope';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, logActivity } from '@/lib/api/activity';
import { PRODUCTION_REVIEW_DELETE_BLOCKED_ERROR } from '@/lib/constants/task-review';
import { logError } from '@/lib/observability/log-error';

// =============================================================
// GET /api/boards/[id]
// Retrieve a single board with columns, labels, and project info
// =============================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('boards.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;

    // Verify non-admin employee has access to this board
    const scope = await resolveUserScope(auth);
    if (!scope.isAdmin && !scope.boardIds.includes(id)) {
      return apiError(t('common.noAccessBoard403'), 403);
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('pyra_boards')
      .select(`
        *,
        pyra_board_columns(id, name, color, position, wip_limit, is_done_column, requires_approval, approval_role, default_assignee, column_type),
        pyra_board_labels(id, name, color),
        pyra_projects!left(id, name)
      `)
      .eq('id', id)
      .single();

    if (error || !data) return apiNotFound(t('common.boardNotFound'));
    return apiSuccess(data);

  } catch (err) {
    console.error('[GET /api/boards/[id]] error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/boards/[id]
// Update board properties (name, description, position)
// =============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const body = await req.json();
    const allowed = ['name', 'description', 'position', 'view_mode', 'is_pipeline', 'auto_advance', 'default_task_type'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }
    updates.updated_at = new Date().toISOString();

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('pyra_boards')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return apiServerError(error.message);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'board_updated',
      `/dashboard/boards/${id}`,
      { updated_fields: Object.keys(updates).filter(k => k !== 'updated_at') },
    );

    return apiSuccess(data);

  } catch (err) {
    console.error('[PATCH /api/boards/[id]] error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/boards/[id]
// Delete a board and all its columns/tasks (cascade)
// =============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from('pyra_boards').delete().eq('id', id);
    if (error) {
      logError({
        error,
        request: req,
        metadata: { action: 'board_delete_writer', board_id: id },
      });
      if (
        error.code === 'P0001'
        && error.message.includes(PRODUCTION_REVIEW_DELETE_BLOCKED_ERROR)
      ) {
        return apiValidationError(t('tasks.productionReviewedTaskArchiveOnly'));
      }
      return apiServerError();
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.BOARD}_${ACTIVITY_ACTIONS.DELETE}`,
      `/dashboard/boards/${id}`,
      { source: 'board_delete', board_id: id },
    );

    return apiSuccess({ deleted: true });

  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'board_delete' } });
    return apiServerError();
  }
}
