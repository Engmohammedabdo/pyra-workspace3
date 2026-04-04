import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { QUOTE_STATUS } from '@/lib/constants/statuses';

/**
 * POST /api/quotes/check-expired
 * Batch-mark quotes past their expiry date as "expired".
 * Should be called by a cron job (e.g., daily).
 */
export async function POST(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('quotes.edit');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const today = new Date().toISOString().split('T')[0];

    const { data: expired, error } = await supabase
      .from('pyra_quotes')
      .update({ status: QUOTE_STATUS.EXPIRED, updated_at: new Date().toISOString() })
      .in('status', [QUOTE_STATUS.SENT, QUOTE_STATUS.VIEWED])
      .lt('expiry_date', today)
      .not('expiry_date', 'is', null)
      .select('id, quote_number');

    if (error) {
      console.error('Check expired quotes error:', error);
      return apiServerError();
    }

    return apiSuccess({ updated_count: expired?.length || 0, quotes: expired || [] });
  } catch (err) {
    console.error('POST /api/quotes/check-expired error:', err);
    return apiServerError();
  }
}
