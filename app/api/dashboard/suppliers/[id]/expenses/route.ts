import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

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

    const totalAmount = (data || []).reduce((sum, e) => sum + Number(e.amount), 0);

    return apiSuccess(data || [], { total_amount: totalAmount, count: (data || []).length });
  } catch (e: unknown) {
    return apiServerError(e instanceof Error ? e.message : 'Unknown error');
  }
}
