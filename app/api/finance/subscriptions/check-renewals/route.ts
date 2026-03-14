import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

/**
 * POST /api/finance/subscriptions/check-renewals
 * Check and process subscription renewals.
 * - Auto-renew: advance next_renewal_date and log activity
 * - Expired (past due + no auto_renew): mark as cancelled
 * - Upcoming (within 7 days): send notifications
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

    // ── 1. Process past-due auto-renew subscriptions ──
    const { data: dueAutoRenew } = await supabase
      .from('pyra_subscriptions')
      .select('id, name, provider, cost, currency, billing_cycle, next_renewal_date')
      .eq('status', 'active')
      .eq('auto_renew', true)
      .lte('next_renewal_date', today);

    let renewed = 0;
    for (const sub of dueAutoRenew || []) {
      const nextDate = calculateNextRenewalDate(sub.next_renewal_date, sub.billing_cycle);

      await supabase
        .from('pyra_subscriptions')
        .update({
          next_renewal_date: nextDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id);

      // Log activity
      void supabase.from('pyra_activity_log').insert({
        id: generateId('al'),
        action_type: 'subscription_auto_renewed',
        username: 'system',
        display_name: 'النظام',
        target_path: `/dashboard/finance/subscriptions/${sub.id}`,
        details: {
          subscription_name: sub.name,
          provider: sub.provider,
          cost: sub.cost,
          currency: sub.currency,
          previous_date: sub.next_renewal_date,
          next_date: nextDate,
          billing_cycle: sub.billing_cycle,
        },
        ip_address: 'system',
      });

      renewed++;
    }

    // ── 2. Expire non-auto-renew subscriptions past due ──
    const { data: expired } = await supabase
      .from('pyra_subscriptions')
      .select('id, name, next_renewal_date')
      .eq('status', 'active')
      .eq('auto_renew', false)
      .lt('next_renewal_date', today);

    let expiredCount = 0;
    for (const sub of expired || []) {
      await supabase
        .from('pyra_subscriptions')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id);

      // Admin notification
      void supabase.from('pyra_notifications').insert({
        id: generateId('nt'),
        recipient_username: 'admin',
        type: 'subscription_expired',
        title: 'اشتراك منتهي',
        message: `الاشتراك "${sub.name}" انتهى في ${sub.next_renewal_date} ولم يتم تجديده`,
        source_username: 'system',
        source_display_name: 'النظام',
        target_path: `/dashboard/finance/subscriptions/${sub.id}`,
        is_read: false,
      });

      expiredCount++;
    }

    // ── 3. Notify about upcoming renewals (within 7 days) ──
    const { data: upcoming } = await supabase
      .from('pyra_subscriptions')
      .select('id, name, cost, currency, next_renewal_date')
      .eq('status', 'active')
      .gt('next_renewal_date', today)
      .lte('next_renewal_date', in7DaysStr);

    let notified = 0;
    for (const sub of upcoming || []) {
      // Check if notification was already sent for this renewal
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
          target_path: `/dashboard/finance/subscriptions/${sub.id}`,
          is_read: false,
        });

        notified++;
      }
    }

    return apiSuccess({
      renewed,
      expired: expiredCount,
      notified,
      message: `تم تجديد ${renewed} اشتراك، إنهاء ${expiredCount}، تنبيه ${notified}`,
    });
  } catch (err) {
    console.error('POST /api/finance/subscriptions/check-renewals error:', err);
    return apiServerError();
  }
}

/**
 * Calculate next renewal date based on billing cycle.
 */
function calculateNextRenewalDate(currentDate: string, billingCycle: string): string {
  const date = new Date(currentDate);
  const day = date.getDate();

  switch (billingCycle) {
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }

  // Fix month overflow
  if (date.getDate() !== day && billingCycle !== 'weekly') {
    date.setDate(0);
  }

  return date.toISOString().split('T')[0];
}
