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
import type { FileListItem } from '@/types/database';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// Maximum upload size: 100 MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;

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

    // Validate file sizes
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return apiValidationError(
          `الملف "${file.name}" يتجاوز الحد الأقصى المسموح (100 MB)`
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

      uploadedPaths.push(filePath);

      // Update file index
      await supabase.from('pyra_file_index').upsert(
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

      // Log activity
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
    console.error('Files POST error:', err);
    return apiServerError();
  }
}
