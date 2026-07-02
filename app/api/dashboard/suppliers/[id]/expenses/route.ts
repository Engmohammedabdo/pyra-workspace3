import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { toAED } from '@/lib/utils/currency';
import { EXPENSE_STATUS } from '@/lib/constants/statuses';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const { data, error } = await supabase
      .from('pyra_expenses')
      .select('id, description, amount, currency, expense_date, vendor, status')
      .eq('supplier_id', id)
      .order('expense_date', { ascending: false })
      .limit(50);

    if (error) return apiServerError(error.message);

    // Money total = ALL approved rows for this supplier (not just the
    // visible page), AED-converted per row currency (Batch 4 — the old
    // total was a mixed-currency sum over the latest 50 rows only).
    const { data: approvedRows, error: totalErr } = await supabase
      .from('pyra_expenses')
      .select('amount, currency')
      .eq('supplier_id', id)
      .eq('status', EXPENSE_STATUS.APPROVED);
    if (totalErr) return apiServerError(totalErr.message);

    const totalAmount = Math.round(
      (approvedRows || []).reduce(
        (sum, e) => sum + toAED(Number(e.amount || 0), e.currency || 'AED'), 0
      ) * 100
    ) / 100;

    return apiSuccess(data || [], { total_amount: totalAmount, count: (data || []).length });
  } catch (e: unknown) {
    return apiServerError(e instanceof Error ? e.message : 'Unknown error');
  }
}
