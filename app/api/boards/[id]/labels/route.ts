import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// GET /api/boards/[id]/labels
// =============================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('boards.view');
  if (isApiError(auth)) return auth;

  const { id: boardId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('pyra_board_labels')
    .select('*')
    .eq('board_id', boardId)
    .order('name');

  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

// =============================================================
// POST /api/boards/[id]/labels — create label
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  return apiSuccess(data, undefined, 201);
}

// =============================================================
// PATCH /api/boards/[id]/labels — update label
// Body: { id, name?, color? }
// =============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  return apiSuccess(data);
}

// =============================================================
// DELETE /api/boards/[id]/labels?labelId=xxx
// =============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  return apiSuccess({ deleted: true });
}
