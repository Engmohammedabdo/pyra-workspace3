import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { CREDIT_NOTE_STATUS, INVOICE_STATUS, PAYMENT_METHOD } from '@/lib/constants/statuses';
import { logError } from '@/lib/observability/log-error';
import { dubaiDayKey } from '@/lib/utils/format';

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
    if (cn.status === CREDIT_NOTE_STATUS.APPLIED) return apiValidationError('الإشعار الدائن مطبق بالفعل');
    if (cn.status === CREDIT_NOTE_STATUS.CANCELLED) return apiValidationError('الإشعار الدائن ملغي');
    if (!cn.invoice_id) return apiValidationError('الإشعار الدائن غير مرتبط بفاتورة');

    // Get invoice
    const { data: invoice } = await supabase
      .from('pyra_invoices')
      .select('id, total, amount_paid, amount_due, invoice_number')
      .eq('id', cn.invoice_id)
      .single();

    if (!invoice) return apiValidationError('الفاتورة المرتبطة غير موجودة');

    // Apply credit note as a refund — works on paid invoices too
    // Credit note reduces what was paid (creates negative payment)
    const applyAmount = Math.round(Number(cn.total) * 100) / 100;

    if (applyAmount <= 0) return apiValidationError('مبلغ الإشعار الدائن صفر');

    // Cap apply amount at invoice amount_due to prevent over-crediting
    const currentDue = Math.round(Number(invoice.amount_due || 0) * 100) / 100;
    if (applyAmount > currentDue) {
      return apiValidationError(
        `مبلغ الإشعار الدائن (${applyAmount}) يتجاوز المبلغ المستحق على الفاتورة (${currentDue})`
      );
    }

    // 0. Atomically CLAIM the credit note before writing any money — two
    // concurrent applies both pass the guards above; the .eq('status')
    // conditional update lets exactly one win (finance audit 2026-07-02,
    // F-CN-GUARD).
    const { data: claimed, error: claimErr } = await supabase
      .from('pyra_credit_notes')
      .update({
        status: CREDIT_NOTE_STATUS.APPLIED,
        applied_amount: applyAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', cn.status)
      .select('id')
      .maybeSingle();

    if (claimErr || !claimed) {
      return apiValidationError('تعذر تطبيق الإشعار الدائن — تغيّرت حالته (ربما طُبّق بالفعل). أعد تحميل الصفحة');
    }

    // Re-validate the cap AFTER the claim with a FRESH read — the pre-claim
    // check used a potentially stale amount_due (another credit note or a
    // payment may have landed in between). Reviewer finding 2026-07-02.
    const { data: freshInv } = await supabase
      .from('pyra_invoices')
      .select('amount_due')
      .eq('id', cn.invoice_id)
      .maybeSingle();
    const freshDue = Math.round(Number(freshInv?.amount_due ?? 0) * 100) / 100;
    if (applyAmount > freshDue) {
      await supabase
        .from('pyra_credit_notes')
        .update({ status: cn.status, applied_amount: cn.applied_amount || 0, updated_at: new Date().toISOString() })
        .eq('id', id);
      return apiValidationError(
        `مبلغ الإشعار الدائن (${applyAmount}) يتجاوز المبلغ المستحق الحالي على الفاتورة (${freshDue})`
      );
    }

    // 1. Create a NEGATIVE payment record (same pattern as refunds in Stripe webhook)
    const paymentId = generateId('pay');
    const { error: payErr } = await supabase.from('pyra_payments').insert({
      id: paymentId,
      invoice_id: cn.invoice_id,
      amount: -applyAmount,
      payment_date: dubaiDayKey(),
      method: PAYMENT_METHOD.CREDIT_NOTE,
      reference: cn.credit_note_number,
      notes: `إشعار دائن ${cn.credit_note_number}${cn.reason ? ` — ${cn.reason}` : ''}`,
      recorded_by: auth.pyraUser.username,
    });

    if (payErr) {
      // Roll the claim back — the money write failed, the CN must not stay
      // marked applied with no payment behind it.
      await supabase
        .from('pyra_credit_notes')
        .update({ status: cn.status, applied_amount: cn.applied_amount || 0, updated_at: new Date().toISOString() })
        .eq('id', id);
      logError({
        error: payErr,
        request: req,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'credit-notes', action: 'apply_payment_insert', credit_note_id: id },
      });
      return apiServerError('فشل تسجيل دفعة الإشعار الدائن — لم يتم التطبيق');
    }

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
    if (newAmountPaid <= 0) newStatus = INVOICE_STATUS.SENT;
    else if (newAmountDue <= 0) newStatus = INVOICE_STATUS.PAID;
    else newStatus = INVOICE_STATUS.PARTIALLY_PAID;

    await supabase
      .from('pyra_invoices')
      .update({
        amount_paid: Math.round(newAmountPaid * 100) / 100,
        amount_due: Math.round(newAmountDue * 100) / 100,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cn.invoice_id);

    // 4. (credit note already claimed as APPLIED in step 0)

    // 5. Update contract amount_collected if invoice is linked to a contract
    //    (same pattern as payment recording in /api/invoices/[id]/payments)
    const { data: fullInv } = await supabase
      .from('pyra_invoices')
      .select('contract_id')
      .eq('id', cn.invoice_id)
      .maybeSingle();

    let resolvedContractId: string | null = fullInv?.contract_id || null;
    if (!resolvedContractId) {
      const { data: milestone } = await supabase
        .from('pyra_contract_milestones')
        .select('contract_id')
        .eq('invoice_id', cn.invoice_id)
        .maybeSingle();
      resolvedContractId = milestone?.contract_id || null;
    }

    if (resolvedContractId) {
      const { data: contractInvoices } = await supabase
        .from('pyra_invoices').select('id').eq('contract_id', resolvedContractId);
      const { data: milestoneInvoices } = await supabase
        .from('pyra_contract_milestones').select('invoice_id').eq('contract_id', resolvedContractId).not('invoice_id', 'is', null);

      const allInvoiceIds = new Set<string>();
      (contractInvoices || []).forEach((i: { id: string }) => allInvoiceIds.add(i.id));
      (milestoneInvoices || []).forEach((m: { invoice_id: string | null }) => { if (m.invoice_id) allInvoiceIds.add(m.invoice_id); });

      if (allInvoiceIds.size > 0) {
        const { data: allContractPayments } = await supabase
          .from('pyra_payments').select('amount').in('invoice_id', Array.from(allInvoiceIds));
        const totalCollected = (allContractPayments || []).reduce(
          (sum: number, p: { amount: number }) => sum + Number(p.amount), 0
        );
        await supabase.from('pyra_contracts')
          .update({ amount_collected: totalCollected, updated_at: new Date().toISOString() })
          .eq('id', resolvedContractId);
      }
    }

    // 6. Log activity
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
