import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { AUTOMATION_TEMPLATES } from '@/lib/automation/templates';

// =============================================================
// GET /api/automations/templates
// Return available automation templates. Admin only.
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('automations.view');
    if (isApiError(auth)) return auth;

    return apiSuccess(AUTOMATION_TEMPLATES);
  } catch (err) {
    console.error('GET /api/automations/templates error:', err);
    return apiServerError();
  }
}
