import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
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
    const auth = await requireApiPermission('notifications.view');
    if (isApiError(auth)) return auth;

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
// Create a notification.
//
// Authorization: only admins may create cross-user notifications via this
// endpoint. Internal flows (task assignment, leave submission, etc.) use
// the `notify()` helper directly with the service-role client and do NOT
// hit this route. Self-addressed notifications (recipient_username === self)
// are also allowed — useful for personal reminders.
//
// Previously this required only `notifications.view` (in BASE_EMPLOYEE),
// which let any employee forge notifications to any user including admins.
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('notifications.view');
    if (isApiError(auth)) return auth;

    const body = await request.json();
    const { recipient_username, type, title, message, target_path } = body;

    // Enforce: cross-user notifications require admin.
    const isAdmin = auth.pyraUser.role === 'admin' ||
      (auth.pyraUser.rolePermissions || []).includes('*');
    const isSelfAddressed = recipient_username === auth.pyraUser.username;
    if (!isAdmin && !isSelfAddressed) {
      return apiForbidden('غير مصرح بإرسال إشعارات لمستخدمين آخرين');
    }

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
        source_username: auth.pyraUser.username,
        source_display_name: auth.pyraUser.display_name,
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
