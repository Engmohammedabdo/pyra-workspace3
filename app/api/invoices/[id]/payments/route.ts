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

    if (['draft', 'cancelled'].includes(invoice.status)) {
      return apiValidationError('لا يمكن تسجيل دفعة لهذه الفاتورة');
    }

    // Insert payment
    const { data: payment, error: payError } = await supabase
      .from('pyra_payments')
      .insert({
        id: generateId('pay'),
        invoice_id: id,
        amount,
        payment_date: payment_date || new Date().toISOString().split('T')[0],
        method: method || 'bank_transfer',
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

    // Sum ALL payments for this invoice (race-condition safe)
    const { data: allPayments } = await supabase
      .from('pyra_payments')
      .select('amount')
      .eq('invoice_id', id);

    const newAmountPaid = (allPayments || []).reduce(
      (sum: number, p: { amount: number }) => sum + Number(p.amount), 0
    );
    const newAmountDue = invoice.total - newAmountPaid;
    const newStatus = newAmountDue <= 0 ? 'paid' : 'partially_paid';

    const { error: updateErr } = await supabase
      .from('pyra_invoices')
      .update({
        amount_paid: newAmountPaid,
        amount_due: Math.max(0, newAmountDue),
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateErr) console.error('Invoice amount update error:', updateErr);

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
        method: method || 'bank_transfer',
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

        const totalCollected = (allContractPayments || []).reduce(
          (sum: number, p: { amount: number }) => sum + Number(p.amount), 0
        );

        await supabase
          .from('pyra_contracts')
          .update({ amount_collected: totalCollected, updated_at: new Date().toISOString() })
          .eq('id', resolvedContractId);
      }
    }

    if (newStatus === 'paid') {
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
