import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';

/**
 * GET /api/portal/notifications
 *
 * List client notifications. Supports ?unread_only=true filter.
 * Ordered by created_at desc, limited to 50.
 *
 * PATCH /api/portal/notifications
 *
 * Mark all notifications as read for the authenticated client.
 */
export async function GET(request: NextRequest) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const supabase = createServiceRoleClient();
    const { searchParams } = new URL(request.url);
    const unreadOnly = searchParams.get('unread_only') === 'true';

    let query = supabase
      .from('pyra_client_notifications')
      .select('*')
      .eq('client_id', client.id);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    query = query.order('created_at', { ascending: false }).limit(50);

    const { data: notifications, error } = await query;

    if (error) {
      console.error('GET /api/portal/notifications — query error:', error);
      return apiServerError();
    }

    return apiSuccess(notifications || []);
  } catch (err) {
    console.error('GET /api/portal/notifications error:', err);
    return apiServerError();
  }
}

export async function PATCH() {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from('pyra_client_notifications')
      .update({ is_read: true })
      .eq('client_id', client.id)
      .eq('is_read', false);

    if (error) {
      console.error('PATCH /api/portal/notifications — update error:', error);
      return apiServerError();
    }

    return apiSuccess({ message: 'تم تعيين جميع الإشعارات كمقروءة' });
  } catch (err) {
    console.error('PATCH /api/portal/notifications error:', err);
    return apiServerError();
  }
}
