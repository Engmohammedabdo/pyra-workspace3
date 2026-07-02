import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { sendEmail, emailTemplates } from '@/lib/email/mailer';
import { logError } from '@/lib/observability/log-error';
import { dubaiDayKey } from '@/lib/utils/format';
import { INVOICE_STATUS } from '@/lib/constants/statuses';

/**
 * POST /api/finance/invoices/send-reminders
 *
 * - Marks past-due sent/partially_paid invoices as overdue (always).
 * - Sends payment reminders (portal notification + email) for overdue
 *   invoices and gentle reminders for invoices due within 3 days — ONLY when
 *   the `dunning_enabled` setting is EXPLICITLY 'true'.
 *
 * Finance audit 2026-07-02 rework:
 * - All dedup-guard activity-log inserts were inert `void supabase` lazy
 *   thenables — the guards always found nothing, so every invocation
 *   re-emailed every overdue client. Inserts are now awaited.
 * - The late-penalty feature (compounding invoice total mutation) was REMOVED
 *   by decision: penalties, if ever needed, must be separate invoice line
 *   items — never a mutation of the invoice total.
 * - Client-facing sends are OFF by default (dunning_enabled must be 'true') —
 *   locked decision: nothing goes to clients until explicitly enabled.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();

  try {
    const today = dubaiDayKey();
    const in3Days = new Date(Date.now() + 3 * 86400000);
    const in3DaysStr = dubaiDayKey(in3Days);

    // ── Load settings ──
    const { data: settings } = await supabase
      .from('pyra_settings')
      .select('key, value')
      .in('key', ['company_name', 'dunning_enabled']);

    const settingsMap: Record<string, string> = {};
    for (const s of settings || []) settingsMap[s.key] = s.value;

    // Client-facing sends require explicit opt-in (locked decision 2026-07-02:
    // no client-facing automation until Abdou enables it).
    const dunningEnabled = settingsMap.dunning_enabled === 'true';
    const companyName = settingsMap.company_name || 'Pyramedia X';

    // ── 1. Mark overdue invoices (internal state — always runs) ──
    const { data: newOverdue } = await supabase
      .from('pyra_invoices')
      .select('id')
      .in('status', [INVOICE_STATUS.SENT, INVOICE_STATUS.PARTIALLY_PAID])
      .lt('due_date', today)
      .gt('amount_due', 0);

    let markedOverdue = 0;
    for (const inv of newOverdue || []) {
      const { error: updErr } = await supabase
        .from('pyra_invoices')
        .update({ status: INVOICE_STATUS.OVERDUE, updated_at: new Date().toISOString() })
        .eq('id', inv.id);
      if (!updErr) markedOverdue++;
    }

    if (!dunningEnabled) {
      return apiSuccess({
        marked_overdue: markedOverdue,
        reminders_sent: 0,
        gentle_reminders: 0,
        dunning_enabled: false,
        message: 'إرسال التذكيرات للعملاء معطّل (dunning_enabled ليست true)',
      });
    }

    // ── 2. Send reminders for overdue invoices ──
    const { data: overdueInvoices } = await supabase
      .from('pyra_invoices')
      .select('id, invoice_number, client_id, client_name, client_email, due_date, amount_due, total, currency')
      .eq('status', INVOICE_STATUS.OVERDUE)
      .gt('amount_due', 0);

    let remindersSent = 0;

    for (const inv of overdueInvoices || []) {
      const dueDate = new Date(inv.due_date + 'T00:00:00');
      const daysOverdue = Math.floor((Date.now() - dueDate.getTime()) / 86400000);

      // Dedup: one reminder per invoice per Dubai day. The guard reads the
      // SAME rows written below — both sides must stay awaited.
      const { data: recentReminder } = await supabase
        .from('pyra_activity_log')
        .select('id')
        .eq('action_type', 'invoice_reminder_sent')
        .eq('details->>invoice_id', inv.id)
        .gte('created_at', today + 'T00:00:00+04:00')
        .limit(1)
        .maybeSingle();

      if (recentReminder) continue;

      // Write the dedup marker FIRST — if the insert fails we skip sending
      // rather than risk repeat emails on the next run.
      const { error: logErr } = await supabase.from('pyra_activity_log').insert({
        id: generateId('al'),
        action_type: 'invoice_reminder_sent',
        username: 'system',
        display_name: 'النظام',
        target_path: `/dashboard/invoices/${inv.id}`,
        details: {
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          days_overdue: daysOverdue,
          amount_due: inv.amount_due,
        },
        ip_address: 'system',
      });
      if (logErr) {
        logError({
          error: logErr,
          request: req,
          metadata: { source: 'send-reminders', action: 'dedup_marker_insert', invoice_id: inv.id },
        });
        continue;
      }

      // Portal notification
      if (inv.client_id) {
        const { error: cnErr } = await supabase.from('pyra_client_notifications').insert({
          id: generateId('cn'),
          client_id: inv.client_id,
          type: 'payment_reminder',
          title: 'تذكير بدفع فاتورة',
          message: `الفاتورة ${inv.invoice_number} متأخرة ${daysOverdue} يوم — المبلغ المستحق: ${inv.amount_due} ${inv.currency}`,
          is_read: false,
        });
        if (cnErr) console.error('[send-reminders] client notification error:', cnErr.message);
      }

      // Email reminder
      if (inv.client_email) {
        const portalUrl = process.env.NEXT_PUBLIC_APP_URL || '';
        void sendEmail({
          to: inv.client_email,
          subject: `تذكير بدفع الفاتورة ${inv.invoice_number} — ${companyName}`,
          html: emailTemplates.invoiceReminder(
            inv.client_name || 'العميل',
            inv.invoice_number,
            `${inv.amount_due} ${inv.currency}`,
            inv.due_date,
            daysOverdue,
            '',
            `${portalUrl}/portal/invoices/${inv.id}`,
          ),
        });
      }

      remindersSent++;
    }

    // ── 3. Gentle reminders for invoices due within 3 days ──
    const { data: upcomingDue } = await supabase
      .from('pyra_invoices')
      .select('id, invoice_number, client_id, client_name, due_date, amount_due, currency')
      .in('status', [INVOICE_STATUS.SENT, INVOICE_STATUS.PARTIALLY_PAID])
      .gte('due_date', today)
      .lte('due_date', in3DaysStr)
      .gt('amount_due', 0);

    let gentleReminders = 0;
    for (const inv of upcomingDue || []) {
      if (!inv.client_id) continue;

      const daysLeft = Math.ceil(
        (new Date(inv.due_date + 'T00:00:00').getTime() - Date.now()) / 86400000
      );

      const { data: existing } = await supabase
        .from('pyra_activity_log')
        .select('id')
        .eq('action_type', 'invoice_due_reminder')
        .eq('details->>invoice_id', inv.id)
        .gte('created_at', today + 'T00:00:00+04:00')
        .limit(1)
        .maybeSingle();

      if (existing) continue;

      const { error: markerErr } = await supabase.from('pyra_activity_log').insert({
        id: generateId('al'),
        action_type: 'invoice_due_reminder',
        username: 'system',
        display_name: 'النظام',
        target_path: `/dashboard/invoices/${inv.id}`,
        details: { invoice_id: inv.id, invoice_number: inv.invoice_number, days_left: daysLeft },
        ip_address: 'system',
      });
      if (markerErr) {
        logError({
          error: markerErr,
          request: req,
          metadata: { source: 'send-reminders', action: 'gentle_marker_insert', invoice_id: inv.id },
        });
        continue;
      }

      const { error: cnErr } = await supabase.from('pyra_client_notifications').insert({
        id: generateId('cn'),
        client_id: inv.client_id,
        type: 'invoice_due_soon',
        title: 'فاتورة قريبة الاستحقاق',
        message: `الفاتورة ${inv.invoice_number} ستستحق خلال ${daysLeft} يوم — ${inv.amount_due} ${inv.currency}`,
        is_read: false,
      });
      if (cnErr) console.error('[send-reminders] client notification error:', cnErr.message);

      gentleReminders++;
    }

    return apiSuccess({
      marked_overdue: markedOverdue,
      reminders_sent: remindersSent,
      gentle_reminders: gentleReminders,
      dunning_enabled: true,
    });
  } catch (err) {
    logError({
      error: err,
      request: req,
      metadata: { source: 'send-reminders', action: 'run' },
    });
    console.error('POST /api/finance/invoices/send-reminders error:', err);
    return apiServerError();
  }
}
