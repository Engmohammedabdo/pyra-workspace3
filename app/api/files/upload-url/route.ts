import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { sanitizePath, sanitizeFileName, joinPath } from '@/lib/utils/path';
import { uploadLimiter, checkRateLimit } from '@/lib/utils/rate-limit';
import { generateId } from '@/lib/utils/id';

export const dynamic = 'force-dynamic';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// Maximum upload size: 1 GB
const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024;

// Maximum number of versions to keep per file
const MAX_VERSIONS = 20;

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
 * Employees can only upload to paths they have access to.
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
        `الملف "${fileName}" يتجاوز الحد الأقصى المسموح (1 GB)`
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

    // ── Path ownership check for employees ─────────────
    if (auth.pyraUser.role === 'employee') {
      const hasAccess = await verifyPathAccess(auth.pyraUser, prefix);
      if (!hasAccess) {
        return apiForbidden('لا تملك صلاحية الرفع في هذا المسار');
      }
    }

    const storage = createServiceRoleClient();
    const supabase = await createServerSupabaseClient();

    // ── Pre-upload versioning: backup existing file BEFORE overwrite ──
    try {
      const { data: existingFile } = await supabase
        .from('pyra_file_index')
        .select('file_size, mime_type')
        .eq('file_path', storagePath)
        .single();

      if (existingFile) {
        // File already exists — use storage.copy() to create a version backup
        const { data: latestVersions } = await supabase
          .from('pyra_file_versions')
          .select('version_number')
          .eq('file_path', storagePath)
          .order('version_number', { ascending: false })
          .limit(1);

        const nextVersionNum = ((latestVersions?.[0]?.version_number) || 0) + 1;
        const versionPath = `.versions/${storagePath}_v${nextVersionNum}`;

        // Server-side copy — no download/reupload needed
        const { error: copyError } = await storage.storage
          .from(BUCKET)
          .copy(storagePath, versionPath);

        if (!copyError) {
          await supabase.from('pyra_file_versions').insert({
            id: generateId('fv'),
            file_path: storagePath,
            version_path: versionPath,
            version_number: nextVersionNum,
            file_size: existingFile.file_size || 0,
            mime_type: existingFile.mime_type || 'application/octet-stream',
            created_by: auth.pyraUser.username,
            created_at: new Date().toISOString(),
          });

          // ── Version cap enforcement: keep only latest MAX_VERSIONS ──
          if (nextVersionNum > MAX_VERSIONS) {
            const { data: allVersions } = await supabase
              .from('pyra_file_versions')
              .select('id, version_path')
              .eq('file_path', storagePath)
              .order('version_number', { ascending: false });

            if (allVersions && allVersions.length > MAX_VERSIONS) {
              const excess = allVersions.slice(MAX_VERSIONS);
              const excessIds = excess.map((v) => v.id);
              const excessPaths = excess.map((v) => v.version_path);

              // Delete from storage
              await storage.storage.from(BUCKET).remove(excessPaths);
              // Delete from database
              await supabase
                .from('pyra_file_versions')
                .delete()
                .in('id', excessIds);
            }
          }
        } else {
          console.warn('Version copy warning:', copyError.message);
        }
      }
    } catch (versionErr) {
      // Versioning is non-critical — log and continue with upload
      console.warn('Pre-upload versioning warning:', versionErr);
    }

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

/**
 * Verify that an employee has access to a given path.
 * Checks allowed_paths and paths map from user permissions.
 */
async function verifyPathAccess(
  pyraUser: { username: string; permissions: { allowed_paths?: string[]; paths?: Record<string, string> } },
  targetPath: string
): Promise<boolean> {
  const permissions = pyraUser.permissions;

  if (!permissions) return false;

  const allowedPaths = permissions.allowed_paths || [];
  const pathKeys = permissions.paths ? Object.keys(permissions.paths) : [];
  const allPaths = [...new Set([...allowedPaths, ...pathKeys])];

  // If no paths configured, deny access
  if (allPaths.length === 0) return false;

  // Check if the target path starts with any allowed path
  const normalizedTarget = targetPath.replace(/\/+$/, '');
  return allPaths.some((allowed) => {
    const normalizedAllowed = allowed.replace(/\/+$/, '');
    return (
      normalizedTarget === normalizedAllowed ||
      normalizedTarget.startsWith(normalizedAllowed + '/')
    );
  });
}
