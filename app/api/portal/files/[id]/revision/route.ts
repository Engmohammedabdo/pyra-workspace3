import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';

/**
 * POST /api/portal/files/[id]/revision
 *
 * Request revision on a file. Verifies the file belongs to a project
 * owned by the client's company.
 * Body: { comment: string } (required)
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

    // ── Verify project belongs to client ─────────────
    const { data: project } = await supabase
      .from('pyra_projects')
      .select('id, client_id, client_company')
      .eq('id', projectFile.project_id)
      .single();

    if (!project) {
      return apiNotFound('المشروع غير موجود');
    }

    const ownsProject = project.client_id
      ? project.client_id === client.id
      : project.client_company === client.company;

    if (!ownsProject) {
      return apiForbidden('لا تملك صلاحية الوصول لهذا الملف');
    }

    // ── Parse and validate body ───────────────────────
    const body = await request.json();
    const { comment } = body;

    if (!comment?.trim()) {
      return apiValidationError('التعليق مطلوب عند طلب التعديل');
    }

    if (comment.trim().length > 5000) {
      return apiValidationError('التعليق طويل جداً (الحد الأقصى 5000 حرف)');
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
          status: 'revision_requested',
          reviewed_by: client.name,
          reviewed_at: now,
          comment: comment.trim(),
        })
        .eq('id', existingApproval.id)
        .select('id, file_id, status, reviewed_by, reviewed_at, comment')
        .single();

      if (error) {
        console.error('POST /api/portal/files/[id]/revision — update error:', error);
        return apiServerError();
      }

      return apiSuccess(updated);
    } else {
      // Create new approval record with revision_requested status
      const { data: created, error } = await supabase
        .from('pyra_file_approvals')
        .insert({
          id: generateId('fa'),
          file_id: fileId,
          status: 'revision_requested',
          reviewed_by: client.name,
          reviewed_at: now,
          comment: comment.trim(),
        })
        .select('id, file_id, status, reviewed_by, reviewed_at, comment')
        .single();

      if (error) {
        console.error('POST /api/portal/files/[id]/revision — insert error:', error);
        return apiServerError();
      }

      return apiSuccess(created, undefined, 201);
    }
  } catch (err) {
    console.error('POST /api/portal/files/[id]/revision error:', err);
    return apiServerError();
  }
}
