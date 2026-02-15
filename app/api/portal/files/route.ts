import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';

/**
 * GET /api/portal/files
 *
 * Returns all files across the client's projects, each enriched with:
 *  - project_name
 *  - approval status (pending | approved | revision_requested)
 *
 * Response shape: Array of { id, file_name, file_type, file_size, file_path,
 *   added_at, project_id, project_name, approval: { id, status, comment } | null }
 *
 * Supports:
 *  - ?project_id=xxx  — filter by project
 *  - ?status=pending|approved|revision_requested — filter by approval status
 *  - ?search=keyword  — search by file_name (ilike)
 */
export async function GET(request: NextRequest) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const supabase = createServiceRoleClient();
    const { searchParams } = new URL(request.url);
    const projectIdFilter = searchParams.get('project_id');
    const statusFilter = searchParams.get('status');
    const search = searchParams.get('search');

    // ── Get client's projects ─────────────────────────
    let projectQuery = supabase
      .from('pyra_projects')
      .select('id, name')
      .eq('client_company', client.company);

    if (projectIdFilter) {
      projectQuery = projectQuery.eq('id', projectIdFilter);
    }

    const { data: projects, error: projectsError } = await projectQuery;

    if (projectsError) {
      console.error('GET /api/portal/files — projects error:', projectsError);
      return apiServerError();
    }

    if (!projects || projects.length === 0) {
      return apiSuccess([]);
    }

    const projectMap = new Map(projects.map((p) => [p.id, p.name]));
    const projectIds = projects.map((p) => p.id);

    // ── Get all project files ─────────────────────────
    let filesQuery = supabase
      .from('pyra_project_files')
      .select('id, project_id, file_name, file_type, file_size, file_path, added_at')
      .in('project_id', projectIds)
      .order('added_at', { ascending: false });

    if (search) {
      // Escape LIKE wildcards
      const escaped = search.replace(/[%_]/g, '\\$&');
      filesQuery = filesQuery.ilike('file_name', `%${escaped}%`);
    }

    const { data: files, error: filesError } = await filesQuery;

    if (filesError) {
      console.error('GET /api/portal/files — files error:', filesError);
      return apiServerError();
    }

    if (!files || files.length === 0) {
      return apiSuccess([]);
    }

    // ── Get approvals for those files ─────────────────
    const fileIds = files.map((f) => f.id);
    const { data: approvals } = await supabase
      .from('pyra_file_approvals')
      .select('id, file_id, status, comment')
      .in('file_id', fileIds);

    const approvalMap = new Map(
      (approvals || []).map((a) => [a.file_id, { id: a.id, status: a.status, comment: a.comment }])
    );

    // ── Build response ────────────────────────────────
    let result = files.map((f) => ({
      id: f.id,
      file_name: f.file_name,
      file_type: f.file_type,
      file_size: f.file_size,
      file_path: f.file_path,
      added_at: f.added_at,
      project_id: f.project_id,
      project_name: projectMap.get(f.project_id) || '',
      approval: approvalMap.get(f.id) || null,
    }));

    // ── Apply status filter client-side ────────────────
    if (statusFilter) {
      result = result.filter((f) => {
        if (statusFilter === 'pending') {
          return !f.approval || f.approval.status === 'pending';
        }
        return f.approval?.status === statusFilter;
      });
    }

    return apiSuccess(result);
  } catch (err) {
    console.error('GET /api/portal/files error:', err);
    return apiServerError();
  }
}
