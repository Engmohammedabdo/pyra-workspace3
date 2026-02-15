import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';

/**
 * GET /api/portal/projects/[id]
 *
 * Get a single project with full details:
 *  - project data
 *  - project_files (joined with pyra_file_index for file metadata)
 *  - file_approvals for those files
 *  - comments (ordered by created_at asc)
 *
 * Also marks team comments as read by the client.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // ── Fetch the project ─────────────────────────────
    const { data: project, error: projectError } = await supabase
      .from('pyra_projects')
      .select('*')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return apiNotFound('المشروع غير موجود');
    }

    // ── Verify ownership ──────────────────────────────
    if (project.client_company !== client.company) {
      return apiForbidden('لا تملك صلاحية الوصول لهذا المشروع');
    }

    // ── Fetch project files ───────────────────────────
    const { data: projectFiles } = await supabase
      .from('pyra_project_files')
      .select('*')
      .eq('project_id', id);

    // Get file details from pyra_file_index for each project file
    const filePaths = (projectFiles || []).map((f) => f.file_path);
    let fileIndexData: Record<string, unknown>[] = [];
    if (filePaths.length > 0) {
      const { data } = await supabase
        .from('pyra_file_index')
        .select('*')
        .in('file_path', filePaths);
      fileIndexData = data || [];
    }

    // Merge file index data into project files
    const filesWithDetails = (projectFiles || []).map((pf) => {
      const fileInfo = fileIndexData.find(
        (fi) => (fi as { file_path: string }).file_path === pf.file_path
      );
      return { ...pf, file_details: fileInfo || null };
    });

    // ── Fetch file approvals ──────────────────────────
    const fileIds = (projectFiles || []).map((f) => f.id);
    let fileApprovals: Record<string, unknown>[] = [];
    if (fileIds.length > 0) {
      const { data } = await supabase
        .from('pyra_file_approvals')
        .select('*')
        .in('file_id', fileIds);
      fileApprovals = data || [];
    }

    // ── Fetch comments ────────────────────────────────
    const { data: comments } = await supabase
      .from('pyra_client_comments')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: true });

    // ── Mark team comments as read by client ──────────
    await supabase
      .from('pyra_client_comments')
      .update({ is_read_by_client: true })
      .eq('project_id', id)
      .eq('author_type', 'team')
      .eq('is_read_by_client', false);

    return apiSuccess({
      project,
      project_files: filesWithDetails,
      file_approvals: fileApprovals,
      comments: comments || [],
    });
  } catch (err) {
    console.error('GET /api/portal/projects/[id] error:', err);
    return apiServerError();
  }
}
