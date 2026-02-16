import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sanitizePath, sanitizeFileName, joinPath } from '@/lib/utils/path';
import { uploadLimiter, checkRateLimit } from '@/lib/utils/rate-limit';

export const dynamic = 'force-dynamic';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// Maximum upload size: 100 MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// Blocked file extensions
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.pif',
  '.vbs', '.vbe', '.js', '.jse', '.ws', '.wsf', '.wsc', '.wsh',
  '.ps1', '.psm1', '.psd1',
  '.sh', '.bash', '.csh',
  '.dll', '.sys', '.drv',
  '.inf', '.reg',
  '.lnk', '.url',
  '.hta', '.cpl',
]);

/**
 * POST /api/files/upload-url
 * Generate a signed upload URL for direct client → Supabase Storage upload.
 *
 * Body: { fileName, fileSize, mimeType, prefix }
 * Returns: { signedUrl, token, storagePath }
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit
    const limited = checkRateLimit(uploadLimiter, request);
    if (limited) return limited;

    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { fileName, fileSize, mimeType, prefix: rawPrefix } = body as {
      fileName: string;
      fileSize: number;
      mimeType: string;
      prefix: string;
    };

    if (!fileName) {
      return apiValidationError('اسم الملف مطلوب');
    }

    // Validate file size
    if (fileSize > MAX_FILE_SIZE) {
      return apiValidationError(
        `الملف "${fileName}" يتجاوز الحد الأقصى المسموح (100 MB)`
      );
    }

    // Validate file extension
    const ext = fileName.lastIndexOf('.') >= 0
      ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
      : '';
    if (ext && BLOCKED_EXTENSIONS.has(ext)) {
      return apiValidationError(
        `نوع الملف "${fileName}" غير مسموح به. الملفات التنفيذية ممنوعة`
      );
    }

    const prefix = sanitizePath(rawPrefix || '');
    const safeName = sanitizeFileName(fileName);
    const storagePath = joinPath(prefix, safeName);

    const storage = createServiceRoleClient();

    // Create a signed upload URL (valid for 2 minutes)
    const { data, error } = await storage.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath, {
        upsert: true,
      });

    if (error) {
      console.error('Signed upload URL error:', error);
      return apiServerError(`فشل إنشاء رابط الرفع: ${error.message}`);
    }

    return apiSuccess({
      signedUrl: data.signedUrl,
      token: data.token,
      storagePath,
      safeName,
    });
  } catch (err) {
    console.error('Upload URL error:', err);
    return apiServerError(
      `خطأ في إنشاء رابط الرفع: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
