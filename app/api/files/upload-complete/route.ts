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
import { autoLinkFileToProject } from '@/lib/utils/project-files';

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

    // Note: Versioning is now handled in upload-url (BEFORE the file is overwritten)
    // using storage.copy() for server-side backup. This eliminates the race condition
    // where the old file would already be overwritten when we tried to download it.

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
        folder_path: parentPath,
        indexed_at: new Date().toISOString(),
      },
      { onConflict: 'file_path' }
    );

    if (indexError) {
      console.error('Index error after direct upload:', indexError);
      return apiServerError(`فشل فهرسة الملف: ${indexError.message}`);
    }

    // Auto-tag by MIME type and folder (non-blocking)
    void autoTagFile(supabase, {
      storagePath,
      mimeType: mimeType || 'application/octet-stream',
      username: auth.pyraUser.username,
    });

    // Auto-link to project if file is inside a project folder
    void autoLinkFileToProject(supabase, {
      filePath: storagePath,
      fileName,
      fileSize: fileSize || 0,
      mimeType: mimeType || 'application/octet-stream',
      uploadedBy: auth.pyraUser.username,
    });

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
 * Auto-tag file by MIME type and parent folder.
 * Non-blocking — upload succeeds even if tagging fails.
 */
async function autoTagFile(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  { storagePath, mimeType, username }: { storagePath: string; mimeType: string; username: string }
) {
  try {
    const tags: { name: string; color: string }[] = [];

    // Tag by MIME type
    if (mimeType.startsWith('image/')) tags.push({ name: 'صورة', color: '#3b82f6' });
    else if (mimeType.startsWith('video/')) tags.push({ name: 'فيديو', color: '#8b5cf6' });
    else if (mimeType.startsWith('audio/')) tags.push({ name: 'صوت', color: '#ec4899' });
    else if (mimeType === 'application/pdf') tags.push({ name: 'PDF', color: '#ef4444' });
    else if (
      mimeType.includes('spreadsheet') ||
      mimeType.includes('excel') ||
      mimeType === 'text/csv'
    ) tags.push({ name: 'جدول', color: '#22c55e' });
    else if (
      mimeType.includes('document') ||
      mimeType.includes('msword') ||
      mimeType === 'text/plain'
    ) tags.push({ name: 'مستند', color: '#f59e0b' });
    else if (
      mimeType.includes('zip') ||
      mimeType.includes('rar') ||
      mimeType.includes('tar') ||
      mimeType.includes('compress')
    ) tags.push({ name: 'أرشيف', color: '#6b7280' });

    // Tag by parent folder (e.g., projects/ProjectName → "ProjectName")
    const parts = storagePath.split('/');
    if (parts.length >= 3 && parts[0] === 'projects') {
      tags.push({ name: decodeURIComponent(parts[1]), color: '#f97316' });
    }

    if (tags.length === 0) return;

    // Upsert all tags (fire-and-forget per tag)
    for (const tag of tags) {
      await supabase.from('pyra_file_tags').upsert(
        {
          id: generateId('tg'),
          file_path: storagePath,
          tag_name: tag.name,
          color: tag.color,
          created_by: username,
        },
        { onConflict: 'file_path,tag_name' }
      );
    }
  } catch (err) {
    console.error('[AutoTag] Error:', err);
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
