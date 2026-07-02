import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyMany } from '@/lib/notifications/notify';
import { generateDueRecurringInvoices } from '@/lib/finance/recurring-generation';
import { logError } from '@/lib/observability/log-error';
import { dubaiDayKey, formatCurrency } from '@/lib/utils/format';
import { INVOICE_STATUS, QUOTE_STATUS, CONTRACT_STATUS } from '@/lib/constants/statuses';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/cron/finance-daily
//
// Auth: x-api-key header → pyra_api_keys (Phase D §7 cron pattern)
// Permission: 'cron.finance-daily' (or '*' wildcard)
// Schedule: daily 08:30 Asia/Dubai (04:30 UTC) via n8n PyraFinance_Cron
//
// The daily finance cycle — 4 INTERNAL jobs, zero client-facing sends
// (locked decision 2026-07-03: nothing reaches clients automatically;
// payment reminders live in /api/finance/invoices/send-reminders behind the
// dunning_enabled flag and are NOT wired here):
//   1. Mark past-due sent/partially_paid invoices as overdue
//   2. Generate due recurring invoices as DRAFTS + notify admins to review
//   3. Expire sent/viewed quotes past their expiry date
//   4. Alert admins about active contracts ending within 30 days
//      (dedup: one notification per contract per 7 days)
//
// Each job has its own try/catch — one failure never blocks the others.
// Idempotency: job 1 and 3 are naturally idempotent (status-filtered
// updates); job 2's engine advances next_generation_date atomically with
// rollback; job 4 dedups via existing-notification lookup.
// ────────────────────────────────────────────────────────────────────────────

const CONTRACT_ALERT_WINDOW_DAYS = 30;
const CONTRACT_ALERT_DEDUP_DAYS = 7;

async function getActiveAdmins(supabase: ReturnType<typeof createServiceRoleClient>): Promise<string[]> {
  const { data } = await supabase
    .from('pyra_users')
    .select('username')
    .eq('role', 'admin')
    .eq('status', 'active');
  return (data || []).map((u: { username: string }) => u.username);
}

export async function POST(request: NextRequest) {
  try {
    // 1. Auth via x-api-key header → pyra_api_keys
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);

    // 2. Permission check accepting wildcard
    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.finance-daily') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.finance-daily', 403);
    }

    // 3. Service-role client (RLS bypass intentional for cron)
    const supabase = createServiceRoleClient();
    const today = dubaiDayKey();
    const admins = await getActiveAdmins(supabase);

    const summary = {
      marked_overdue: 0,
      recurring_generated: 0,
      recurring_failures: 0,
      quotes_expired: 0,
      contract_alerts: 0,
      job_errors: [] as string[],
    };

    // ── Job 1: mark overdue invoices ──────────────────────────────
    try {
      const { data: marked, error } = await supabase
        .from('pyra_invoices')
        .update({ status: INVOICE_STATUS.OVERDUE, updated_at: new Date().toISOString() })
        .in('status', [INVOICE_STATUS.SENT, INVOICE_STATUS.PARTIALLY_PAID])
        .lt('due_date', today)
        .gt('amount_due', 0)
        .select('id');
      if (error) throw error;
      summary.marked_overdue = (marked || []).length;
    } catch (err) {
      summary.job_errors.push('mark_overdue');
      logError({ error: err, request, metadata: { source: 'cron', action: 'finance-daily:mark_overdue' } });
      console.error('[cron/finance-daily] mark_overdue failed:', err);
    }

    // ── Job 2: generate due recurring invoices (drafts) ───────────
    try {
      const result = await generateDueRecurringInvoices(
        supabase,
        { username: 'system', display_name: 'النظام' },
        'cron'
      );
      summary.recurring_generated = result.generated;
      summary.recurring_failures = result.failures.length;

      // Internal admin heads-up: a draft needs review before it reaches
      // the client (drafts are invisible in the portal by design).
      for (const inv of result.generated_details) {
        await notifyMany(supabase, admins, {
          type: 'invoice_draft_generated',
          title: 'فاتورة دورية جديدة (مسودة) بانتظار مراجعتك',
          message: `${inv.title} — ${inv.invoice_number} بقيمة ${formatCurrency(inv.total, inv.currency)}`,
          link: `/dashboard/invoices/${inv.invoice_id}`,
          entity: { type: 'invoice', id: inv.invoice_id },
          from: { username: 'system', displayName: 'النظام' },
        });
      }
      if (result.failures.length > 0) {
        logError({
          severity: 'warning',
          error: new Error(`recurring generation failures: ${JSON.stringify(result.failures)}`),
          request,
          metadata: { source: 'cron', action: 'finance-daily:recurring' },
        });
      }
    } catch (err) {
      summary.job_errors.push('recurring_generate');
      logError({ error: err, request, metadata: { source: 'cron', action: 'finance-daily:recurring' } });
      console.error('[cron/finance-daily] recurring_generate failed:', err);
    }

    // ── Job 3: expire stale quotes ────────────────────────────────
    try {
      const { data: expired, error } = await supabase
        .from('pyra_quotes')
        .update({ status: QUOTE_STATUS.EXPIRED, updated_at: new Date().toISOString() })
        .in('status', [QUOTE_STATUS.SENT, QUOTE_STATUS.VIEWED])
        .lt('expiry_date', today)
        .not('expiry_date', 'is', null)
        .select('id');
      if (error) throw error;
      summary.quotes_expired = (expired || []).length;
    } catch (err) {
      summary.job_errors.push('quotes_expire');
      logError({ error: err, request, metadata: { source: 'cron', action: 'finance-daily:quotes_expire' } });
      console.error('[cron/finance-daily] quotes_expire failed:', err);
    }

    // ── Job 4: contracts ending soon (admin alert, 7-day dedup) ───
    try {
      const windowEnd = dubaiDayKey(new Date(Date.now() + CONTRACT_ALERT_WINDOW_DAYS * 86400000));
      const { data: endingContracts, error } = await supabase
        .from('pyra_contracts')
        .select('id, title, end_date, total_value, currency')
        .eq('status', CONTRACT_STATUS.ACTIVE)
        .not('end_date', 'is', null)
        .gte('end_date', today)
        .lte('end_date', windowEnd);
      if (error) throw error;

      const dedupSince = new Date(Date.now() - CONTRACT_ALERT_DEDUP_DAYS * 86400000).toISOString();
      for (const contract of endingContracts || []) {
        const { data: recent } = await supabase
          .from('pyra_notifications')
          .select('id')
          .eq('type', 'contract_expiring')
          .eq('entity_id', contract.id)
          .gte('created_at', dedupSince)
          .limit(1)
          .maybeSingle();
        if (recent) continue;

        await notifyMany(supabase, admins, {
          type: 'contract_expiring',
          title: 'عقد يقترب من الانتهاء',
          message: `العقد "${contract.title}" ينتهي في ${contract.end_date} — جدّد أو أقفله`,
          link: `/dashboard/finance/contracts/${contract.id}`,
          entity: { type: 'contract', id: contract.id },
          from: { username: 'system', displayName: 'النظام' },
        });
        summary.contract_alerts++;
      }
    } catch (err) {
      summary.job_errors.push('contract_alerts');
      logError({ error: err, request, metadata: { source: 'cron', action: 'finance-daily:contract_alerts' } });
      console.error('[cron/finance-daily] contract_alerts failed:', err);
    }

    console.log('[cron/finance-daily] done:', JSON.stringify(summary));
    return apiSuccess(summary);
  } catch (err) {
    logError({ error: err, request, metadata: { source: 'cron', action: 'finance-daily' } });
    console.error('[cron/finance-daily] threw:', err);
    return apiServerError();
  }
}
