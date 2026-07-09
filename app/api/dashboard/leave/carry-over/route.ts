import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { calculateCarryOver } from '@/lib/leave/carry-over';

// =============================================================
// POST /api/dashboard/leave/carry-over
// Carry over leave balances from previous year to next year.
// =============================================================
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('leave.manage');
    if (isApiError(auth)) return auth;
    const t = await getTranslations('api');

    const { from_year, to_year } = await req.json();

    if (!from_year || !to_year) {
      return apiValidationError(t('leave.carryOverYearsRequired'));
    }

    if (typeof from_year !== 'number' || typeof to_year !== 'number') {
      return apiValidationError(t('leave.carryOverYearsMustBeNumbers'));
    }

    if (to_year <= from_year) {
      return apiValidationError(t('leave.carryOverToYearMustBeAfterFromYear'));
    }

    const supabase = createServiceRoleClient();
    const result = await calculateCarryOver(supabase, from_year, to_year);

    return apiSuccess({
      from_year,
      to_year,
      created: result.created,
      updated: result.updated,
      total_processed: result.details.length,
      details: result.details,
    });
  } catch (err) {
    console.error('POST /api/dashboard/leave/carry-over error:', err);
    return apiServerError();
  }
}
