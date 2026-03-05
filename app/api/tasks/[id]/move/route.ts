import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// POST /api/tasks/[id]/move
// Move a task to a different column (and/or reorder)
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.create');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const { column_id, position } = await req.json();
  if (!column_id) return apiValidationError('column_id is required');

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('pyra_tasks')
    .update({
      column_id,
      position: position ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return apiServerError(error.message);

  // Log task activity
  await supabase.from('pyra_task_activity').insert({
    id: generateId('tl'),
    task_id: id,
    username: auth.pyraUser.username,
    display_name: auth.pyraUser.display_name,
    action: 'moved',
    details: { column_id },
  });

  return apiSuccess(data);
}
