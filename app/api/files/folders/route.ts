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
  joinPath,
  getParentPath,
} from '@/lib/utils/path';
import { generateId } from '@/lib/utils/id';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// =============================================================
// POST /api/files/folders
// Create a new folder
// Body: { path?: string, name: string }
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { path: rawPath, name: rawName } = body as {
      path?: string;
      name: string;
    };

    if (!rawName || !rawName.trim()) {
      return apiValidationError('اسم المجلد مطلوب');
    }

    const parentPath = sanitizePath(rawPath || '');
    const safeName = sanitizeFileName(rawName.trim());
    const folderPath = joinPath(parentPath, safeName);

    if (!safeName) {
      return apiValidationError('اسم المجلد غير صالح');
    }

    const storage = createServiceRoleClient();
    const supabase = await createServerSupabaseClient();

    // Create the folder by uploading a placeholder file
    const placeholderPath = joinPath(folderPath, '.emptyFolderPlaceholder');
    const placeholderContent = new Uint8Array(0);

    const { error: uploadError } = await storage.storage
      .from(BUCKET)
      .upload(placeholderPath, placeholderContent, {
        contentType: 'application/x-empty',
        upsert: true,
      });

    if (uploadError) {
      console.error('Folder creation error:', uploadError);
      return apiServerError('فشل في إنشاء المجلد');
    }

    // Index the folder
    await supabase.from('pyra_file_index').upsert(
      {
        id: generateId('fi'),
        file_path: folderPath,
        file_name: safeName,
        file_name_lower: safeName.toLowerCase(),
        file_size: 0,
        mime_type: 'folder',
        is_folder: true,
        parent_path: parentPath,
        indexed_at: new Date().toISOString(),
      },
      { onConflict: 'file_path' }
    );

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'create_folder',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: folderPath,
      details: {
        folder_name: safeName,
        parent_path: parentPath,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(
      {
        name: safeName,
        path: folderPath,
        isFolder: true,
      },
      { parentPath }
    );
  } catch (err) {
    console.error('Folder POST error:', err);
    return apiServerError();
  }
}
