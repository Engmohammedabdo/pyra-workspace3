import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// POST /api/notifications/read-all
// Mark all notifications as read for current user
// =============================================================
export async function POST() {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('pyra_notifications')
      .update({ is_read: true })
      .eq('recipient_username', auth.pyraUser.username)
      .eq('is_read', false)
      .select('id');

    if (error) {
      console.error('Mark all read error:', error);
      return apiServerError();
    }

    return apiSuccess({
      marked_count: data?.length ?? 0,
    });
  } catch (err) {
    console.error('POST /api/notifications/read-all error:', err);
    return apiServerError();
  }
}
