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
import { sanitizePath, getFileName, getParentPath, joinPath } from '@/lib/utils/path';
import { generateId } from '@/lib/utils/id';
import { apiWriteLimiter, checkRateLimit } from '@/lib/utils/rate-limit';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// Maximum paths per batch
const MAX_BATCH_SIZE = 50;

// =============================================================
// POST /api/files/delete-batch
// Batch delete files (move to trash)
// Body: { paths: string[] }
// =============================================================
export async function POST(request: NextRequest) {
  try {
    // Rate limit batch deletes
    const limited = checkRateLimit(apiWriteLimiter, request);
    if (limited) return limited;

    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { paths } = body as { paths: string[] };

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return apiValidationError('يجب تحديد ملف واحد على الأقل للحذف');
    }

    if (paths.length > MAX_BATCH_SIZE) {
      return apiValidationError(
        `الحد الأقصى للحذف الجماعي هو ${MAX_BATCH_SIZE} ملف`
      );
    }

    const storage = createServiceRoleClient();
    const supabase = await createServerSupabaseClient();

    const deleted: string[] = [];
    const errors: { path: string; error: string }[] = [];

    for (const rawPath of paths) {
      const filePath = sanitizePath(rawPath);

      if (!filePath) {
        errors.push({ path: rawPath, error: 'مسار غير صالح' });
        continue;
      }

      const fileName = getFileName(filePath);
      const parentPath = getParentPath(filePath);

      try {
        // Get file metadata
        const { data: listData } = await storage.storage
          .from(BUCKET)
          .list(parentPath, { search: fileName });

        const fileMeta = listData?.find((f) => f.name === fileName);
        const fileSize = fileMeta?.metadata?.size || 0;
        const mimeType =
          fileMeta?.metadata?.mimetype || 'application/octet-stream';

        // Download the file
        const { data: fileData, error: downloadError } = await storage.storage
          .from(BUCKET)
          .download(filePath);

        if (downloadError || !fileData) {
          errors.push({ path: filePath, error: 'الملف غير موجود' });
          continue;
        }

        // Copy to trash storage
        const trashId = generateId('tr');
        const trashStoragePath = `.trash/${trashId}/${fileName}`;

        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { error: trashUploadError } = await storage.storage
          .from(BUCKET)
          .upload(trashStoragePath, buffer, {
            contentType: mimeType,
            upsert: false,
          });

        if (trashUploadError) {
          errors.push({
            path: filePath,
            error: 'فشل في نقل إلى سلة المحذوفات',
          });
          continue;
        }

        // Delete original from storage
        await storage.storage.from(BUCKET).remove([filePath]);

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

        // Log activity for each file
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
            batch_delete: true,
          },
          ip_address: request.headers.get('x-forwarded-for') || 'unknown',
        });

        deleted.push(filePath);
      } catch (fileErr) {
        console.error(`Batch delete error for ${filePath}:`, fileErr);
        errors.push({ path: filePath, error: 'خطأ غير متوقع' });
      }
    }

    return apiSuccess(
      { deleted, errors },
      {
        totalRequested: paths.length,
        deletedCount: deleted.length,
        errorCount: errors.length,
      }
    );
  } catch (err) {
    console.error('Batch delete POST error:', err);
    return apiServerError();
  }
}
