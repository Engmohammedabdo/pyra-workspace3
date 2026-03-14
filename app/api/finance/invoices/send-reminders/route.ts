import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { sendEmail, emailTemplates } from '@/lib/email/mailer';

/**
 * POST /api/finance/invoices/send-reminders
 * Send payment reminders for overdue and upcoming-due invoices.
 * - Overdue: sends email + notification to client
 * - Due within 3 days: sends gentle reminder
 * - Applies late penalty if configured (from pyra_settings)
 * Intended for cron job / scheduled task.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();

  try {
    const today = new Date().toISOString().split('T')[0];
    const in3Days = new Date();
    in3Days.setDate(in3Days.getDate() + 3);
    const in3DaysStr = in3Days.toISOString().split('T')[0];

    // ── Load settings ──
    const { data: settings } = await supabase
      .from('pyra_settings')
      .select('key, value')
      .in('key', ['late_penalty_rate', 'late_penalty_grace_days', 'company_name']);

    const settingsMap: Record<string, string> = {};
    for (const s of settings || []) settingsMap[s.key] = s.value;

    const penaltyRate = parseFloat(settingsMap.late_penalty_rate || '0'); // e.g., 2 = 2%
    const graceDays = parseInt(settingsMap.late_penalty_grace_days || '7');
    const companyName = settingsMap.company_name || 'Pyramedia X';

    // ── 1. Mark overdue invoices ──
    const { data: newOverdue } = await supabase
      .from('pyra_invoices')
      .select('id, invoice_number, client_id, client_name, client_email, due_date, amount_due, currency')
      .in('status', ['sent', 'partially_paid'])
      .lt('due_date', today)
      .gt('amount_due', 0);

    let markedOverdue = 0;
    for (const inv of newOverdue || []) {
      // Update status to overdue
      await supabase
        .from('pyra_invoices')
        .update({ status: 'overdue', updated_at: new Date().toISOString() })
        .eq('id', inv.id);

      markedOverdue++;
    }

    // ── 2. Send reminders for overdue invoices ──
    const { data: overdueInvoices } = await supabase
      .from('pyra_invoices')
      .select('id, invoice_number, client_id, client_name, client_email, due_date, amount_due, total, currency')
      .eq('status', 'overdue')
      .gt('amount_due', 0);

    let remindersSent = 0;
    let penaltiesApplied = 0;

    for (const inv of overdueInvoices || []) {
      const dueDate = new Date(inv.due_date + 'T00:00:00');
      const daysOverdue = Math.floor((Date.now() - dueDate.getTime()) / 86400000);

      // Check if reminder was already sent today
      const { data: recentReminder } = await supabase
        .from('pyra_activity_log')
        .select('id')
        .eq('action_type', 'invoice_reminder_sent')
        .ilike('details->>invoice_id', inv.id)
        .gte('created_at', today + 'T00:00:00')
        .maybeSingle();

      if (!recentReminder) {
        // Send client notification
        if (inv.client_id) {
          void supabase.from('pyra_client_notifications').insert({
            id: generateId('cn'),
            client_id: inv.client_id,
            type: 'payment_reminder',
            title: 'تذكير بدفع فاتورة',
            message: `الفاتورة ${inv.invoice_number} متأخرة ${daysOverdue} يوم — المبلغ المستحق: ${inv.amount_due} ${inv.currency}`,
            is_read: false,
          });
        }

        // Send email reminder
        if (inv.client_email) {
          const portalUrl = process.env.NEXT_PUBLIC_APP_URL || '';
          const penaltyWarning = penaltyRate > 0 && daysOverdue > graceDays
            ? `<p style="color: #dc2626;">⚠️ يرجى العلم أنه سيتم تطبيق غرامة تأخير بنسبة ${penaltyRate}% على المبالغ المتأخرة.</p>`
            : '';
          void sendEmail({
            to: inv.client_email,
            subject: `تذكير بدفع الفاتورة ${inv.invoice_number} — ${companyName}`,
            html: emailTemplates.invoiceReminder(
              inv.client_name || 'العميل',
              inv.invoice_number,
              `${inv.amount_due} ${inv.currency}`,
              inv.due_date,
              daysOverdue,
              penaltyWarning,
              `${portalUrl}/portal/invoices/${inv.id}`,
            ),
          });
        }

        // Log reminder
        void supabase.from('pyra_activity_log').insert({
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

        remindersSent++;
      }

      // ── Apply late penalty ──
      if (penaltyRate > 0 && daysOverdue > graceDays) {
        // Check if penalty was already applied for this invoice
        const { data: existingPenalty } = await supabase
          .from('pyra_activity_log')
          .select('id')
          .eq('action_type', 'late_penalty_applied')
          .ilike('details->>invoice_id', inv.id)
          .maybeSingle();

        if (!existingPenalty) {
          const penaltyAmount = Math.round(Number(inv.total) * (penaltyRate / 100) * 100) / 100;

          // Update invoice: increase total and amount_due by penalty
          await supabase
            .from('pyra_invoices')
            .update({
              total: Number(inv.total) + penaltyAmount,
              amount_due: Number(inv.amount_due) + penaltyAmount,
              notes: `${inv.invoice_number} — تم إضافة غرامة تأخير ${penaltyAmount} ${inv.currency} (${penaltyRate}%)`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', inv.id);

          // Log penalty
          void supabase.from('pyra_activity_log').insert({
            id: generateId('al'),
            action_type: 'late_penalty_applied',
            username: 'system',
            display_name: 'النظام',
            target_path: `/dashboard/invoices/${inv.id}`,
            details: {
              invoice_id: inv.id,
              invoice_number: inv.invoice_number,
              penalty_rate: penaltyRate,
              penalty_amount: penaltyAmount,
              days_overdue: daysOverdue,
            },
            ip_address: 'system',
          });

          penaltiesApplied++;
        }
      }
    }

    // ── 3. Send gentle reminders for invoices due within 3 days ──
    const { data: upcomingDue } = await supabase
      .from('pyra_invoices')
      .select('id, invoice_number, client_id, client_name, due_date, amount_due, currency')
      .in('status', ['sent', 'partially_paid'])
      .gte('due_date', today)
      .lte('due_date', in3DaysStr)
      .gt('amount_due', 0);

    let gentleReminders = 0;
    for (const inv of upcomingDue || []) {
      if (inv.client_id) {
        const daysLeft = Math.ceil(
          (new Date(inv.due_date + 'T00:00:00').getTime() - Date.now()) / 86400000
        );

        // Check for existing reminder today
        const { data: existing } = await supabase
          .from('pyra_activity_log')
          .select('id')
          .eq('action_type', 'invoice_due_reminder')
          .ilike('details->>invoice_id', inv.id)
          .gte('created_at', today + 'T00:00:00')
          .maybeSingle();

        if (!existing) {
          void supabase.from('pyra_client_notifications').insert({
            id: generateId('cn'),
            client_id: inv.client_id,
            type: 'invoice_due_soon',
            title: 'فاتورة قريبة الاستحقاق',
            message: `الفاتورة ${inv.invoice_number} ستستحق خلال ${daysLeft} يوم — ${inv.amount_due} ${inv.currency}`,
            is_read: false,
          });

          void supabase.from('pyra_activity_log').insert({
            id: generateId('al'),
            action_type: 'invoice_due_reminder',
            username: 'system',
            display_name: 'النظام',
            target_path: `/dashboard/invoices/${inv.id}`,
            details: { invoice_id: inv.id, invoice_number: inv.invoice_number, days_left: daysLeft },
            ip_address: 'system',
          });

          gentleReminders++;
        }
      }
    }

    return apiSuccess({
      marked_overdue: markedOverdue,
      reminders_sent: remindersSent,
      penalties_applied: penaltiesApplied,
      gentle_reminders: gentleReminders,
      penalty_rate: penaltyRate,
      grace_days: graceDays,
    });
  } catch (err) {
    console.error('POST /api/finance/invoices/send-reminders error:', err);
    return apiServerError();
  }
}
