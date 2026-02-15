import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';

/**
 * PATCH /api/portal/notifications/[id]
 *
 * Mark a single notification as read.
 * Verifies the notification belongs to the authenticated client.
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // ── Fetch the notification ────────────────────────
    const { data: notification } = await supabase
      .from('pyra_client_notifications')
      .select('id, client_id')
      .eq('id', id)
      .single();

    if (!notification) {
      return apiNotFound('الإشعار غير موجود');
    }

    // ── Verify ownership ──────────────────────────────
    if (notification.client_id !== client.id) {
      return apiForbidden('لا تملك صلاحية الوصول لهذا الإشعار');
    }

    // ── Mark as read ──────────────────────────────────
    const { data: updated, error } = await supabase
      .from('pyra_client_notifications')
      .update({ is_read: true })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('PATCH /api/portal/notifications/[id] — update error:', error);
      return apiServerError();
    }

    return apiSuccess(updated);
  } catch (err) {
    console.error('PATCH /api/portal/notifications/[id] error:', err);
    return apiServerError();
  }
}
