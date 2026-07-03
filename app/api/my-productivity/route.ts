import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { computeProductivity } from '@/lib/production/report';
import { dubaiDayKey } from '@/lib/utils/format';
import { logError } from '@/lib/observability/log-error';

// =============================================================
// GET /api/my-productivity
// Current-month production stats for the CALLING employee only.
// Own-scope is hardcoded server-side (documents.view precedent).
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('productivity.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const month = dubaiDayKey().slice(0, 7);
    const report = await computeProductivity(supabase, month, [auth.pyraUser.username]);
    return apiSuccess(report);
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'my-productivity' } });
    console.error('[GET /api/my-productivity] error:', err);
    return apiServerError();
  }
}
