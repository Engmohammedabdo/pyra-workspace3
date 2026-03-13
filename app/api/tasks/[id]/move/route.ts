import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// POST /api/tasks/[id]/move
// Move a task to a different column (and/or reorder)
// Reorders sibling tasks to prevent position collisions
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const { column_id, position } = await req.json();
  if (!column_id) return apiValidationError('column_id is required');

  const supabase = await createServerSupabaseClient();
  const newPosition = position ?? 0;

  // Get the task's current column to know if it's a cross-column move
  const { data: currentTask, error: taskError } = await supabase
    .from('pyra_tasks')
    .select('column_id, position')
    .eq('id', id)
    .single();

  if (taskError || !currentTask) {
    return apiServerError('المهمة غير موجودة');
  }

  const isCrossColumn = currentTask.column_id !== column_id;

  // Fetch all tasks in dest column (excluding the moved task), re-assign positions
  const { data: destTasks } = await supabase
    .from('pyra_tasks')
    .select('id, position')
    .eq('column_id', column_id)
    .neq('id', id)
    .order('position');

  if (destTasks) {
    let pos = 0;
    for (const t of destTasks) {
      if (pos === newPosition) pos++; // skip the slot for our task
      if (t.position !== pos) {
        await supabase
          .from('pyra_tasks')
          .update({ position: pos })
          .eq('id', t.id);
      }
      pos++;
    }
  }

  // Move the task
  const { data, error } = await supabase
    .from('pyra_tasks')
    .update({
      column_id,
      position: newPosition,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return apiServerError(error.message);

  // If cross-column, compact the source column positions
  if (isCrossColumn) {
    const { data: srcTasks } = await supabase
      .from('pyra_tasks')
      .select('id')
      .eq('column_id', currentTask.column_id)
      .order('position');

    if (srcTasks) {
      for (let i = 0; i < srcTasks.length; i++) {
        await supabase
          .from('pyra_tasks')
          .update({ position: i })
          .eq('id', srcTasks[i].id);
      }
    }
  }

  // Log task activity
  await supabase.from('pyra_task_activity').insert({
    id: generateId('tl'),
    task_id: id,
    username: auth.pyraUser.username,
    display_name: auth.pyraUser.display_name,
    action: 'moved',
    details: { column_id, position: newPosition },
  });

  return apiSuccess(data);
}
