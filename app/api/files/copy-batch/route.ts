import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { isPathSafe } from '@/lib/utils/path';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// =============================================================
// POST /api/files/copy-batch
// Copy multiple files to a destination folder using storage.copy()
// Body: { paths: string[], destination: string }
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { paths, destination } = body;

    if (!Array.isArray(paths) || paths.length === 0) {
      return apiValidationError('قائمة الملفات مطلوبة');
    }

    if (!destination || typeof destination !== 'string') {
      return apiValidationError('المجلد الوجهة مطلوب');
    }

    if (!isPathSafe(destination)) {
      return apiValidationError('مسار الوجهة غير صالح');
    }

    const storage = createServiceRoleClient();
    const supabase = await createServerSupabaseClient();
    let copied = 0;

    for (const srcPath of paths) {
      if (!isPathSafe(srcPath)) continue;

      const fileName = srcPath.split('/').pop() || '';
      const destPath = destination.replace(/\/+$/, '') + '/' + fileName;

      // Skip if source equals destination
      if (srcPath === destPath) continue;

      const { error: copyError } = await storage.storage
        .from(BUCKET)
        .copy(srcPath, destPath);

      if (copyError) {
        console.error(`Copy error for ${srcPath}:`, copyError);
        continue;
      }

      // Index the copied file
      const { data: srcIndex } = await supabase
        .from('pyra_file_index')
        .select('file_name, file_size, mime_type')
        .eq('file_path', srcPath)
        .single();

      if (srcIndex) {
        const { generateId } = await import('@/lib/utils/id');
        await supabase.from('pyra_file_index').upsert(
          {
            id: generateId('fi'),
            file_path: destPath,
            file_name: srcIndex.file_name,
            file_name_lower: srcIndex.file_name.toLowerCase(),
            file_size: srcIndex.file_size || 0,
            mime_type: srcIndex.mime_type || 'application/octet-stream',
            is_folder: false,
            parent_path: destination.replace(/\/+$/, ''),
            indexed_at: new Date().toISOString(),
          },
          { onConflict: 'file_path' }
        );
      }

      copied++;
    }

    // Log activity
    const { generateId } = await import('@/lib/utils/id');
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'copy',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: destination,
      details: { files_count: copied, destination },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ copied });
  } catch (err) {
    console.error('POST /api/files/copy-batch error:', err);
    return apiServerError();
  }
}
