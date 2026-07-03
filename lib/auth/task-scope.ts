// lib/auth/task-scope.ts — board-scope gate for task sub-resource routes.
//
// BASE_EMPLOYEE now grants `tasks.view` / `tasks.create` to every internal
// user, so permission alone no longer proves board membership. Any task
// sub-resource route (move / advance / assignees / comments / …) MUST combine
// the permission gate with a board-scope check so a user can only touch tasks
// on boards they can actually reach.
//
// Semantics (via resolveUserScope):
//   - admins bypass (scope.isAdmin === true) → always allowed
//   - otherwise the task's board_id must be in scope.boardIds (the resolved
//     team → project → board + direct board-member + assigned-task chain)
//   - a missing task returns false (deny — no board to authorise against)

import type { ApiAuthResult } from '@/lib/api/auth';
import { resolveUserScope } from '@/lib/auth/scope';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/** Check if the user can access the task's board via their resolved scope. */
export async function checkTaskScope(taskId: string, auth: ApiAuthResult): Promise<boolean> {
  const scope = await resolveUserScope(auth);
  if (scope.isAdmin) return true;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('pyra_tasks')
    .select('board_id')
    .eq('id', taskId)
    .maybeSingle();
  if (!data) return false;
  return scope.boardIds.includes(data.board_id);
}

/** Check board access when the board_id is already known (advance/approve). */
export async function checkBoardScope(boardId: string, auth: ApiAuthResult): Promise<boolean> {
  const scope = await resolveUserScope(auth);
  if (scope.isAdmin) return true;
  return scope.boardIds.includes(boardId);
}
