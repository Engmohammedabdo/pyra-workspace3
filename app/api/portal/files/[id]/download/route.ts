import { NextRequest, NextResponse } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  apiUnauthorized,
  apiNotFound,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';
import { isPathSafe } from '@/lib/utils/path';
import { generateId } from '@/lib/utils/id';

/**
 * GET /api/portal/files/[id]/download
 *
 * Download a file. Verifies the file belongs to a project owned by the
 * client's company, then returns a redirect to a signed Supabase Storage URL.
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
      .select('id, project_id, file_path, file_name, client_visible')
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

    // ── Generate signed URL from Supabase Storage ─────
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('pyraai-workspace')
      .createSignedUrl(projectFile.file_path, 60 * 5); // 5 minutes

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('GET /api/portal/files/[id]/download — signed URL error:', signedUrlError);
      return apiNotFound('تعذر الوصول للملف في التخزين');
    }

    // ── Log download activity (non-critical) ─────────
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'portal_download',
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
    });

    // ── Redirect to signed URL ────────────────────────
    return NextResponse.redirect(signedUrlData.signedUrl);
  } catch (err) {
    console.error('GET /api/portal/files/[id]/download error:', err);
    return apiServerError();
  }
}
