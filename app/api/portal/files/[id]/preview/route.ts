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
import { isPathSafe } from '@/lib/utils/path';
import { generateId } from '@/lib/utils/id';
import { resolveMimeType } from '@/lib/utils/mime';

/**
 * GET /api/portal/files/[id]/preview
 *
 * Returns a signed URL for inline file preview (JSON response, not redirect).
 * Used by the portal file preview component to display files inline.
 *
 * Response: { data: { url, mime_type, file_name, file_size } }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const { id: fileId } = await params;
    const supabase = createServiceRoleClient();

    // ── Verify file exists and is client_visible ──────
    const { data: projectFile } = await supabase
      .from('pyra_project_files')
      .select('id, project_id, file_path, file_name, mime_type, file_size, client_visible')
      .eq('id', fileId)
      .single();

    if (!projectFile) {
      return apiNotFound('الملف غير موجود');
    }

    if (projectFile.client_visible === false) {
      return apiForbidden('هذا الملف غير متاح للعرض');
    }

    // ── Path traversal check ────────────────────────
    if (!isPathSafe(projectFile.file_path)) {
      return apiForbidden('مسار الملف غير صالح');
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

    // ── Generate signed URL (5 minutes) ─────────────
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('pyraai-workspace')
      .createSignedUrl(projectFile.file_path, 60 * 5);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('GET /api/portal/files/[id]/preview — signed URL error:', signedUrlError);
      return apiNotFound('تعذر الوصول للملف في التخزين');
    }

    // ── Log preview activity (non-critical) ──────────
    void supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'portal_preview',
      username: client.email || client.name,
      display_name: client.name || client.company,
      target_path: projectFile.file_path,
      details: {
        file_name: projectFile.file_name,
        project_id: projectFile.project_id,
        client_company: client.company,
        portal_client: true,
      },
      ip_address: _request.headers.get('x-forwarded-for') || 'unknown',
    }).then(({ error: logErr }) => {
      if (logErr) console.error('[activity-log] insert error:', logErr.message);
    });

    // Resolve correct MIME type (DB may store 'application/octet-stream' for many files)
    const effectiveMime = resolveMimeType(
      projectFile.file_name,
      projectFile.mime_type
    );

    return apiSuccess({
      url: signedUrlData.signedUrl,
      mime_type: effectiveMime,
      file_name: projectFile.file_name,
      file_size: projectFile.file_size || 0,
    });
  } catch (err) {
    console.error('GET /api/portal/files/[id]/preview error:', err);
    return apiServerError();
  }
}
