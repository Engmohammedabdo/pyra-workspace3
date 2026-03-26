import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { invalidateScopeCache } from '@/lib/auth/scope';

// GET /api/boards/[id]/members
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('boards.view');
  if (isApiError(auth)) return auth;

  const { id: boardId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('pyra_board_members')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at');

  if (error) return apiServerError(error.message);

  // Enrich with display_name
  const usernames = (data || []).map((m: { username: string }) => m.username);
  const { data: users } = usernames.length > 0
    ? await supabase.from('pyra_users').select('username, display_name').in('username', usernames)
    : { data: [] };
  const userMap = new Map((users || []).map((u: { username: string; display_name: string }) => [u.username, u.display_name]));
  const enriched = (data || []).map((m: Record<string, unknown>) => ({
    ...m,
    display_name: userMap.get(m.username as string) || m.username,
  }));

  return apiSuccess(enriched);
}

// POST /api/boards/[id]/members — add member
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('boards.manage');
  if (isApiError(auth)) return auth;

  const { id: boardId } = await params;
  const { username, role } = await req.json();
  if (!username) return apiValidationError('اسم المستخدم مطلوب');

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('pyra_board_members')
    .insert({
      id: generateId('bm'),
      board_id: boardId,
      username,
      role: role || 'editor',
      added_by: auth.pyraUser.username,
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes('duplicate')) return apiValidationError('العضو موجود بالفعل');
    return apiServerError(error.message);
  }

  invalidateScopeCache(username);

  // Notify
  await supabase.from('pyra_notifications').insert({
    id: generateId('ntf'),
    username,
    type: 'board_member_added',
    title: 'تمت إضافتك إلى لوحة عمل',
    message: `أضافك ${auth.pyraUser.display_name} إلى لوحة عمل`,
    link: `/dashboard/boards/${boardId}`,
    is_read: false,
  });

  return apiSuccess(data, undefined, 201);
}

// DELETE /api/boards/[id]/members?username=xxx
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('boards.manage');
  if (isApiError(auth)) return auth;

  const { id: boardId } = await params;
  const username = req.nextUrl.searchParams.get('username');
  if (!username) return apiValidationError('username مطلوب');

  const supabase = await createServerSupabaseClient();
  await supabase.from('pyra_board_members').delete().eq('board_id', boardId).eq('username', username);
  invalidateScopeCache(username);

  return apiSuccess({ removed: username });
}
