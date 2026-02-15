import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';

/**
 * POST /api/portal/files/[id]/approve
 *
 * Approve a file. Verifies the file belongs to a project owned by the client's company.
 * If no approval record exists, one is created.
 * Body: { comment?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const { id: fileId } = await params;
    const supabase = createServiceRoleClient();

    // ── Verify file exists ────────────────────────────
    const { data: projectFile } = await supabase
      .from('pyra_project_files')
      .select('id, project_id')
      .eq('id', fileId)
      .single();

    if (!projectFile) {
      return apiNotFound('الملف غير موجود');
    }

    // ── Verify project belongs to client's company ────
    const { data: project } = await supabase
      .from('pyra_projects')
      .select('id, client_company')
      .eq('id', projectFile.project_id)
      .single();

    if (!project) {
      return apiNotFound('المشروع غير موجود');
    }

    if (project.client_company !== client.company) {
      return apiForbidden('لا تملك صلاحية الوصول لهذا الملف');
    }

    // ── Parse body ────────────────────────────────────
    let comment: string | null = null;
    try {
      const body = await request.json();
      comment = body.comment || null;
    } catch {
      // No body provided — that's fine for approve
    }

    const now = new Date().toISOString();

    // ── Check for existing approval record ────────────
    const { data: existingApproval } = await supabase
      .from('pyra_file_approvals')
      .select('id')
      .eq('file_id', fileId)
      .single();

    if (existingApproval) {
      // Update existing record
      const { data: updated, error } = await supabase
        .from('pyra_file_approvals')
        .update({
          status: 'approved',
          reviewed_by: client.name,
          reviewed_at: now,
          comment,
        })
        .eq('id', existingApproval.id)
        .select()
        .single();

      if (error) {
        console.error('POST /api/portal/files/[id]/approve — update error:', error);
        return apiServerError();
      }

      return apiSuccess(updated);
    } else {
      // Create new approval record
      const { data: created, error } = await supabase
        .from('pyra_file_approvals')
        .insert({
          id: generateId('fa'),
          file_id: fileId,
          status: 'approved',
          reviewed_by: client.name,
          reviewed_at: now,
          comment,
        })
        .select()
        .single();

      if (error) {
        console.error('POST /api/portal/files/[id]/approve — insert error:', error);
        return apiServerError();
      }

      return apiSuccess(created, undefined, 201);
    }
  } catch (err) {
    console.error('POST /api/portal/files/[id]/approve error:', err);
    return apiServerError();
  }
}
