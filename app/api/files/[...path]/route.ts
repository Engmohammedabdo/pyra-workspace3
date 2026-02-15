import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
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
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { path: pathSegments } = await params;
    const rawPath = pathSegments.join('/');
    const filePath = sanitizePath(rawPath);

    if (!filePath) {
      return apiValidationError('مسار الملف مطلوب');
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
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { path: pathSegments } = await params;
    const rawPath = pathSegments.join('/');
    const filePath = sanitizePath(rawPath);

    if (!filePath) {
      return apiValidationError('مسار الملف مطلوب');
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

    // Download the original file
    const { data: fileData, error: downloadError } = await storage.storage
      .from(BUCKET)
      .download(filePath);

    if (downloadError || !fileData) {
      console.error('Download for copy error:', downloadError);
      return apiNotFound('الملف غير موجود');
    }

    // Upload to new location
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await storage.storage
      .from(BUCKET)
      .upload(destinationPath, buffer, {
        contentType: fileData.type || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload to new path error:', uploadError);
      return apiServerError('فشل في نقل الملف');
    }

    // Delete original
    const { error: deleteError } = await storage.storage
      .from(BUCKET)
      .remove([filePath]);

    if (deleteError) {
      console.error('Delete original error:', deleteError);
      // File was copied but original not deleted — non-fatal
    }

    // Update file index: remove old entry
    await supabase
      .from('pyra_file_index')
      .delete()
      .eq('file_path', filePath);

    // Insert new file index entry
    const newFileName = getFileName(destinationPath);
    const newParentPath = getParentPath(destinationPath);

    await supabase.from('pyra_file_index').upsert(
      {
        id: generateId('fi'),
        file_path: destinationPath,
        file_name: newFileName,
        file_name_lower: newFileName.toLowerCase(),
        file_size: buffer.byteLength,
        mime_type: fileData.type || 'application/octet-stream',
        is_folder: false,
        parent_path: newParentPath,
        indexed_at: new Date().toISOString(),
      },
      { onConflict: 'file_path' }
    );

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
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { path: pathSegments } = await params;
    const rawPath = pathSegments.join('/');
    const filePath = sanitizePath(rawPath);

    if (!filePath) {
      return apiValidationError('مسار الملف مطلوب');
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

    // Download the file for copying to trash
    const { data: fileData, error: downloadError } = await storage.storage
      .from(BUCKET)
      .download(filePath);

    if (downloadError || !fileData) {
      console.error('Download for trash error:', downloadError);
      return apiNotFound('الملف غير موجود');
    }

    // Generate a unique trash path
    const trashId = generateId('tr');
    const trashStoragePath = `.trash/${trashId}/${fileName}`;

    // Copy to trash location in storage
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: trashUploadError } = await storage.storage
      .from(BUCKET)
      .upload(trashStoragePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (trashUploadError) {
      console.error('Trash upload error:', trashUploadError);
      return apiServerError('فشل في نقل الملف إلى سلة المحذوفات');
    }

    // Delete original from storage
    const { error: deleteError } = await storage.storage
      .from(BUCKET)
      .remove([filePath]);

    if (deleteError) {
      console.error('Delete original error:', deleteError);
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
