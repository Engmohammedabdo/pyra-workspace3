import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getParentPath, isPathSafe } from '@/lib/utils/path';
import { generateId } from '@/lib/utils/id';

export const dynamic = 'force-dynamic';

/**
 * POST /api/files/upload-complete
 * Called after a successful direct-to-storage upload.
 * Indexes the file in pyra_file_index and logs the activity.
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

    const supabase = await createServerSupabaseClient();
    const parentPath = getParentPath(storagePath);

    // Index the file
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
      // Don't rollback storage — file is already there. Just report.
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
