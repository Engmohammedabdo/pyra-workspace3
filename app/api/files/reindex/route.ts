import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { getParentPath } from '@/lib/utils/path';
import { generateId } from '@/lib/utils/id';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

/**
 * POST /api/files/reindex
 * Admin-only: Scan Supabase Storage and re-index all files into pyra_file_index.
 * This fixes any files that were uploaded but not properly indexed.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiUnauthorized();

    const storage = createServiceRoleClient();
    const supabase = await createServerSupabaseClient();

    let totalIndexed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    // Recursive function to scan a folder
    async function scanFolder(folderPath: string): Promise<void> {
      const { data: items, error } = await storage.storage
        .from(BUCKET)
        .list(folderPath, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

      if (error) {
        console.error(`Reindex: error listing ${folderPath}:`, error);
        totalErrors++;
        return;
      }

      if (!items || items.length === 0) return;

      for (const item of items) {
        // Skip placeholder files
        if (item.name === '.emptyFolderPlaceholder' || item.name === '.gitkeep') continue;

        const itemPath = folderPath ? `${folderPath}/${item.name}` : item.name;

        if (item.id === null) {
          // It's a folder — recurse
          await scanFolder(itemPath);
        } else {
          // It's a file — upsert into index
          const parentPath = getParentPath(itemPath);
          const fileSize = item.metadata?.size || 0;
          const mimeType = item.metadata?.mimetype || 'application/octet-stream';

          const { error: upsertError } = await supabase
            .from('pyra_file_index')
            .upsert(
              {
                id: generateId('fi'),
                file_path: itemPath,
                file_name: item.name,
                file_name_lower: item.name.toLowerCase(),
                file_size: fileSize,
                mime_type: mimeType,
                is_folder: false,
                parent_path: parentPath,
                indexed_at: new Date().toISOString(),
              },
              { onConflict: 'file_path' }
            );

          if (upsertError) {
            console.error(`Reindex: error indexing ${itemPath}:`, upsertError);
            totalErrors++;
          } else {
            totalIndexed++;
          }
        }
      }
    }

    // Start scanning from root
    await scanFolder('');

    return apiSuccess({
      indexed: totalIndexed,
      skipped: totalSkipped,
      errors: totalErrors,
      message: `تم فهرسة ${totalIndexed} ملف بنجاح${totalErrors > 0 ? `، ${totalErrors} أخطاء` : ''}`,
    });
  } catch (err) {
    console.error('Reindex error:', err);
    return apiServerError(
      `خطأ في إعادة الفهرسة: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
