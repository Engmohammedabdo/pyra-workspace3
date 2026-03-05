import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  return apiSuccess(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission('announcements.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('pyra_announcements').delete().eq('id', id);
  if (error) return apiServerError(error.message);
  return apiSuccess({ deleted: true });
}
