import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

/**
 * POST /api/dashboard/credit-notes/[id]/apply
 * Apply credit note to its linked invoice — reduces amount_due.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('finance.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // Get credit note
    const { data: cn } = await supabase
      .from('pyra_credit_notes')
      .select('*')
      .eq('id', id)
      .single();

    if (!cn) return apiNotFound();
    if (cn.status === 'applied') return apiValidationError('الإشعار الدائن مطبق بالفعل');
    if (cn.status === 'cancelled') return apiValidationError('الإشعار الدائن ملغي');
    if (!cn.invoice_id) return apiValidationError('الإشعار الدائن غير مرتبط بفاتورة');

    // Get invoice
    const { data: invoice } = await supabase
      .from('pyra_invoices')
      .select('id, total, amount_paid, amount_due, invoice_number')
      .eq('id', cn.invoice_id)
      .single();

    if (!invoice) return apiValidationError('الفاتورة المرتبطة غير موجودة');

    // Apply: reduce invoice by credit note total (capped to amount_due)
    const applyAmount = Math.min(cn.total, invoice.amount_due);

    if (applyAmount <= 0) return apiValidationError('لا يوجد مبلغ مستحق لتطبيق الإشعار عليه');

    // 1. Create a NEGATIVE payment record (same pattern as refunds in Stripe webhook)
    const paymentId = generateId('pay');
    await supabase.from('pyra_payments').insert({
      id: paymentId,
      invoice_id: cn.invoice_id,
      amount: -applyAmount,
      payment_date: new Date().toISOString().split('T')[0],
      method: 'credit_note',
      reference: cn.credit_note_number,
      notes: `إشعار دائن ${cn.credit_note_number}${cn.reason ? ` — ${cn.reason}` : ''}`,
      recorded_by: auth.pyraUser.username,
    });

    // 2. Re-sum ALL payments (same safe pattern as payment recording)
    const { data: allPayments } = await supabase
      .from('pyra_payments')
      .select('amount')
      .eq('invoice_id', cn.invoice_id);

    const newAmountPaid = (allPayments || []).reduce(
      (sum: number, p: { amount: number }) => sum + Number(p.amount || 0), 0
    );
    const newAmountDue = Math.max(0, invoice.total - newAmountPaid);

    // 3. Update invoice with recalculated amounts
    let newStatus: string;
    if (newAmountPaid <= 0) newStatus = 'sent';
    else if (newAmountDue <= 0) newStatus = 'paid';
    else newStatus = 'partially_paid';

    await supabase
      .from('pyra_invoices')
      .update({
        amount_paid: Math.round(newAmountPaid * 100) / 100,
        amount_due: Math.round(newAmountDue * 100) / 100,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cn.invoice_id);

    // 4. Update credit note status
    await supabase
      .from('pyra_credit_notes')
      .update({
        status: 'applied',
        applied_amount: applyAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    // 5. Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'credit_note_applied',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/finance/credit-notes/${id}`,
      details: {
        credit_note_number: cn.credit_note_number,
        invoice_number: invoice.invoice_number,
        applied_amount: applyAmount,
        payment_id: paymentId,
        new_amount_paid: newAmountPaid,
        new_amount_due: newAmountDue,
      },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({
      applied_amount: applyAmount,
      new_amount_paid: Math.round(newAmountPaid * 100) / 100,
      new_amount_due: Math.round(newAmountDue * 100) / 100,
      new_status: newStatus,
    });
  } catch (err) {
    console.error('POST credit-note apply error:', err);
    return apiServerError();
  }
}
