import { getPortalSession } from '@/lib/portal/auth';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { CONTRACT_FIELDS } from '@/lib/supabase/fields';

/**
 * GET /api/portal/contracts
 * List all contracts for the authenticated portal client.
 * Excludes draft contracts.
 */
export async function GET() {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const supabase = createServiceRoleClient();

    const { data: contracts, error } = await supabase
      .from('pyra_contracts')
      .select(CONTRACT_FIELDS)
      .eq('client_id', client.id)
      .neq('status', 'draft')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Portal contracts list error:', error);
      return apiServerError();
    }

    // Enrich with project names
    const projectIds = [...new Set((contracts || []).filter(c => c.project_id).map(c => c.project_id))];
    const projectMap: Record<string, string> = {};

    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('pyra_projects')
        .select('id, name')
        .in('id', projectIds);

      for (const p of projects || []) {
        projectMap[p.id] = p.name;
      }
    }

    const enriched = (contracts || []).map(c => ({
      ...c,
      project_name: c.project_id ? projectMap[c.project_id] || null : null,
    }));

    return apiSuccess(enriched, { total: enriched.length });
  } catch {
    return apiServerError();
  }
}
