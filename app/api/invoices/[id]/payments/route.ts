import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

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
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

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
      .select('id, status, total, amount_paid, amount_due, invoice_number, client_id, client_name')
      .eq('id', id)
      .maybeSingle();

    if (!invoice) return apiNotFound('الفاتورة غير موجودة');
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
        recorded_by: admin.pyraUser.username,
      })
      .select('*')
      .single();

    if (payError) {
      console.error('Payment insert error:', payError);
      return apiServerError();
    }

    // Update invoice amounts
    const newAmountPaid = (invoice.amount_paid || 0) + amount;
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
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/dashboard/invoices/${id}`,
      details: {
        invoice_number: invoice.invoice_number,
        amount,
        method: method || 'bank_transfer',
        new_status: newStatus,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

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
