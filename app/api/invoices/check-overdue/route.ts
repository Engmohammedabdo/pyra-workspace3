import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * POST /api/invoices/check-overdue
 * Mark invoices past their due date as "overdue".
 * Admin only.
 */
export async function POST(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('invoices.edit');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const today = new Date().toISOString().split('T')[0];

    const { data: overdue, error } = await supabase
      .from('pyra_invoices')
      .update({ status: 'overdue', updated_at: new Date().toISOString() })
      .in('status', ['sent', 'partially_paid'])
      .lt('due_date', today)
      .select('id, invoice_number');

    if (error) {
      console.error('Check overdue error:', error);
      return apiServerError();
    }

    return apiSuccess({ updated_count: overdue?.length || 0, invoices: overdue || [] });
  } catch (err) {
    console.error('POST /api/invoices/check-overdue error:', err);
    return apiServerError();
  }
}
