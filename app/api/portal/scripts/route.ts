import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiUnauthorized, apiForbidden, apiServerError } from '@/lib/api/response';

const BUCKET = 'pyraai-workspace';
const SCRIPTS_PATH = 'projects/injazat/Etmam/video-scripts';

/** Allowed companies (lowercase check) */
const ALLOWED_COMPANIES = ['injazat', 'إنجازات', 'etmam', 'إتمام'];

function isAuthorizedCompany(company: string | null): boolean {
  if (!company) return false;
  const lower = company.toLowerCase();
  return ALLOWED_COMPANIES.some((c) => lower.includes(c));
}

/**
 * GET /api/portal/scripts
 *
 * List script files from Supabase Storage for authorized Etmam/Injazat clients.
 * Returns the file listing (name, id, updated_at, created_at, metadata).
 */
export async function GET() {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    if (!isAuthorizedCompany(client.company)) {
      return apiForbidden('هذه الصفحة مخصصة لعملاء مركز إتمام فقط');
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(SCRIPTS_PATH, {
        sortBy: { column: 'name', order: 'asc' },
      });

    if (error) {
      console.error('[portal/scripts] Storage list error:', error.message);
      return apiServerError('فشل في جلب السكريبتات');
    }

    return apiSuccess(data || []);
  } catch (err) {
    console.error('[portal/scripts] Unexpected error:', err);
    return apiServerError();
  }
}
