import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { escapePostgrestValue } from '@/lib/utils/path';

/**
 * GET /api/clients/[id]/activity
 * Fetch recent activity log entries related to a specific client.
 * Includes direct client actions, and project/invoice/quote activity
 * tied to the client's company.
 * Admin only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('clients.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // ── Fetch client to get company name ────────────
    const { data: client, error: clientError } = await supabase
      .from('pyra_clients')
      .select('id, company')
      .eq('id', id)
      .maybeSingle();

    if (clientError) {
      console.error('Client fetch error:', clientError);
      return apiServerError();
    }

    if (!client) {
      return apiNotFound('العميل غير موجود');
    }

    // ── Build activity query with .or() filter ──────
    // Match activity that:
    //   1. Has target_path starting with /clients/{id} (direct client actions)
    //   2. Has details->client_id = id (invoice/quote created for this client)
    //   3. Has details->company = client.company (project activity for this company)
    const pathPattern = escapePostgrestValue(`/clients/${id}%`);
    const safeCompany = escapePostgrestValue(client.company);

    const { data: activity, error: activityError } = await supabase
      .from('pyra_activity_log')
      .select('id, action_type, username, display_name, target_path, details, created_at')
      .or(
        `target_path.like.${pathPattern},details->client_id.eq.${id},details->>company.eq.${safeCompany}`
      )
      .order('created_at', { ascending: false })
      .limit(50);

    if (activityError) {
      console.error('Client activity fetch error:', activityError);
      return apiServerError();
    }

    return apiSuccess(activity || []);
  } catch (err) {
    console.error('GET /api/clients/[id]/activity error:', err);
    return apiServerError();
  }
}
