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
  getFileName,
  getParentPath,
  joinPath,
} from '@/lib/utils/path';
import { generateId } from '@/lib/utils/id';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

/**
 * POST /api/files/move-batch
 *
 * Move one or more files/folders to a destination folder.
 * Folders are moved recursively (all children are moved).
 *
 * Body: { sourcePaths: string[], destinationFolder: string }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const body = await request.json();
    const { sourcePaths, destinationFolder } = body as {
      sourcePaths: string[];
      destinationFolder: string;
    };

    if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
      return apiValidationError('يجب تحديد ملف واحد على الأقل للنقل');
    }

    if (sourcePaths.length > 50) {
      return apiValidationError('الحد الأقصى 50 عنصر في المرة الواحدة');
    }

    const destFolder = sanitizePath(destinationFolder || '');
    const storage = createServiceRoleClient();
    const supabase = await createServerSupabaseClient();

    const moved: string[] = [];
    const errors: string[] = [];

    for (const rawSource of sourcePaths) {
      const sourcePath = sanitizePath(rawSource);
      if (!sourcePath) {
        errors.push('مسار فارغ');
        continue;
      }

      // Prevent moving into itself
      if (destFolder === sourcePath || destFolder.startsWith(sourcePath + '/')) {
        errors.push(`لا يمكن نقل "${getFileName(sourcePath)}" داخل نفسه`);
        continue;
      }

      const fileName = getFileName(sourcePath);
      const newPath = joinPath(destFolder, fileName);

      // Same location check
      if (newPath === sourcePath) {
        errors.push(`"${fileName}" موجود بالفعل في نفس المكان`);
        continue;
      }

      try {
        // Try to determine if this is a folder by listing its children
        const { data: children } = await storage.storage
          .from(BUCKET)
          .list(sourcePath, { limit: 1 });

        const isFolder = children && children.length > 0;

        if (isFolder) {
          // ── Move folder recursively ──
          await moveFolderRecursive(storage, supabase, sourcePath, newPath);
          moved.push(sourcePath);
        } else {
          // ── Move single file ──
          await moveSingleFile(storage, supabase, sourcePath, newPath);
          moved.push(sourcePath);
        }

        // Log activity
        await supabase.from('pyra_activity_log').insert({
          id: generateId('al'),
          action_type: 'move',
          username: auth.pyraUser.username,
          display_name: auth.pyraUser.display_name,
          target_path: sourcePath,
          details: {
            from: sourcePath,
            to: newPath,
            is_folder: isFolder,
          },
          ip_address: request.headers.get('x-forwarded-for') || 'unknown',
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'خطأ غير معروف';
        errors.push(`فشل نقل "${fileName}": ${msg}`);
      }
    }

    if (moved.length === 0) {
      return apiServerError(errors.join('; ') || 'فشل نقل جميع الملفات');
    }

    return apiSuccess(
      { moved, errors },
      { movedCount: moved.length, errorCount: errors.length }
    );
  } catch (err) {
    console.error('Move-batch error:', err);
    return apiServerError();
  }
}

/**
 * Move a single file: download → upload to new path → delete original → update index
 */
async function moveSingleFile(
  storage: ReturnType<typeof createServiceRoleClient>,
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  sourcePath: string,
  destPath: string
) {
  // Download original
  const { data: fileData, error: dlError } = await storage.storage
    .from(BUCKET)
    .download(sourcePath);

  if (dlError || !fileData) {
    throw new Error('الملف غير موجود');
  }

  // Upload to new location
  const buffer = Buffer.from(await fileData.arrayBuffer());
  const { error: upError } = await storage.storage
    .from(BUCKET)
    .upload(destPath, buffer, {
      contentType: fileData.type || 'application/octet-stream',
      upsert: true,
    });

  if (upError) {
    throw new Error('فشل الرفع إلى المسار الجديد');
  }

  // Delete original
  await storage.storage.from(BUCKET).remove([sourcePath]);

  // Update file index
  await supabase.from('pyra_file_index').delete().eq('file_path', sourcePath);

  const newFileName = getFileName(destPath);
  const newParentPath = getParentPath(destPath);
  await supabase.from('pyra_file_index').upsert(
    {
      id: generateId('fi'),
      file_path: destPath,
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
}

/**
 * Move a folder recursively: list all children → move each file → clean up placeholders
 */
async function moveFolderRecursive(
  storage: ReturnType<typeof createServiceRoleClient>,
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  sourceFolderPath: string,
  destFolderPath: string
) {
  // List all items in the source folder
  const { data: items, error: listError } = await storage.storage
    .from(BUCKET)
    .list(sourceFolderPath, { limit: 500 });

  if (listError) {
    throw new Error('فشل قراءة محتويات المجلد');
  }

  if (!items || items.length === 0) {
    // Empty folder — just create placeholder at destination
    await storage.storage.from(BUCKET).upload(
      `${destFolderPath}/.emptyFolderPlaceholder`,
      Buffer.from(''),
      { contentType: 'text/plain', upsert: true }
    );
    // Remove old placeholder
    await storage.storage
      .from(BUCKET)
      .remove([`${sourceFolderPath}/.emptyFolderPlaceholder`]);
    return;
  }

  for (const item of items) {
    const childSourcePath = `${sourceFolderPath}/${item.name}`;
    const childDestPath = `${destFolderPath}/${item.name}`;

    if (item.id === null) {
      // This is a sub-folder → recurse
      await moveFolderRecursive(storage, supabase, childSourcePath, childDestPath);
    } else {
      // This is a file → move it
      if (item.name === '.emptyFolderPlaceholder') {
        // Move placeholder too
        await storage.storage.from(BUCKET).upload(
          childDestPath,
          Buffer.from(''),
          { contentType: 'text/plain', upsert: true }
        );
        await storage.storage.from(BUCKET).remove([childSourcePath]);
      } else {
        await moveSingleFile(storage, supabase, childSourcePath, childDestPath);
      }
    }
  }

  // Clean up: try to remove the now-empty source folder placeholder
  await storage.storage
    .from(BUCKET)
    .remove([`${sourceFolderPath}/.emptyFolderPlaceholder`]);
}
