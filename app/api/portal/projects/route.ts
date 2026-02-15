import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';

/**
 * GET /api/portal/projects
 *
 * List all projects belonging to the authenticated client's company.
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

    let query = supabase
      .from('pyra_projects')
      .select('id, name, description, status, client_company, updated_at, created_at')
      .eq('client_company', client.company);

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      // Escape LIKE wildcards to prevent SQL injection
      const escaped = search.replace(/[%_]/g, '\\$&');
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
