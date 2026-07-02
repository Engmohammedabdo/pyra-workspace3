import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
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

    // List stays unfiltered (shows pending/rejected) — money total counts approved rows only
    const totalAmount = (data || [])
      .filter((e) => e.status === EXPENSE_STATUS.APPROVED)
      .reduce((sum, e) => sum + Number(e.amount), 0);

    return apiSuccess(data || [], { total_amount: totalAmount, count: (data || []).length });
  } catch (e: unknown) {
    return apiServerError(e instanceof Error ? e.message : 'Unknown error');
  }
}
