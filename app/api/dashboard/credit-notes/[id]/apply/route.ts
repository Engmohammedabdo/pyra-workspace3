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
      .select('id, amount_due, invoice_number')
      .eq('id', cn.invoice_id)
      .single();

    if (!invoice) return apiValidationError('الفاتورة المرتبطة غير موجودة');

    // Apply: reduce invoice amount_due by credit note total
    const applyAmount = Math.min(cn.total, invoice.amount_due);
    const newAmountDue = Math.max(0, invoice.amount_due - applyAmount);

    // Update invoice
    const invoiceUpdate: Record<string, unknown> = {
      amount_due: newAmountDue,
      updated_at: new Date().toISOString(),
    };
    if (newAmountDue <= 0) invoiceUpdate.status = 'paid';
    else if (invoice.amount_due > newAmountDue) invoiceUpdate.status = 'partially_paid';

    await supabase
      .from('pyra_invoices')
      .update(invoiceUpdate)
      .eq('id', cn.invoice_id);

    // Update credit note status
    await supabase
      .from('pyra_credit_notes')
      .update({
        status: 'applied',
        applied_amount: applyAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Log activity
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
      },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ applied_amount: applyAmount, new_amount_due: newAmountDue });
  } catch (err) {
    console.error('POST credit-note apply error:', err);
    return apiServerError();
  }
}
