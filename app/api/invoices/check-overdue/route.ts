import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveUserScope } from '@/lib/auth/scope';
import { INVOICE_STATUS } from '@/lib/constants/statuses';
import { dubaiDayKey } from '@/lib/utils/format';

/**
 * POST /api/invoices/check-overdue
 * Mark invoices past their due date as "overdue".
 * Admin only.
 */
export async function POST(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('invoices.edit');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);

    // Non-admin with no accessible clients → nothing to check
    if (!scope.isAdmin && scope.clientIds.length === 0) {
      return apiSuccess({ updated_count: 0, invoices: [] });
    }

    const supabase = createServiceRoleClient();
    const today = dubaiDayKey();

    let query = supabase
      .from('pyra_invoices')
      .update({ status: INVOICE_STATUS.OVERDUE, updated_at: new Date().toISOString() })
      .in('status', [INVOICE_STATUS.SENT, INVOICE_STATUS.PARTIALLY_PAID])
      .lt('due_date', today);

    // Scope filtering: non-admins only check overdue for their accessible clients
    if (!scope.isAdmin) {
      query = query.in('client_id', scope.clientIds);
    }

    const { data: overdue, error } = await query.select('id, invoice_number');

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
