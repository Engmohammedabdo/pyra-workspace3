import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { SUBSCRIPTION_STATUS } from '@/lib/constants/statuses';

/* eslint-disable @typescript-eslint/no-floating-promises */

/**
 * POST /api/finance/subscriptions/check-renewals
 * Check subscription renewals and send notifications.
 * - Due auto-renew: send approval notification (NO auto expense/renewal)
 * - Expired (past due + no auto_renew): mark as cancelled
 * - Upcoming (within 7 days): send reminder notifications
 * Intended for cron job / scheduled task execution.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();

  try {
    const today = new Date().toISOString().split('T')[0];
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);
    const in7DaysStr = in7Days.toISOString().split('T')[0];

    // ISO 8601 dates (YYYY-MM-DD) sort lexicographically in chronological order,
    // so string comparison with .lte() / .lt() is safe for date filtering.

    // ── 1. Notify about due auto-renew subscriptions (pending approval) ──
    const { data: dueAutoRenew } = await supabase
      .from('pyra_subscriptions')
      .select('id, name, provider, cost, currency, billing_cycle, next_renewal_date')
      .eq('status', SUBSCRIPTION_STATUS.ACTIVE)
      .eq('auto_renew', true)
      .lte('next_renewal_date', today);

    let pendingCount = 0;
    for (const sub of dueAutoRenew || []) {
      // Check if notification already sent for this renewal period
      const { data: existing } = await supabase
        .from('pyra_notifications')
        .select('id')
        .eq('type', 'subscription_renewal_approval')
        .ilike('message', `%${sub.id}%`)
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
        .maybeSingle();

      if (!existing) {
        void supabase.from('pyra_notifications').insert({
          id: generateId('nt'),
          recipient_username: 'admin',
          type: 'subscription_renewal_approval',
          title: 'اشتراك يحتاج موافقة على التجديد',
          message: `الاشتراك "${sub.name}" (${sub.provider || ''}) مستحق التجديد بقيمة ${sub.cost} ${sub.currency} — يحتاج موافقتك [${sub.id}]`,
          source_username: 'system',
          source_display_name: 'النظام',
          target_path: `/dashboard/finance/subscriptions`,
          is_read: false,
        });
        pendingCount++;
      }
    }

    // ── 2. Expire non-auto-renew subscriptions past due ──
    const { data: expired } = await supabase
      .from('pyra_subscriptions')
      .select('id, name, next_renewal_date')
      .eq('status', SUBSCRIPTION_STATUS.ACTIVE)
      .eq('auto_renew', false)
      .lt('next_renewal_date', today);

    let expiredCount = 0;
    for (const sub of expired || []) {
      await supabase
        .from('pyra_subscriptions')
        .update({
          status: SUBSCRIPTION_STATUS.CANCELLED,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id);

      void supabase.from('pyra_notifications').insert({
        id: generateId('nt'),
        recipient_username: 'admin',
        type: 'subscription_expired',
        title: 'اشتراك منتهي',
        message: `الاشتراك "${sub.name}" انتهى في ${sub.next_renewal_date} ولم يتم تجديده`,
        source_username: 'system',
        source_display_name: 'النظام',
        target_path: `/dashboard/finance/subscriptions`,
        is_read: false,
      });

      expiredCount++;
    }

    // ── 3. Notify about upcoming renewals (within 7 days) ──
    const { data: upcoming } = await supabase
      .from('pyra_subscriptions')
      .select('id, name, cost, currency, next_renewal_date')
      .eq('status', SUBSCRIPTION_STATUS.ACTIVE)
      .gt('next_renewal_date', today)
      .lte('next_renewal_date', in7DaysStr);

    let notified = 0;
    for (const sub of upcoming || []) {
      const { data: existing } = await supabase
        .from('pyra_notifications')
        .select('id')
        .eq('type', 'subscription_renewal_reminder')
        .ilike('message', `%${sub.id}%`)
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
        .maybeSingle();

      if (!existing) {
        const daysLeft = Math.ceil(
          (new Date(sub.next_renewal_date).getTime() - Date.now()) / 86400000
        );

        void supabase.from('pyra_notifications').insert({
          id: generateId('nt'),
          recipient_username: 'admin',
          type: 'subscription_renewal_reminder',
          title: 'تجديد اشتراك قريب',
          message: `الاشتراك "${sub.name}" سيتجدد خلال ${daysLeft} يوم بقيمة ${sub.cost} ${sub.currency} [${sub.id}]`,
          source_username: 'system',
          source_display_name: 'النظام',
          target_path: `/dashboard/finance/subscriptions`,
          is_read: false,
        });

        notified++;
      }
    }

    return apiSuccess({
      pending_approval: pendingCount,
      expired: expiredCount,
      notified,
      message: `${pendingCount} اشتراك ينتظر الموافقة، ${expiredCount} منتهي، ${notified} تنبيه`,
    });
  } catch (err) {
    console.error('POST /api/finance/subscriptions/check-renewals error:', err);
    return apiServerError();
  }
}

