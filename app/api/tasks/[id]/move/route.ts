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
  const auth = await requireApiPermission('tasks.create');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const body = await req.json();
  const { column_id, position, target_board_id } = body;
  if (!column_id) return apiValidationError('column_id is required');

  const supabase = await createServerSupabaseClient();
  const newPosition = position ?? 0;

  // Get the task's current column to know if it's a cross-column move
  const { data: currentTask, error: taskError } = await supabase
    .from('pyra_tasks')
    .select('column_id, position, board_id')
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

  // Calculate completion % for pipeline boards
  let completionPct: number | undefined;
  if (isCrossColumn) {
    const { data: taskFull } = await supabase
      .from('pyra_tasks')
      .select('board_id')
      .eq('id', id)
      .single();
    if (taskFull) {
      const { data: board } = await supabase
        .from('pyra_boards')
        .select('is_pipeline')
        .eq('id', taskFull.board_id)
        .single();
      if (board?.is_pipeline) {
        const { data: allCols } = await supabase
          .from('pyra_board_columns')
          .select('id, position')
          .eq('board_id', taskFull.board_id)
          .order('position');
        if (allCols) {
          const colIdx = allCols.findIndex(c => c.id === column_id);
          completionPct = Math.round(((colIdx + 1) / allCols.length) * 100);
        }
      }
    }
  }

  // Cross-board move
  const isCrossBoard = target_board_id && target_board_id !== currentTask.board_id;

  // Move the task
  const updatePayload: Record<string, unknown> = {
    column_id,
    position: newPosition,
    updated_at: new Date().toISOString(),
  };
  if (isCrossBoard) {
    updatePayload.board_id = target_board_id;
    // Remove board-specific labels when moving cross-board
    await supabase.from('pyra_task_labels').delete().eq('task_id', id);
  }
  if (isCrossColumn) {
    updatePayload.stage_entered_at = new Date().toISOString();
  }
  if (completionPct !== undefined) {
    updatePayload.completion_percentage = completionPct;
  }

  const { data, error } = await supabase
    .from('pyra_tasks')
    .update(updatePayload)
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
