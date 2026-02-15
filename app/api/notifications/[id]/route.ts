import { NextRequest } from 'next/server';
import { getApiAuth, getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// PATCH /api/notifications/[id]
// Mark a notification as read (recipient only)
// =============================================================
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    // Verify the notification belongs to the current user
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_notifications')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('الإشعار غير موجود');
    }

    if (existing.recipient_username !== auth.pyraUser.username) {
      return apiForbidden('لا يمكنك تعديل إشعارات مستخدم آخر');
    }

    const { data: updated, error } = await supabase
      .from('pyra_notifications')
      .update({ is_read: true })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Notification update error:', error);
      return apiServerError();
    }

    return apiSuccess(updated);
  } catch (err) {
    console.error('PATCH /api/notifications/[id] error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/notifications/[id]
// Delete a notification (admin or recipient)
// =============================================================
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    // Verify the notification exists
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_notifications')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return apiNotFound('الإشعار غير موجود');
    }

    // Only admin or recipient can delete
    const isAdmin = auth.pyraUser.role === 'admin';
    const isRecipient = existing.recipient_username === auth.pyraUser.username;

    if (!isAdmin && !isRecipient) {
      return apiForbidden('لا يمكنك حذف هذا الإشعار');
    }

    const { error } = await supabase
      .from('pyra_notifications')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Notification delete error:', error);
      return apiServerError();
    }

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/notifications/[id] error:', err);
    return apiServerError();
  }
}
