import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { buildClientProjectScope } from '@/lib/supabase/scopes';
import { apiSuccess, apiUnauthorized, apiValidationError, apiServerError } from '@/lib/api/response';
import { escapeLike } from '@/lib/utils/path';

export async function GET(request: NextRequest) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const q = request.nextUrl.searchParams.get('q')?.trim();
    if (!q || q.length < 2) return apiValidationError('البحث يتطلب حرفين على الأقل');

    const supabase = createServiceRoleClient();
    const projectScope = buildClientProjectScope(client.id, client.company);
    const safeTerm = escapeLike(q);

    // Get client project IDs first
    const { data: clientProjects } = await supabase
      .from('pyra_projects')
      .select('id, name')
      .or(projectScope);
    const projectIds = (clientProjects || []).map(p => p.id);

    // Search in parallel
    const [filesResult, projectsResult, quotesResult] = await Promise.all([
      // Files search
      projectIds.length > 0
        ? supabase
            .from('pyra_project_files')
            .select('id, file_name, file_path, mime_type, file_size, project_id')
            .in('project_id', projectIds)
            .eq('client_visible', true)
            .ilike('file_name', `%${safeTerm}%`)
            .limit(8)
        : Promise.resolve({ data: [] }),

      // Projects search
      supabase
        .from('pyra_projects')
        .select('id, name, status, updated_at')
        .or(projectScope)
        .ilike('name', `%${safeTerm}%`)
        .limit(5),

      // Quotes search
      supabase
        .from('pyra_quotes')
        .select('id, quote_number, title, status, total_amount, created_at')
        .eq('client_id', client.id)
        .neq('status', 'draft')
        .or(`quote_number.ilike.%${safeTerm}%,title.ilike.%${safeTerm}%`)
        .limit(5),
    ]);

    return apiSuccess({
      files: (filesResult.data || []).map(f => ({
        id: f.id,
        name: f.file_name,
        path: f.file_path,
        type: 'file' as const,
        project: clientProjects?.find(p => p.id === f.project_id)?.name || '',
      })),
      projects: (projectsResult.data || []).map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        type: 'project' as const,
      })),
      quotes: (quotesResult.data || []).map(q => ({
        id: q.id,
        name: q.title || `عرض سعر #${q.quote_number}`,
        status: q.status,
        amount: q.total_amount,
        type: 'quote' as const,
      })),
    });
  } catch (err) {
    console.error('GET /api/portal/search error:', err);
    return apiServerError();
  }
}
