import { NextRequest, NextResponse } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isPathSafe } from '@/lib/utils/path';
import { resolveMimeType } from '@/lib/utils/mime';
import {
  apiUnauthorized,
  apiNotFound,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';

/**
 * GET /api/portal/files/[id]/view
 *
 * Proxies the file through the server with Content-Disposition: inline.
 * This ensures PDFs (and other previewable files) render in <iframe>
 * instead of triggering a download — Supabase signed URLs often set
 * Content-Disposition: attachment which forces a download.
 *
 * Supports inline: PDF, images, text, video, audio.
 * Files > 15 MB fall back to a signed URL redirect.
 */

const INLINE_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'text/plain',
  'text/html',
  'text/css',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/javascript',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
]);

const MAX_PROXY_SIZE = 15 * 1024 * 1024; // 15 MB

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = await getPortalSession();
    if (!client) {
      return apiUnauthorized();
    }

    const { id: fileId } = await params;
    const supabase = createServiceRoleClient();

    // ── Verify file ──
    const { data: projectFile } = await supabase
      .from('pyra_project_files')
      .select('id, project_id, file_path, file_name, mime_type, file_size, client_visible')
      .eq('id', fileId)
      .single();

    if (!projectFile || projectFile.client_visible === false) {
      return apiNotFound();
    }

    if (!isPathSafe(projectFile.file_path)) {
      return apiForbidden('Invalid path');
    }

    // ── Verify project ownership ──
    const { data: project } = await supabase
      .from('pyra_projects')
      .select('id, client_id, client_company')
      .eq('id', projectFile.project_id)
      .single();

    if (!project) {
      return apiNotFound();
    }

    const ownsProject = project.client_id
      ? project.client_id === client.id
      : project.client_company === client.company;

    if (!ownsProject) {
      return apiForbidden();
    }

    const effectiveMime = resolveMimeType(projectFile.file_name, projectFile.mime_type);
    const fileSize = projectFile.file_size || 0;

    // ── Large files → redirect to signed URL ──
    if (fileSize > MAX_PROXY_SIZE) {
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('pyraai-workspace')
        .createSignedUrl(projectFile.file_path, 60 * 5);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        return apiServerError('Storage error');
      }
      return NextResponse.redirect(signedUrlData.signedUrl, 302);
    }

    // ── Download from storage and proxy through server ──
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('pyraai-workspace')
      .download(projectFile.file_path);

    if (downloadError || !fileData) {
      console.error('GET /api/portal/files/[id]/view — download error:', downloadError);
      return apiServerError('Download failed');
    }

    const arrayBuffer = await fileData.arrayBuffer();

    // Inline for previewable types, attachment otherwise
    const isInline = INLINE_TYPES.has(effectiveMime);
    const disposition = isInline
      ? `inline; filename="${encodeURIComponent(projectFile.file_name)}"`
      : `attachment; filename="${encodeURIComponent(projectFile.file_name)}"`;

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': effectiveMime,
        'Content-Disposition': disposition,
        'Content-Length': String(arrayBuffer.byteLength),
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('GET /api/portal/files/[id]/view error:', err);
    return apiServerError();
  }
}
