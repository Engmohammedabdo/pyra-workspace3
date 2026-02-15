import { NextRequest, NextResponse } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  apiUnauthorized,
  apiNotFound,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';

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

    // ── Verify file exists ────────────────────────────
    const { data: projectFile } = await supabase
      .from('pyra_project_files')
      .select('id, project_id, file_path, file_name')
      .eq('id', fileId)
      .single();

    if (!projectFile) {
      return apiNotFound('الملف غير موجود');
    }

    // ── Path traversal check ────────────────────────
    if (
      projectFile.file_path.includes('..') ||
      projectFile.file_path.includes('\0') ||
      /[\\]/.test(projectFile.file_path)
    ) {
      return apiForbidden('مسار الملف غير صالح');
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

    // ── Generate signed URL from Supabase Storage ─────
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('pyraai-workspace')
      .createSignedUrl(projectFile.file_path, 60 * 5); // 5 minutes

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('GET /api/portal/files/[id]/download — signed URL error:', signedUrlError);
      return apiNotFound('تعذر الوصول للملف في التخزين');
    }

    // ── Redirect to signed URL ────────────────────────
    return NextResponse.redirect(signedUrlData.signedUrl);
  } catch (err) {
    console.error('GET /api/portal/files/[id]/download error:', err);
    return apiServerError();
  }
}
