import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiForbidden } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { invalidateScopeCache } from '@/lib/auth/scope';
import { checkBoardScope } from '@/lib/auth/task-scope';
import { logActivity } from '@/lib/api/activity';
import { notify } from '@/lib/notifications/notify';

// GET /api/boards/[id]/members
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('boards.view');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;

    if (!(await checkBoardScope(boardId, auth))) {
      return apiForbidden(t('common.noAccessBoard'));
    }

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

  } catch (err) {
    console.error('[GET /api/boards/[id]/members] error:', err);
    return apiServerError();
  }
}

// POST /api/boards/[id]/members — add member
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;
    const { username, role } = await req.json();
    if (!username) return apiValidationError(t('boards.usernameFieldRequired'));

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
      if (error.message.includes('duplicate')) return apiValidationError(t('boards.memberAlreadyExists'));
      return apiServerError(error.message);
    }

    invalidateScopeCache(username);

    // Notify (was previously broken — used wrong column names `username`/`link`)
    await notify(supabase, {
      to: username,
      type: 'task_assigned',
      title: 'تمت إضافتك إلى لوحة عمل', // i18n-exempt: notification content (Phase 8)
      message: `أضافك ${auth.pyraUser.display_name} إلى لوحة عمل`, // i18n-exempt: notification content (Phase 8)
      link: `/dashboard/boards/${boardId}`,
      entity: { type: 'board', id: boardId },
      from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
    });

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'board_member_added',
      `/dashboard/boards/${boardId}`,
      { member: username, role: role || 'editor' },
    );

    return apiSuccess(data, undefined, 201);

  } catch (err) {
    console.error('[POST /api/boards/[id]/members] error:', err);
    return apiServerError();
  }
}

// DELETE /api/boards/[id]/members?username=xxx
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;
    const username = req.nextUrl.searchParams.get('username');
    if (!username) return apiValidationError(t('common.usernameRequired'));

    const supabase = await createServerSupabaseClient();
    await supabase.from('pyra_board_members').delete().eq('board_id', boardId).eq('username', username);
    invalidateScopeCache(username);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'board_member_removed',
      `/dashboard/boards/${boardId}`,
      { member: username },
    );

    return apiSuccess({ removed: username });

  } catch (err) {
    console.error('[DELETE /api/boards/[id]/members] error:', err);
    return apiServerError();
  }
}
