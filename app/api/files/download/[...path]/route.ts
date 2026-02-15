import { NextRequest, NextResponse } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiUnauthorized, apiNotFound, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sanitizePath, getFileName } from '@/lib/utils/path';
import { generateId } from '@/lib/utils/id';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

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
// Stream file with correct Content-Type and Content-Disposition
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

    // Download file from storage
    const { data: fileData, error: downloadError } = await storage.storage
      .from(BUCKET)
      .download(filePath);

    if (downloadError || !fileData) {
      console.error('Download error:', downloadError);
      return apiNotFound('الملف غير موجود');
    }

    const mimeType = fileData.type || 'application/octet-stream';
    const arrayBuffer = await fileData.arrayBuffer();

    // Determine Content-Disposition: inline for previewable types, attachment otherwise
    const searchParams = request.nextUrl.searchParams;
    const forceDownload = searchParams.get('download') === 'true';
    const disposition = !forceDownload && INLINE_TYPES.has(mimeType)
      ? `inline; filename="${encodeURIComponent(fileName)}"`
      : `attachment; filename="${encodeURIComponent(fileName)}"`;

    // Log download activity
    const supabase = await createServerSupabaseClient();
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'download',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: filePath,
      details: {
        file_name: fileName,
        mime_type: mimeType,
        file_size: arrayBuffer.byteLength,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
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
