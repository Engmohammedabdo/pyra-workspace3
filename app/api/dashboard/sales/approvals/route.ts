import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { QUOTE_APPROVAL_FIELDS } from '@/lib/supabase/fields';
import { logActivity } from '@/lib/api/activity';

export async function GET() {
  try {
    const auth = await requireApiPermission('quote_approvals.view');
    if (isApiError(auth)) return auth;

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('pyra_quote_approvals')
      .select(`${QUOTE_APPROVAL_FIELDS}, pyra_quotes(id, quote_number, project_name, client_name, client_company, total, currency, status)`)
      .order('requested_at', { ascending: false });

    if (error) return apiServerError(error.message);
    logActivity(auth.pyraUser.username, auth.pyraUser.display_name, 'sale_approval_created', '/dashboard/sales', {});

    return apiSuccess(data);

  } catch (err) {
    console.error('[GET /api/dashboard/sales/approvals] error:', err);
    return apiServerError();
  }
}
