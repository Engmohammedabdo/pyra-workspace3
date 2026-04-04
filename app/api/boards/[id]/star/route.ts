import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';

// POST /api/boards/[id]/star — toggle star
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('boards.view');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;
    const username = auth.pyraUser.username;
    const supabase = await createServerSupabaseClient();

    // Check if already starred
    const { data: existing } = await supabase
      .from('pyra_board_stars')
      .select('id')
      .eq('board_id', boardId)
      .eq('username', username)
      .maybeSingle();

    if (existing) {
      // Unstar
      await supabase.from('pyra_board_stars').delete().eq('id', existing.id);
      logActivity(username, auth.pyraUser.display_name, 'board_unstarred', `/dashboard/boards/${boardId}`, { board_id: boardId });
      return apiSuccess({ starred: false });
    } else {
      // Star
      const { error } = await supabase.from('pyra_board_stars').insert({
        id: generateId('bs'),
        board_id: boardId,
        username,
      });
      if (error) return apiServerError(error.message);
      logActivity(username, auth.pyraUser.display_name, 'board_starred', `/dashboard/boards/${boardId}`, { board_id: boardId });
      return apiSuccess({ starred: true });
    }

  } catch (err) {
    console.error('[POST /api/boards/[id]/star] error:', err);
    return apiServerError();
  }
}
