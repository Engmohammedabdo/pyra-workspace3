import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';
import { AUTOMATION_TEMPLATES } from '@/lib/automation/templates';

// =============================================================
// GET /api/automations/templates
// Return available automation templates. Admin only.
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    return apiSuccess(AUTOMATION_TEMPLATES);
  } catch (err) {
    console.error('GET /api/automations/templates error:', err);
    return apiServerError();
  }
}
