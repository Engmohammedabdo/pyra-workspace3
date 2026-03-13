import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { resolveUserScope } from '@/lib/auth/scope';

// =============================================================
// GET /api/boards/[id]
// Retrieve a single board with columns, labels, and project info
// =============================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('boards.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;

  // Verify non-admin employee has access to this board
  const scope = await resolveUserScope(auth);
  if (!scope.isAdmin && !scope.boardIds.includes(id)) {
    return apiError('ليس لديك صلاحية الوصول إلى هذه اللوحة', 403);
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('pyra_boards')
    .select(`
      *,
      pyra_board_columns(id, name, color, position, wip_limit, is_done_column),
      pyra_board_labels(id, name, color),
      pyra_projects!left(id, name)
    `)
    .eq('id', id)
    .single();

  if (error || !data) return apiNotFound('اللوحة غير موجودة');
  return apiSuccess(data);
}

// =============================================================
// PATCH /api/boards/[id]
// Update board properties (name, description, position)
// =============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('boards.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const body = await req.json();
  const allowed = ['name', 'description', 'position'];
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
  return apiSuccess(data);
}

// =============================================================
// DELETE /api/boards/[id]
// Delete a board and all its columns/tasks (cascade)
// =============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('boards.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('pyra_boards').delete().eq('id', id);
  if (error) return apiServerError(error.message);
  return apiSuccess({ deleted: true });
}
