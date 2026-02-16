import { NextRequest } from 'next/server';
import { getApiAuth, getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

// =============================================================
// GET /api/notifications
// List notifications for current user
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const searchParams = request.nextUrl.searchParams;
    const unreadOnly = searchParams.get('unread_only') === 'true';

    const supabase = await createServerSupabaseClient();

    // Build query
    let query = supabase
      .from('pyra_notifications')
      .select('id, type, title, message, source_username, source_display_name, target_path, is_read, created_at', { count: 'exact' })
      .eq('recipient_username', auth.pyraUser.username)
      .order('created_at', { ascending: false })
      .limit(50);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data: notifications, count, error } = await query;

    if (error) {
      console.error('Notifications list error:', error);
      return apiServerError();
    }

    // Get unread count separately
    const { count: unreadCount } = await supabase
      .from('pyra_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_username', auth.pyraUser.username)
      .eq('is_read', false);

    return apiSuccess(notifications || [], {
      total: count ?? 0,
      unread_count: unreadCount ?? 0,
    });
  } catch (err) {
    console.error('GET /api/notifications error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/notifications
// Create a notification (admin only)
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const body = await request.json();
    const { recipient_username, type, title, message, target_path } = body;

    // Validation
    if (!recipient_username?.trim()) {
      return apiValidationError('اسم المستخدم المستلم مطلوب');
    }
    if (!type?.trim()) {
      return apiValidationError('نوع الإشعار مطلوب');
    }
    if (!title?.trim()) {
      return apiValidationError('عنوان الإشعار مطلوب');
    }
    if (!message?.trim()) {
      return apiValidationError('رسالة الإشعار مطلوبة');
    }

    const supabase = await createServerSupabaseClient();

    const notificationId = generateId('n');

    const { data: notification, error } = await supabase
      .from('pyra_notifications')
      .insert({
        id: notificationId,
        recipient_username: recipient_username.trim(),
        type: type.trim(),
        title: title.trim(),
        message: message.trim(),
        source_username: admin.pyraUser.username,
        source_display_name: admin.pyraUser.display_name,
        target_path: target_path?.trim() || null,
        is_read: false,
      })
      .select()
      .single();

    if (error) {
      console.error('Notification create error:', error);
      return apiServerError();
    }

    return apiSuccess(notification, undefined, 201);
  } catch (err) {
    console.error('POST /api/notifications error:', err);
    return apiServerError();
  }
}
