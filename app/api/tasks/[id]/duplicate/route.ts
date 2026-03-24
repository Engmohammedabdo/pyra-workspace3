import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// POST /api/tasks/[id]/duplicate
// Duplicate a task with all relations (labels, checklist, assignees)
// Body: { target_board_id?, target_column_id? } — optional cross-board
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('tasks.create');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const supabase = await createServerSupabaseClient();

  // Fetch original task
  const { data: original } = await supabase
    .from('pyra_tasks')
    .select('*, pyra_task_assignees(username), pyra_task_labels(label_id), pyra_task_checklist(title, position)')
    .eq('id', id)
    .single();

  if (!original) return apiNotFound('المهمة غير موجودة');

  const targetBoardId = body.target_board_id || original.board_id;
  const targetColumnId = body.target_column_id || original.column_id;

  // Get next task_number
  const { data: maxNum } = await supabase
    .from('pyra_tasks')
    .select('task_number')
    .eq('board_id', targetBoardId)
    .order('task_number', { ascending: false, nullsFirst: false })
    .limit(1)
    .single();

  // Get max position
  const { data: maxPos } = await supabase
    .from('pyra_tasks')
    .select('position')
    .eq('column_id', targetColumnId)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const newId = generateId('tk');
  const { data: newTask, error } = await supabase
    .from('pyra_tasks')
    .insert({
      id: newId,
      board_id: targetBoardId,
      column_id: targetColumnId,
      title: `نسخة — ${original.title}`,
      description: original.description,
      priority: original.priority,
      due_date: original.due_date,
      start_date: original.start_date,
      estimated_hours: original.estimated_hours,
      position: (maxPos?.position ?? -1) + 1,
      task_number: (maxNum?.task_number ?? 0) + 1,
      created_by: auth.pyraUser.username,
    })
    .select()
    .single();

  if (error) return apiServerError(error.message);

  // Copy assignees
  const assignees = original.pyra_task_assignees || [];
  if (assignees.length > 0) {
    await supabase.from('pyra_task_assignees').insert(
      assignees.map((a: { username: string }) => ({
        id: generateId('ta'),
        task_id: newId,
        username: a.username,
        assigned_by: auth.pyraUser.username,
      }))
    );
  }

  // Copy labels (only if same board)
  if (targetBoardId === original.board_id) {
    const labels = original.pyra_task_labels || [];
    if (labels.length > 0) {
      await supabase.from('pyra_task_labels').insert(
        labels.map((l: { label_id: string }) => ({ task_id: newId, label_id: l.label_id }))
      );
    }
  }

  // Copy checklist
  const checklist = original.pyra_task_checklist || [];
  if (checklist.length > 0) {
    await supabase.from('pyra_task_checklist').insert(
      checklist.map((c: { title: string; position: number }) => ({
        id: generateId('cl'),
        task_id: newId,
        title: c.title,
        is_checked: false,
        position: c.position,
      }))
    );
  }

  // Activity log
  await supabase.from('pyra_task_activity').insert({
    id: generateId('tl'),
    task_id: newId,
    username: auth.pyraUser.username,
    display_name: auth.pyraUser.display_name,
    action: 'created',
    details: JSON.stringify({ duplicated_from: id }),
  });

  return apiSuccess(newTask, undefined, 201);
}
