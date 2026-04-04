import { NextRequest } from 'next/server';
import { getApiAuth, requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiUnauthorized } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';

// GET: List all active announcements (for all users with announcements.view)
export async function GET() {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('pyra_announcements')
      .select('*')
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) return apiServerError(error.message);

    // Get read status for current user
    const { data: reads } = await supabase
      .from('pyra_announcement_reads')
      .select('announcement_id')
      .eq('username', auth.pyraUser.username);

    const readIds = new Set((reads || []).map(r => r.announcement_id));
    const enriched = (data || []).map(a => ({
      ...a,
      is_read: readIds.has(a.id),
    }));

    return apiSuccess(enriched);

  } catch (err) {
    console.error('[GET /api/announcements] error:', err);
    return apiServerError();
  }
}

// POST: Create announcement (requires announcements.manage)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('announcements.manage');
    if (isApiError(auth)) return auth;

    const { title, content, priority, is_pinned, target_teams, expires_at } = await req.json();
    if (!title || !content) return apiValidationError('العنوان والمحتوى مطلوبان');

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('pyra_announcements')
      .insert({
        id: generateId('ann'),
        title,
        content,
        priority: priority || 'normal',
        is_pinned: is_pinned || false,
        target_teams: target_teams || [],
        created_by: auth.pyraUser.username,
        expires_at: expires_at || null,
      })
      .select()
      .single();

    if (error) return apiServerError(error.message);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'announcement_created',
      `/dashboard/announcements`,
      { title, priority: priority || 'normal' },
    );

    return apiSuccess(data, undefined, 201);

  } catch (err) {
    console.error('[POST /api/announcements] error:', err);
    return apiServerError();
  }
}
