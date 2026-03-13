import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// POST /api/boards/[id]/columns
// Create a new column in a board
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('boards.manage');
  if (isApiError(auth)) return auth;

  const { id: boardId } = await params;
  const { name, color, position } = await req.json();
  if (!name) return apiValidationError('اسم العمود مطلوب');

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('pyra_board_columns')
    .insert({
      id: generateId('bc'),
      board_id: boardId,
      name,
      color: color || 'gray',
      position: position ?? 0,
    })
    .select()
    .single();

  if (error) return apiServerError(error.message);
  return apiSuccess(data, undefined, 201);
}

// =============================================================
// PATCH /api/boards/[id]/columns
// Batch update column positions and properties
// Body: { columns: [{ id, position, name?, color? }] }
// =============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('boards.manage');
  if (isApiError(auth)) return auth;

  const { columns } = await req.json();
  if (!Array.isArray(columns)) return apiValidationError('columns must be an array');

  const supabase = await createServerSupabaseClient();

  // Batch update column positions and properties
  const errors: string[] = [];
  for (const col of columns) {
    const { error: updateErr } = await supabase
      .from('pyra_board_columns')
      .update({ position: col.position, name: col.name, color: col.color })
      .eq('id', col.id);
    if (updateErr) {
      errors.push(`Column ${col.id}: ${updateErr.message}`);
    }
  }

  if (errors.length > 0) {
    console.error('Column batch update errors:', errors);
    return apiServerError(`فشل في تحديث ${errors.length} عمود`);
  }

  return apiSuccess({ updated: true });
}
