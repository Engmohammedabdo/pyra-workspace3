import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

/**
 * POST /api/finance/contracts/check-alerts
 * Check for upcoming retainer billing and overdue retainer invoices.
 * Creates notifications for admins and clients.
 * Intended to be called by a cron job or scheduled task.
 */
export async function POST() {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();

  try {
    const today = new Date();
    const threeDaysLater = new Date();
    threeDaysLater.setDate(today.getDate() + 3);
    const todayStr = today.toISOString().split('T')[0];
    const threeDaysStr = threeDaysLater.toISOString().split('T')[0];

    let alertsCreated = 0;

    // ── 1. Upcoming billing alerts (next_generation_date within 3 days) ──
    const { data: upcomingTemplates } = await supabase
      .from('pyra_recurring_invoices')
      .select('id, contract_id, client_id, title, next_generation_date')
      .eq('status', 'active')
      .gte('next_generation_date', todayStr)
      .lte('next_generation_date', threeDaysStr);

    for (const template of upcomingTemplates || []) {
      // Admin notification
      await supabase.from('pyra_notifications').insert({
        id: generateId('ntf'),
        username: auth.pyraUser.username,
        type: 'retainer_billing_upcoming',
        title: 'فاتورة اشتراك قادمة',
        message: `ستصدر فاتورة "${template.title}" بتاريخ ${template.next_generation_date}`,
        action_url: template.contract_id ? `/dashboard/finance/contracts/${template.contract_id}` : null,
        is_read: false,
      }).then(null, (e: unknown) => console.error('Alert insert error:', e));

      // Client notification
      if (template.client_id) {
        await supabase.from('pyra_client_notifications').insert({
          id: generateId('cn'),
          client_id: template.client_id,
          type: 'billing_upcoming',
          title: 'فاتورة قادمة',
          message: `ستصدر فاتورتك قريباً — ${template.title}`,
          target_project_id: null,
          target_file_id: null,
        }).then(null, (e: unknown) => console.error('Client alert error:', e));
      }

      alertsCreated++;
    }

    // ── 2. Overdue retainer invoices ──
    const { data: overdueInvoices } = await supabase
      .from('pyra_invoices')
      .select('id, invoice_number, contract_id, client_id, total, currency, due_date')
      .not('contract_id', 'is', null)
      .lt('due_date', todayStr)
      .not('status', 'in', '("paid","cancelled")');

    for (const inv of overdueInvoices || []) {
      await supabase.from('pyra_notifications').insert({
        id: generateId('ntf'),
        username: auth.pyraUser.username,
        type: 'retainer_invoice_overdue',
        title: 'فاتورة اشتراك متأخرة',
        message: `الفاتورة ${inv.invoice_number} (${inv.total} ${inv.currency}) متأخرة منذ ${inv.due_date}`,
        action_url: `/dashboard/invoices/${inv.id}`,
        is_read: false,
      }).then(null, (e: unknown) => console.error('Alert insert error:', e));

      alertsCreated++;
    }

    return apiSuccess(
      { alerts_created: alertsCreated },
      { message: `تم إنشاء ${alertsCreated} تنبيه` }
    );
  } catch (err) {
    console.error('POST /api/finance/contracts/check-alerts error:', err);
    return apiServerError();
  }
}
