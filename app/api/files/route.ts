import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  sanitizePath,
  sanitizeFileName,
  getFileName,
  getParentPath,
  joinPath,
} from '@/lib/utils/path';
import { generateId } from '@/lib/utils/id';
import { uploadLimiter, checkRateLimit } from '@/lib/utils/rate-limit';
import { autoLinkFileToProject } from '@/lib/utils/project-files';
import type { FileListItem } from '@/types/database';

// ── Route Segment Config: allow large file uploads ──
export const maxDuration = 60; // seconds — timeout for large uploads
export const dynamic = 'force-dynamic';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// Maximum upload size: 100 MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// ── File type whitelist ────────────────────────────────────
// Allowed MIME types for upload. Blocks executable and dangerous file types.
const ALLOWED_MIME_TYPES = new Set([
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/html',
  'text/markdown',
  'text/x-markdown',
  'text/css',
  'text/javascript',
  'application/json',
  'application/xml',
  'text/xml',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'image/avif',
  // Video
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  // Audio
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  // Archives
  'application/zip',
  'application/x-rar-compressed',
  'application/gzip',
  'application/x-7z-compressed',
  // Design
  'application/postscript',
  'image/vnd.adobe.photoshop',
  // Fonts
  'font/woff',
  'font/woff2',
  'font/ttf',
  'font/otf',
]);

// Blocked file extensions (defense-in-depth, even if MIME type is spoofed)
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

function isAllowedFileType(fileName: string, mimeType: string): boolean {
  // Check extension blocklist
  const ext = fileName.lastIndexOf('.') >= 0
    ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
    : '';
  if (ext && BLOCKED_EXTENSIONS.has(ext)) return false;

  // Allow if MIME type is in whitelist, or if generic octet-stream (unknown type)
  // For octet-stream, we rely on the extension blocklist above
  if (mimeType === 'application/octet-stream') return true;
  return ALLOWED_MIME_TYPES.has(mimeType);
}

// =============================================================
// GET /api/files?path=some/folder
// List files in a folder
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const searchParams = request.nextUrl.searchParams;
    const rawPath = searchParams.get('path') || '';
    const path = sanitizePath(rawPath);

    const storage = createServiceRoleClient();

    const { data, error } = await storage.storage
      .from(BUCKET)
      .list(path, {
        limit: 500,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (error) {
      console.error('Storage list error:', error);
      return apiServerError('فشل في قراءة الملفات');
    }

    // Filter out placeholder files
    const files = (data || []).filter(
      (f) => f.name !== '.emptyFolderPlaceholder' && f.name !== '.gitkeep'
    );

    // Transform to FileListItem format
    const items: FileListItem[] = files.map((f) => ({
      name: f.name,
      path: path ? `${path}/${f.name}` : f.name,
      isFolder: f.id === null,
      size: f.metadata?.size || 0,
      mimeType:
        f.metadata?.mimetype ||
        (f.id === null ? 'folder' : 'application/octet-stream'),
      updatedAt: f.updated_at || f.created_at || null,
    }));

    // Sort: folders first, then files alphabetically
    items.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name, 'ar');
    });

    return apiSuccess(items, { path, count: items.length });
  } catch (err) {
    console.error('Files GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/files
// Upload files (multipart/form-data: prefix + files[])
// =============================================================
export async function POST(request: NextRequest) {
  try {
    // Rate limit uploads (20 per IP per minute)
    const limited = checkRateLimit(uploadLimiter, request);
    if (limited) return limited;

    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const formData = await request.formData();
    const rawPrefix = (formData.get('prefix') as string) || '';
    const prefix = sanitizePath(rawPrefix);

    // Collect all files from formData
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === 'files[]' || key === 'file') {
        if (value instanceof File) {
          files.push(value);
        }
      }
    }

    if (files.length === 0) {
      return apiValidationError('لم يتم اختيار أي ملفات');
    }

    // Validate file sizes and types
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return apiValidationError(
          `الملف "${file.name}" يتجاوز الحد الأقصى المسموح (100 MB)`
        );
      }
      if (!isAllowedFileType(file.name, file.type || 'application/octet-stream')) {
        return apiValidationError(
          `نوع الملف "${file.name}" غير مسموح به. الملفات التنفيذية والبرمجيات الخبيثة ممنوعة`
        );
      }
    }

    const storage = createServiceRoleClient();
    const supabase = await createServerSupabaseClient();
    const uploadedPaths: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const safeName = sanitizeFileName(file.name);
      const filePath = joinPath(prefix, safeName);
      const parentPath = getParentPath(filePath);

      // Read file buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Upload to storage
      const { error: uploadError } = await storage.storage
        .from(BUCKET)
        .upload(filePath, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
        });

      if (uploadError) {
        console.error(`Upload error for ${safeName}:`, uploadError);
        errors.push(`فشل رفع "${safeName}": ${uploadError.message}`);
        continue;
      }

      // Index the file — rollback storage upload if this fails
      const { error: indexError } = await supabase.from('pyra_file_index').upsert(
        {
          id: generateId('fi'),
          file_path: filePath,
          file_name: safeName,
          file_name_lower: safeName.toLowerCase(),
          file_size: file.size,
          mime_type: file.type || 'application/octet-stream',
          is_folder: false,
          parent_path: parentPath,
          indexed_at: new Date().toISOString(),
        },
        { onConflict: 'file_path' }
      );

      if (indexError) {
        console.error(`Index error for ${safeName}, rolling back upload:`, indexError);
        // Rollback: remove the uploaded file from storage
        await storage.storage.from(BUCKET).remove([filePath]);
        errors.push(`فشل فهرسة "${safeName}": ${indexError.message}`);
        continue;
      }

      uploadedPaths.push(filePath);

      // Auto-link to project if file is inside a project folder
      void autoLinkFileToProject(supabase, {
        filePath,
        fileName: safeName,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        uploadedBy: auth.pyraUser.username,
      });

      // Log activity (non-critical — don't rollback on failure)
      await supabase.from('pyra_activity_log').insert({
        id: generateId('al'),
        action_type: 'upload',
        username: auth.pyraUser.username,
        display_name: auth.pyraUser.display_name,
        target_path: filePath,
        details: {
          file_name: safeName,
          file_size: file.size,
          mime_type: file.type || 'application/octet-stream',
        },
        ip_address: request.headers.get('x-forwarded-for') || 'unknown',
      });
    }

    if (uploadedPaths.length === 0) {
      return apiServerError(errors.join('; ') || 'فشل رفع جميع الملفات');
    }

    return apiSuccess(
      { uploaded: uploadedPaths, errors },
      { count: uploadedPaths.length, errorCount: errors.length }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Files POST error:', message, err);

    // Return a more informative error for debugging
    if (message.includes('Body exceeded') || message.includes('body size')) {
      return apiValidationError('حجم الملف أكبر من الحد المسموح للخادم');
    }

    return apiServerError(`خطأ في رفع الملفات: ${message}`);
  }
}
