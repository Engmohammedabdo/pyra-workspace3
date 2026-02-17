import { NextRequest, NextResponse } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { apiUnauthorized, apiNotFound, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sanitizePath } from '@/lib/utils/path';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

// =============================================================
// GET /api/files/signed-url/[...path]
// Returns a JSON { url } with a direct Supabase signed URL
// Used by PDF.js to load documents directly from storage CDN
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

    // Create a signed URL (1 hour expiry)
    const { data, error } = await storage.storage
      .from(BUCKET)
      .createSignedUrl(filePath, 60 * 60);

    if (error || !data?.signedUrl) {
      console.error('Signed URL error:', error);
      return apiNotFound('الملف غير موجود');
    }

    // Return JSON with the URL — CORS-friendly since it's same-origin API
    return NextResponse.json({ url: data.signedUrl }, {
      headers: {
        'Cache-Control': 'private, max-age=3000', // cache for ~50 min
      },
    });
  } catch (err) {
    console.error('Signed URL error:', err);
    return apiServerError();
  }
}
