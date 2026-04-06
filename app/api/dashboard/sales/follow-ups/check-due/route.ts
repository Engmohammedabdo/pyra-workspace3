import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { FOLLOW_UP_STATUS } from '@/lib/constants/statuses';

/**
 * POST /api/dashboard/sales/follow-ups/check-due
 * Checks for follow-ups that are due today or overdue,
 * and creates dashboard notifications for assigned agents.
 * Designed to be called by a cron job (e.g., every hour).
 */
export async function POST(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_leads.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Find pending follow-ups due today or overdue
    const { data: dueFollowUps, error } = await supabase
      .from('pyra_sales_follow_ups')
      .select('id, lead_id, title, due_at, assigned_to, notes')
      .eq('status', FOLLOW_UP_STATUS.PENDING)
      .lte('due_at', todayEnd.toISOString())
      .order('due_at', { ascending: true });

    if (error) return apiServerError(error.message);
    if (!dueFollowUps || dueFollowUps.length === 0) {
      return apiSuccess({ checked: 0, notified: 0 });
    }

    // Check which follow-ups already have a notification today
    // (to avoid duplicate notifications)
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const { data: existingNotifs } = await supabase
      .from('pyra_notifications')
      .select('target_path')
      .eq('type', 'follow_up_due')
      .gte('created_at', todayStart.toISOString());

    const notifiedPaths = new Set(existingNotifs?.map(n => n.target_path) || []);

    // F3: Update overdue follow-ups status to 'overdue'
    const overdueIds = dueFollowUps
      .filter(fu => new Date(fu.due_at) < now)
      .map(fu => fu.id);

    if (overdueIds.length > 0) {
      await supabase
        .from('pyra_sales_follow_ups')
        .update({ status: 'overdue' })
        .in('id', overdueIds)
        .eq('status', FOLLOW_UP_STATUS.PENDING);
    }

    const notifications = [];
    for (const fu of dueFollowUps) {
      const targetPath = `/dashboard/sales/follow-ups?highlight=${fu.id}`;
      if (notifiedPaths.has(targetPath)) continue;
      if (!fu.assigned_to) continue;

      const isOverdue = new Date(fu.due_at) < now;
      notifications.push({
        id: generateId('notif'),
        username: fu.assigned_to,
        type: 'follow_up_due',
        title: isOverdue ? '⚠️ متابعة متأخرة' : '🔔 متابعة مستحقة اليوم',
        message: fu.title || 'متابعة بدون عنوان',
        target_path: targetPath,
        source_display_name: 'نظام المتابعات',
        is_read: false,
        created_at: new Date().toISOString(),
      });
    }

    if (notifications.length > 0) {
      const { error: insertError } = await supabase
        .from('pyra_notifications')
        .insert(notifications);

      if (insertError) {
        console.error('Follow-up notification insert error:', insertError);
      }
    }

    return apiSuccess({
      checked: dueFollowUps.length,
      notified: notifications.length,
    });
  } catch (err) {
    console.error('Check due follow-ups error:', err);
    return apiServerError();
  }
}
