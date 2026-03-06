import { NextResponse } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/dashboard/sidebar-badges
 * Returns badge counts for sidebar: unread notifications + overdue invoices.
 * Lightweight endpoint polled every 60s.
 */
export async function GET() {
  try {
    const auth = await getApiAuth();
    if (!auth) {
      return apiError('غير مصرح', 401);
    }

    const supabase = await createServerSupabaseClient();
    const username = auth.pyraUser.username;

    const [notifResult, overdueResult] = await Promise.all([
      // Unread notifications for this user
      supabase
        .from('pyra_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_username', username)
        .eq('is_read', false),
      // Overdue invoices
      supabase
        .from('pyra_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'overdue'),
    ]);

    return apiSuccess({
      notifications: notifResult.count ?? 0,
      overdue_invoices: overdueResult.count ?? 0,
    });
  } catch {
    return apiError('خطأ في الخادم', 500);
  }
}
