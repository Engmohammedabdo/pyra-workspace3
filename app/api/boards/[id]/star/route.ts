import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// POST /api/boards/[id]/star — toggle star
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    return apiSuccess({ starred: false });
  } else {
    // Star
    const { error } = await supabase.from('pyra_board_stars').insert({
      id: generateId('bs'),
      board_id: boardId,
      username,
    });
    if (error) return apiServerError(error.message);
    return apiSuccess({ starred: true });
  }
}
