import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { dispatchWebhookEvent } from '@/lib/webhooks/dispatcher';
import { resolveUserScope } from '@/lib/auth/scope';
import { logError } from '@/lib/observability/log-error';
import { INVOICE_STATUS, PAYMENT_METHOD } from '@/lib/constants/statuses';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/invoices/[id]/payments
 * Record a payment against an invoice.
 * Admin only.
 *
 * Body: { amount, payment_date?, method?, reference?, notes? }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('invoices.edit');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);
    const { id } = await context.params;
    const supabase = createServiceRoleClient();
    const body = await request.json();
    const { amount, payment_date, method, reference, notes } = body;

    if (!amount || amount <= 0) {
      return apiValidationError('مبلغ الدفع يجب أن يكون أكبر من صفر');
    }

    // Fetch invoice
    const { data: invoice } = await supabase
      .from('pyra_invoices')
      .select('id, status, total, amount_paid, amount_due, invoice_number, client_id, client_name, contract_id')
      .eq('id', id)
      .maybeSingle();

    if (!invoice) return apiNotFound('الفاتورة غير موجودة');

    // Scope check: non-admins can only record payments for their accessible clients
    if (!scope.isAdmin) {
      if (!invoice.client_id || !scope.clientIds.includes(invoice.client_id)) {
        return apiForbidden();
      }
    }

    if ([INVOICE_STATUS.DRAFT, INVOICE_STATUS.CANCELLED].includes(invoice.status)) {
      return apiValidationError('لا يمكن تسجيل دفعة لهذه الفاتورة');
    }

    if (invoice.status === INVOICE_STATUS.PAID) {
      return apiValidationError('الفاتورة مدفوعة بالكامل بالفعل');
    }

    // Prevent overpayment: amount must not exceed amount_due
    const currentDue = Number(invoice.amount_due) || (Number(invoice.total) - Number(invoice.amount_paid));
    if (amount > currentDue) {
      return apiValidationError(
        `مبلغ الدفع (${amount}) يتجاوز المبلغ المستحق (${currentDue.toFixed(2)})`
      );
    }

    // Insert payment
    const { data: payment, error: payError } = await supabase
      .from('pyra_payments')
      .insert({
        id: generateId('pay'),
        invoice_id: id,
        amount,
        payment_date: payment_date || new Date().toISOString().split('T')[0],
        method: method || PAYMENT_METHOD.BANK_TRANSFER,
        reference: reference || null,
        notes: notes || null,
        recorded_by: auth.pyraUser.username,
      })
      .select('*')
      .single();

    if (payError) {
      console.error('Payment insert error:', payError);
      return apiServerError();
    }

    // Race-condition safe: sum ALL payments then write the total.
    // If two payments are recorded concurrently, both re-sum independently.
    // The last write wins, but since both computed the full sum, the result is correct.
    const { data: allPayments } = await supabase
      .from('pyra_payments')
      .select('amount')
      .eq('invoice_id', id);

    const newAmountPaid = Math.round(
      (allPayments || []).reduce(
        (sum: number, p: { amount: number }) => sum + Number(p.amount), 0
      ) * 100
    ) / 100;
    // invoice.total already includes discount (total = subtotal - discount + tax)
    // so newAmountDue = total - paid is correct without further discount adjustment
    const newAmountDue = Math.round((invoice.total - newAmountPaid) * 100) / 100;
    const newStatus = newAmountDue <= 0 ? INVOICE_STATUS.PAID : INVOICE_STATUS.PARTIALLY_PAID;

    const { error: updateErr } = await supabase
      .from('pyra_invoices')
      .update({
        amount_paid: newAmountPaid,
        amount_due: Math.max(0, newAmountDue),
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) {
      // The payment row exists but the invoice totals were NOT persisted —
      // returning 201 here would report numbers that aren't in the DB
      // (finance audit 2026-07-02, F3). Backup-rollback: remove the payment
      // and fail loudly so the user retries a consistent operation.
      console.error('Invoice amount update error:', updateErr);
      const { error: rollbackErr } = await supabase
        .from('pyra_payments')
        .delete()
        .eq('id', payment.id);
      logError({
        error: updateErr,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: {
          source: 'payments',
          action: 'invoice_recompute_failed',
          invoice_id: id,
          payment_id: payment.id,
          rollback_ok: !rollbackErr,
        },
      });
      if (rollbackErr) {
        console.error('Payment rollback error:', rollbackErr);
        return apiServerError('سُجلت الدفعة لكن فشل تحديث الفاتورة — راجع الفاتورة يدويًا قبل إعادة المحاولة');
      }
      return apiServerError('فشل تحديث الفاتورة — لم يتم تسجيل الدفعة، أعد المحاولة');
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'payment_recorded',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/invoices/${id}`,
      details: {
        invoice_number: invoice.invoice_number,
        amount,
        method: method || PAYMENT_METHOD.BANK_TRANSFER,
        new_status: newStatus,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    // Update contract amount_collected (milestone-linked or retainer direct link)
    let resolvedContractId: string | null = null;

    // Check milestone link first
    const { data: milestone } = await supabase
      .from('pyra_contract_milestones')
      .select('contract_id')
      .eq('invoice_id', id)
      .maybeSingle();

    if (milestone?.contract_id) {
      resolvedContractId = milestone.contract_id;
    } else if (invoice.contract_id) {
      // Direct contract_id on invoice (retainer invoices)
      resolvedContractId = invoice.contract_id;
    }

    if (resolvedContractId) {
      // Sum-all approach: gather all invoices for this contract, then sum payments
      const { data: contractInvoices } = await supabase
        .from('pyra_invoices')
        .select('id')
        .eq('contract_id', resolvedContractId);

      const { data: milestoneInvoices } = await supabase
        .from('pyra_contract_milestones')
        .select('invoice_id')
        .eq('contract_id', resolvedContractId)
        .not('invoice_id', 'is', null);

      const allInvoiceIds = new Set<string>();
      (contractInvoices || []).forEach((i: { id: string }) => allInvoiceIds.add(i.id));
      (milestoneInvoices || []).forEach((m: { invoice_id: string | null }) => {
        if (m.invoice_id) allInvoiceIds.add(m.invoice_id);
      });

      if (allInvoiceIds.size > 0) {
        const { data: allContractPayments } = await supabase
          .from('pyra_payments')
          .select('amount')
          .in('invoice_id', Array.from(allInvoiceIds));

        const totalCollected = Math.round(
          (allContractPayments || []).reduce(
            (sum: number, p: { amount: number }) => sum + Number(p.amount), 0
          ) * 100
        ) / 100;

        await supabase
          .from('pyra_contracts')
          .update({ amount_collected: totalCollected, updated_at: new Date().toISOString() })
          .eq('id', resolvedContractId);
      }
    }

    // ── Auto-calculate commission for commission employees ──
    try {
      const { data: commissionSetting } = await supabase
        .from('pyra_settings')
        .select('value')
        .eq('key', 'commission_auto_calculate')
        .maybeSingle();

      if (commissionSetting?.value === 'true') {
        // Get global commission_rate as fallback
        const { data: rateSetting } = await supabase
          .from('pyra_settings')
          .select('value')
          .eq('key', 'commission_rate')
          .maybeSingle();
        const globalRate = parseFloat(rateSetting?.value || '0');

        // Find the project linked to this invoice
        const { data: invProject } = await supabase
          .from('pyra_invoices')
          .select('project_id')
          .eq('id', id)
          .maybeSingle();

        const projectId = invProject?.project_id;

        if (projectId) {
          // Find commission employees linked to this project via timesheets
          const { data: commissionEmployees } = await supabase
            .from('pyra_timesheets')
            .select('username')
            .eq('project_id', projectId)
            .eq('payment_type', 'commission');

          const uniqueUsernames = [...new Set((commissionEmployees || []).map((e: { username: string }) => e.username))];

          if (uniqueUsernames.length > 0) {
            // Fetch employee details (commission_rate per user)
            const { data: users } = await supabase
              .from('pyra_users')
              .select('username, display_name, commission_rate')
              .in('username', uniqueUsernames);

            for (const user of users || []) {
              const rate = user.commission_rate ?? globalRate;
              if (rate <= 0) continue;

              const commissionAmount = Math.round(amount * rate) / 100;
              if (commissionAmount <= 0) continue;

              await supabase.from('pyra_employee_payments').insert({
                id: generateId('ep'),
                username: user.username,
                display_name: user.display_name,
                type: 'bonus',
                source_type: 'commission',
                source_id: id,
                amount: commissionAmount,
                currency: 'AED',
                status: 'pending',
                notes: `عمولة تلقائية — فاتورة ${invoice.invoice_number} — ${rate}%`,
                created_by: 'system',
              });
            }
          }
        }
      }
    } catch (commErr) {
      // Commission calculation is non-critical; log and continue
      console.error('Commission auto-calculate error:', commErr);
    }

    if (newStatus === INVOICE_STATUS.PAID) {
      dispatchWebhookEvent('invoice_paid', { invoice_id: id, invoice_number: invoice.invoice_number, total: invoice.total, client_name: invoice.client_name });
    }

    return apiSuccess(payment, {
      new_status: newStatus,
      amount_paid: newAmountPaid,
      amount_due: Math.max(0, newAmountDue),
    }, 201);
  } catch (err) {
    console.error('POST /api/invoices/[id]/payments error:', err);
    return apiServerError();
  }
}
