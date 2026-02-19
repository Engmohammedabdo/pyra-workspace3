import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// =============================================================
// POST /api/trash/empty
// Empty ALL trash items permanently (admin only)
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = await createServerSupabaseClient();
    const storage = createServiceRoleClient();

    // Fetch all trash items
    const { data: allItems, error: fetchError } = await supabase
      .from('pyra_trash')
      .select('*');

    if (fetchError) {
      console.error('Trash empty fetch error:', fetchError);
      return apiServerError();
    }

    if (!allItems || allItems.length === 0) {
      return apiSuccess({ purged: 0, message: 'السلة فارغة بالفعل' });
    }

    // Remove files from storage in batches of 100
    const trashPaths = allItems.map((item) => item.trash_path);
    for (let i = 0; i < trashPaths.length; i += 100) {
      const batch = trashPaths.slice(i, i + 100);
      const { error: storageError } = await storage.storage
        .from(BUCKET)
        .remove(batch);

      if (storageError) {
        console.error(`Trash storage batch ${i} error:`, storageError);
        // Continue — don't stop on partial storage failures
      }
    }

    // Also remove from file index
    const originalPaths = allItems.map((item) => item.original_path);
    await supabase
      .from('pyra_file_index')
      .delete()
      .in('file_path', originalPaths);

    // Remove ALL records from DB
    const ids = allItems.map((item) => item.id);
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      await supabase
        .from('pyra_trash')
        .delete()
        .in('id', batch);
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'trash_empty',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: '/trash',
      details: {
        purged_count: allItems.length,
        total_size: allItems.reduce((sum, item) => sum + (item.file_size || 0), 0),
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ purged: allItems.length });
  } catch (err) {
    console.error('POST /api/trash/empty error:', err);
    return apiServerError();
  }
}
