import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getParentPath, isPathSafe } from '@/lib/utils/path';
import { generateId } from '@/lib/utils/id';

export const dynamic = 'force-dynamic';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

/**
 * POST /api/files/upload-complete
 * Called after a successful direct-to-storage upload.
 * Verifies file exists in storage, checks path access for employees,
 * then indexes the file in pyra_file_index and logs the activity.
 *
 * Body: { storagePath, fileName, fileSize, mimeType }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { storagePath, fileName, fileSize, mimeType } = body as {
      storagePath: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
    };

    if (!storagePath || !fileName) {
      return apiValidationError('بيانات الملف ناقصة');
    }

    if (!isPathSafe(storagePath)) {
      return apiValidationError('مسار الملف غير صالح');
    }

    const parentPath = getParentPath(storagePath);

    // ── Path ownership check for employees ─────────────
    if (auth.pyraUser.role === 'employee') {
      const hasAccess = verifyPathAccess(auth.pyraUser, parentPath);
      if (!hasAccess) {
        return apiForbidden('لا تملك صلاحية الرفع في هذا المسار');
      }
    }

    // ── Verify file actually exists in storage ─────────
    const storage = createServiceRoleClient();
    const fileNameInStorage = storagePath.split('/').pop() || '';

    const { data: storageFiles, error: storageError } = await storage.storage
      .from(BUCKET)
      .list(parentPath, { limit: 100, search: fileNameInStorage });

    if (storageError) {
      console.error('Storage verification error:', storageError);
      return apiServerError('فشل التحقق من وجود الملف في التخزين');
    }

    const fileExists = (storageFiles || []).some(
      (f) => f.name === fileNameInStorage && f.id !== null
    );

    if (!fileExists) {
      return apiValidationError('الملف غير موجود في التخزين. تأكد من اكتمال الرفع');
    }

    const supabase = await createServerSupabaseClient();

    // ── Auto-versioning: save old file as version before overwrite ──
    const { data: existingFile } = await supabase
      .from('pyra_file_index')
      .select('file_size, mime_type')
      .eq('file_path', storagePath)
      .single();

    if (existingFile) {
      // File already exists — save current version before overwriting
      try {
        const { data: latestVersions } = await supabase
          .from('pyra_file_versions')
          .select('version_number')
          .eq('file_path', storagePath)
          .order('version_number', { ascending: false })
          .limit(1);

        const nextVersionNum = ((latestVersions?.[0]?.version_number) || 0) + 1;

        // Download the existing file before it gets overwritten
        const { data: oldFileData } = await storage.storage
          .from(BUCKET)
          .download(storagePath);

        if (oldFileData) {
          const versionPath = `.versions/${storagePath}_v${nextVersionNum}`;
          const { error: versionUploadError } = await storage.storage
            .from(BUCKET)
            .upload(versionPath, oldFileData, {
              contentType: existingFile.mime_type || 'application/octet-stream',
              upsert: true,
            });

          if (!versionUploadError) {
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
          }
        }
      } catch (versionErr) {
        // Versioning is non-critical — log and continue
        console.warn('Auto-versioning warning:', versionErr);
      }
    }

    // Index the file (overwrite or create)
    const { error: indexError } = await supabase.from('pyra_file_index').upsert(
      {
        id: generateId('fi'),
        file_path: storagePath,
        file_name: fileName,
        file_name_lower: fileName.toLowerCase(),
        file_size: fileSize || 0,
        mime_type: mimeType || 'application/octet-stream',
        is_folder: false,
        parent_path: parentPath,
        indexed_at: new Date().toISOString(),
      },
      { onConflict: 'file_path' }
    );

    if (indexError) {
      console.error('Index error after direct upload:', indexError);
      return apiServerError(`فشل فهرسة الملف: ${indexError.message}`);
    }

    // Log activity (non-critical)
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'upload',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: storagePath,
      details: {
        file_name: fileName,
        file_size: fileSize,
        mime_type: mimeType || 'application/octet-stream',
        method: 'direct-upload',
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ indexed: storagePath });
  } catch (err) {
    console.error('Upload complete error:', err);
    return apiServerError(
      `خطأ في تسجيل الرفع: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Verify that an employee has access to a given path.
 */
function verifyPathAccess(
  pyraUser: { permissions: { allowed_paths?: string[]; paths?: Record<string, string> } },
  targetPath: string
): boolean {
  const permissions = pyraUser.permissions;

  if (!permissions) return false;

  const allowedPaths = permissions.allowed_paths || [];
  const pathKeys = permissions.paths ? Object.keys(permissions.paths) : [];
  const allPaths = [...new Set([...allowedPaths, ...pathKeys])];

  if (allPaths.length === 0) return false;

  const normalizedTarget = targetPath.replace(/\/+$/, '');
  return allPaths.some((allowed) => {
    const normalizedAllowed = allowed.replace(/\/+$/, '');
    return (
      normalizedTarget === normalizedAllowed ||
      normalizedTarget.startsWith(normalizedAllowed + '/')
    );
  });
}
