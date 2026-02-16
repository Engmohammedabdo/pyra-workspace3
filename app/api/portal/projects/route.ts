import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';

/**
 * GET /api/portal/projects
 *
 * List projects belonging to the authenticated client.
 * Uses client_id for exact ownership check, with fallback to client_company
 * for legacy projects that predate the client_id column.
 *
 * Supports:
 *  - ?status=active|in_progress|review|completed|archived
 *  - ?search=keyword (ilike on project name)
 */
export async function GET(request: NextRequest) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const supabase = createServiceRoleClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    // Scope: client_id match OR (legacy: client_id is null AND company matches)
    // Escape company name to prevent PostgREST filter injection
    const safeCompany = escapePostgrestValue(client.company || '');
    let query = supabase
      .from('pyra_projects')
      .select('id, name, description, status, client_id, client_company, updated_at, created_at')
      .or(`client_id.eq.${client.id},and(client_id.is.null,client_company.eq.${safeCompany})`);

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      const escaped = escapeLike(search);
      query = query.ilike('name', `%${escaped}%`);
    }

    query = query.order('updated_at', { ascending: false });

    const { data: projects, error } = await query;

    if (error) {
      console.error('GET /api/portal/projects — query error:', error);
      return apiServerError();
    }

    return apiSuccess(projects || []);
  } catch (err) {
    console.error('GET /api/portal/projects error:', err);
    return apiServerError();
  }
}
