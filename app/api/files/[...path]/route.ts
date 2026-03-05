import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { canAccessPath } from '@/lib/auth/file-access';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiServerError,
  apiForbidden,
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

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// Signed URL expiry: 1 hour
const SIGNED_URL_EXPIRY = 60 * 60;

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

// =============================================================
// GET /api/files/[...path]
// Get file info and a signed download URL
// =============================================================
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('files.view');
    if (isApiError(auth)) return auth;

    const { path: pathSegments } = await params;
    const rawPath = pathSegments.join('/');
    const filePath = sanitizePath(rawPath);

    if (!filePath) {
      return apiValidationError('مسار الملف مطلوب');
    }

    // Enforce path-based access control
    if (!canAccessPath(auth, filePath)) {
      return apiForbidden();
    }

    const storage = createServiceRoleClient();

    // Create a signed URL for download
    const { data: signedData, error: signedError } = await storage.storage
      .from(BUCKET)
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

    if (signedError || !signedData?.signedUrl) {
      console.error('Signed URL error:', signedError);
      return apiNotFound('الملف غير موجود');
    }

    // Get file metadata from storage listing
    const parentPath = getParentPath(filePath);
    const fileName = getFileName(filePath);

    const { data: listData } = await storage.storage
      .from(BUCKET)
      .list(parentPath, { search: fileName });

    const fileMeta = listData?.find((f) => f.name === fileName);

    // Log download/view activity
    const supabase = await createServerSupabaseClient();
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'download',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: filePath,
      details: { file_name: fileName },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({
      url: signedData.signedUrl,
      name: fileName,
      path: filePath,
      size: fileMeta?.metadata?.size || 0,
      mimeType: fileMeta?.metadata?.mimetype || 'application/octet-stream',
      updatedAt: fileMeta?.updated_at || fileMeta?.created_at || null,
    });
  } catch (err) {
    console.error('File GET error:', err);
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/files/[...path]
// Rename or move a file
// Body: { action: 'rename' | 'move', newName?, newPath? }
// =============================================================
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('files.edit');
    if (isApiError(auth)) return auth;

    const { path: pathSegments } = await params;
    const rawPath = pathSegments.join('/');
    const filePath = sanitizePath(rawPath);

    if (!filePath) {
      return apiValidationError('مسار الملف مطلوب');
    }

    // Enforce path-based access control on source path
    if (!canAccessPath(auth, filePath)) {
      return apiForbidden();
    }

    const body = await request.json();
    const { action, newName, newPath } = body as {
      action: 'rename' | 'move';
      newName?: string;
      newPath?: string;
    };

    if (!action || !['rename', 'move'].includes(action)) {
      return apiValidationError('الإجراء غير صالح — يجب أن يكون rename أو move');
    }

    const storage = createServiceRoleClient();
    const supabase = await createServerSupabaseClient();

    let destinationPath: string;

    if (action === 'rename') {
      if (!newName) {
        return apiValidationError('الاسم الجديد مطلوب');
      }
      const safeName = sanitizeFileName(newName);
      const parentDir = getParentPath(filePath);
      destinationPath = joinPath(parentDir, safeName);
    } else {
      // action === 'move'
      if (!newPath) {
        return apiValidationError('المسار الجديد مطلوب');
      }
      destinationPath = sanitizePath(newPath);
    }

    if (destinationPath === filePath) {
      return apiValidationError('المسار الجديد مطابق للمسار الحالي');
    }

    // Enforce path-based access control on destination path
    if (!canAccessPath(auth, destinationPath)) {
      return apiForbidden();
    }

    // Use storage.move() — atomic, no download/reupload needed
    const { error: moveError } = await storage.storage
      .from(BUCKET)
      .move(filePath, destinationPath);

    if (moveError) {
      console.error('Storage move error:', moveError);
      return apiServerError('فشل في نقل الملف');
    }

    // Update file index: rename old entry to new path
    const newFileName = getFileName(destinationPath);
    const newParentPath = getParentPath(destinationPath);

    await supabase
      .from('pyra_file_index')
      .update({
        file_path: destinationPath,
        file_name: newFileName,
        file_name_lower: newFileName.toLowerCase(),
        parent_path: newParentPath,
        indexed_at: new Date().toISOString(),
      })
      .eq('file_path', filePath);

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: action,
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: filePath,
      details: {
        action,
        from: filePath,
        to: destinationPath,
        new_name: action === 'rename' ? newName : undefined,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({
      oldPath: filePath,
      newPath: destinationPath,
      action,
    });
  } catch (err) {
    console.error('File PATCH error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/files/[...path]
// Move file to trash (soft delete)
// =============================================================
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('files.delete');
    if (isApiError(auth)) return auth;

    const { path: pathSegments } = await params;
    const rawPath = pathSegments.join('/');
    const filePath = sanitizePath(rawPath);

    if (!filePath) {
      return apiValidationError('مسار الملف مطلوب');
    }

    // Enforce path-based access control
    if (!canAccessPath(auth, filePath)) {
      return apiForbidden();
    }

    const storage = createServiceRoleClient();
    const supabase = await createServerSupabaseClient();

    const fileName = getFileName(filePath);
    const parentPath = getParentPath(filePath);

    // Get file metadata before moving
    const { data: listData } = await storage.storage
      .from(BUCKET)
      .list(parentPath, { search: fileName });

    const fileMeta = listData?.find((f) => f.name === fileName);
    const fileSize = fileMeta?.metadata?.size || 0;
    const mimeType = fileMeta?.metadata?.mimetype || 'application/octet-stream';

    // Move file to trash using storage.move() — atomic, no download needed
    const trashId = generateId('tr');
    const trashStoragePath = `.trash/${trashId}/${fileName}`;

    const { error: moveError } = await storage.storage
      .from(BUCKET)
      .move(filePath, trashStoragePath);

    if (moveError) {
      console.error('Trash move error:', moveError);
      return apiServerError('فشل في نقل الملف إلى سلة المحذوفات');
    }

    // Insert trash record
    await supabase.from('pyra_trash').insert({
      id: trashId,
      original_path: filePath,
      trash_path: trashStoragePath,
      file_name: fileName,
      file_size: fileSize,
      mime_type: mimeType,
      deleted_by: auth.pyraUser.username,
      deleted_by_display: auth.pyraUser.display_name,
      auto_purge_at: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
    });

    // Remove from file index
    await supabase
      .from('pyra_file_index')
      .delete()
      .eq('file_path', filePath);

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'delete',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: filePath,
      details: {
        file_name: fileName,
        file_size: fileSize,
        mime_type: mimeType,
        trash_path: trashStoragePath,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({
      deletedPath: filePath,
      trashPath: trashStoragePath,
      autoPurgeAt: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
    });
  } catch (err) {
    console.error('File DELETE error:', err);
    return apiServerError();
  }
}
