import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

/**
 * POST /api/finance/subscriptions/[id]/reject-renewal
 * Admin rejects a subscription renewal:
 * 1. Sets status to 'cancelled'
 * 2. Logs the activity
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason = body.reason?.trim() || null;

  const supabase = createServiceRoleClient();

  try {
    const { data: sub, error } = await supabase
      .from('pyra_subscriptions')
      .select('id, name, provider, cost, currency, next_renewal_date, status')
      .eq('id', id)
      .single();

    if (error || !sub) return apiNotFound('الاشتراك غير موجود');
    if (sub.status !== 'active') return apiError('الاشتراك غير نشط');

    // Cancel subscription
    await supabase
      .from('pyra_subscriptions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id);

    // Send notification
    void supabase.from('pyra_notifications').insert({
      id: generateId('nt'),
      recipient_username: 'admin',
      type: 'subscription_renewal_rejected',
      title: 'تم رفض تجديد اشتراك',
      message: `تم رفض تجديد الاشتراك "${sub.name}"${reason ? ` — السبب: ${reason}` : ''}`,
      source_username: auth.pyraUser.username,
      source_display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/finance/subscriptions`,
      is_read: false,
    });

    void supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'subscription_renewal_rejected',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/finance/subscriptions`,
      details: {
        subscription_name: sub.name,
        provider: sub.provider,
        renewal_date: sub.next_renewal_date,
        reason,
      },
      ip_address: 'system',
    });

    return apiSuccess({
      message: `تم رفض تجديد "${sub.name}" وإلغاء الاشتراك`,
    });
  } catch (err) {
    console.error('POST /api/finance/subscriptions/[id]/reject-renewal error:', err);
    return apiServerError();
  }
}
