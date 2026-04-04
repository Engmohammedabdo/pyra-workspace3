import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/api/activity';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiPermission('announcements.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const body = await req.json();
    const allowed = ['title', 'content', 'priority', 'is_pinned', 'target_teams', 'expires_at'];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }
    updates.updated_at = new Date().toISOString();

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('pyra_announcements')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return apiServerError(error.message);
    if (!data) return apiNotFound('الإعلان غير موجود');

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'announcement_updated',
      `/dashboard/announcements`,
      { announcement_id: id, fields: Object.keys(updates).filter(k => k !== 'updated_at') },
    );

    return apiSuccess(data);

  } catch (err) {
    console.error('[PATCH /api/announcements/[id]] error:', err);
    return apiServerError();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiPermission('announcements.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from('pyra_announcements').delete().eq('id', id);
    if (error) return apiServerError(error.message);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'announcement_deleted',
      `/dashboard/announcements`,
      { announcement_id: id },
    );

    return apiSuccess({ deleted: true });

  } catch (err) {
    console.error('[DELETE /api/announcements/[id]] error:', err);
    return apiServerError();
  }
}
