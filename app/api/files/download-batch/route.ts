import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiValidationError, apiServerError, apiForbidden } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isPathSafe } from '@/lib/utils/path';
import { canAccessAllPaths } from '@/lib/auth/file-access';
import JSZip from 'jszip';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// =============================================================
// POST /api/files/download-batch
// Accepts { paths: string[] } → returns a ZIP file
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiPermission('files.view');
    if (isApiError(authResult)) return authResult;
    const auth = authResult;

    const body = await request.json();
    const { paths } = body;

    if (!Array.isArray(paths) || paths.length === 0) {
      return apiValidationError('يجب تحديد ملف واحد على الأقل');
    }

    if (paths.length > 50) {
      return apiValidationError('الحد الأقصى 50 ملف');
    }

    // Validate all paths
    for (const p of paths) {
      if (typeof p !== 'string' || !isPathSafe(p)) {
        return apiValidationError(`مسار غير صالح: ${p}`);
      }
    }

    // Path-level access control
    const { allowed, deniedPaths } = await canAccessAllPaths(auth, paths);
    if (!allowed) {
      return apiForbidden();
    }

    const supabase = createServiceRoleClient();
    const zip = new JSZip();

    // Download each file and add to ZIP
    const results = await Promise.allSettled(
      paths.map(async (filePath: string) => {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .download(filePath);

        if (error || !data) {
          console.warn(`Failed to download ${filePath}:`, error);
          return null;
        }

        // Use the filename from the path
        const fileName = filePath.split('/').pop() || filePath;
        const decodedName = decodeURIComponent(fileName);

        // Handle duplicate names by appending path prefix
        const arrayBuffer = await data.arrayBuffer();
        zip.file(decodedName, arrayBuffer);

        return decodedName;
      })
    );

    const successCount = results.filter(
      (r) => r.status === 'fulfilled' && r.value !== null
    ).length;

    if (successCount === 0) {
      return apiServerError('فشل في تحميل الملفات');
    }

    // Generate ZIP
    const zipBuffer = await zip.generateAsync({
      type: 'arraybuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // Return as downloadable ZIP file
    return new Response(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="pyra-download-${Date.now()}.zip"`,
        'Content-Length': String(zipBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error('Batch download error:', err);
    return apiServerError('فشل في إنشاء الملف المضغوط');
  }
}
