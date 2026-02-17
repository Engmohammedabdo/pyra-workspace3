import { NextRequest, NextResponse } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiUnauthorized, apiNotFound, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sanitizePath, getFileName } from '@/lib/utils/path';
import { generateId } from '@/lib/utils/id';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// Files larger than 10MB are served via redirect to signed URL
// to avoid buffering the entire file in server memory
const REDIRECT_THRESHOLD = 10 * 1024 * 1024; // 10MB

// MIME type to Content-Disposition mapping
const INLINE_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'video/mp4',
  'audio/mpeg',
  'audio/mp4',
]);

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

// =============================================================
// GET /api/files/download/[...path]
// Serve file inline — small files are proxied, large files redirect
// =============================================================
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { path: pathSegments } = await params;
    const rawPath = pathSegments.join('/');
    const filePath = sanitizePath(rawPath);

    if (!filePath) {
      return apiValidationError('مسار الملف مطلوب');
    }

    const storage = createServiceRoleClient();
    const fileName = getFileName(filePath);
    const searchParams = request.nextUrl.searchParams;
    const forceDownload = searchParams.get('download') === 'true';

    // Check file size first by listing metadata
    const parentPath = filePath.includes('/')
      ? filePath.substring(0, filePath.lastIndexOf('/'))
      : '';
    const { data: listData } = await storage.storage
      .from(BUCKET)
      .list(parentPath, { search: fileName });

    const fileMeta = listData?.find((f) => f.name === fileName);
    const fileSize = fileMeta?.metadata?.size || 0;
    const mimeType = fileMeta?.metadata?.mimetype || 'application/octet-stream';

    // Log activity (fire-and-forget)
    const supabase = await createServerSupabaseClient();
    void supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'download',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: filePath,
      details: { file_name: fileName, mime_type: mimeType, file_size: fileSize },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    // For large files: redirect to signed URL (instant, no memory buffering)
    if (fileSize > REDIRECT_THRESHOLD) {
      const { data: signedData, error: signedError } = await storage.storage
        .from(BUCKET)
        .createSignedUrl(filePath, 3600, {
          download: forceDownload ? fileName : undefined,
        });

      if (signedError || !signedData?.signedUrl) {
        console.error('Signed URL error:', signedError);
        return apiNotFound('الملف غير موجود');
      }

      return NextResponse.redirect(signedData.signedUrl, 302);
    }

    // For small/medium files: proxy through server
    const { data: fileData, error: downloadError } = await storage.storage
      .from(BUCKET)
      .download(filePath);

    if (downloadError || !fileData) {
      console.error('Download error:', downloadError);
      return apiNotFound('الملف غير موجود');
    }

    const actualMimeType = fileData.type || mimeType;
    const arrayBuffer = await fileData.arrayBuffer();

    const disposition = !forceDownload && INLINE_TYPES.has(actualMimeType)
      ? `inline; filename="${encodeURIComponent(fileName)}"`
      : `attachment; filename="${encodeURIComponent(fileName)}"`;

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': actualMimeType,
        'Content-Disposition': disposition,
        'Content-Length': String(arrayBuffer.byteLength),
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('Download GET error:', err);
    return apiServerError();
  }
}
