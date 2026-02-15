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
 * POST /api/portal/projects/[id]/comments
 *
 * Create a comment on a project.
 * Body: { text: string, parent_id?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const { id: projectId } = await params;
    const supabase = createServiceRoleClient();

    // ── Verify project exists and belongs to client ───
    const { data: project } = await supabase
      .from('pyra_projects')
      .select('id, client_id, client_company')
      .eq('id', projectId)
      .single();

    if (!project) {
      return apiNotFound('المشروع غير موجود');
    }

    const ownsProject = project.client_id
      ? project.client_id === client.id
      : project.client_company === client.company;

    if (!ownsProject) {
      return apiForbidden('لا تملك صلاحية الوصول لهذا المشروع');
    }

    // ── Parse and validate body ───────────────────────
    const body = await request.json();
    const { text, parent_id } = body;

    if (!text?.trim()) {
      return apiValidationError('نص التعليق مطلوب');
    }

    if (text.trim().length > 5000) {
      return apiValidationError('التعليق طويل جداً (الحد الأقصى 5000 حرف)');
    }

    // ── Create the comment ────────────────────────────
    const commentId = generateId('cc');
    const { data: comment, error } = await supabase
      .from('pyra_client_comments')
      .insert({
        id: commentId,
        project_id: projectId,
        author_type: 'client',
        author_name: client.name,
        text: text.trim(),
        parent_id: parent_id || null,
        attachments: [],
        is_read_by_client: true,
        is_read_by_team: false,
      })
      .select('id, project_id, author_type, author_name, text, parent_id, is_read_by_client, is_read_by_team, created_at')
      .single();

    if (error) {
      console.error('POST /api/portal/projects/[id]/comments — insert error:', error);
      return apiServerError();
    }

    return apiSuccess(comment, undefined, 201);
  } catch (err) {
    console.error('POST /api/portal/projects/[id]/comments error:', err);
    return apiServerError();
  }
}
