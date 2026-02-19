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
// POST /api/trash/purge-expired
// Purge only expired trash items (auto_purge_at < now)
// Can be called manually or via cron job
// =============================================================
export async function POST(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = await createServerSupabaseClient();
    const storage = createServiceRoleClient();
    const now = new Date().toISOString();

    // Find expired items
    const { data: expiredItems, error: fetchError } = await supabase
      .from('pyra_trash')
      .select('*')
      .lt('auto_purge_at', now);

    if (fetchError) {
      console.error('Trash purge-expired fetch error:', fetchError);
      return apiServerError();
    }

    if (!expiredItems || expiredItems.length === 0) {
      return apiSuccess({ purged: 0, message: 'لا توجد ملفات منتهية الصلاحية' });
    }

    // Remove files from storage
    const trashPaths = expiredItems.map((item) => item.trash_path);
    for (let i = 0; i < trashPaths.length; i += 100) {
      const batch = trashPaths.slice(i, i + 100);
      await storage.storage.from(BUCKET).remove(batch);
    }

    // Remove from file index
    const originalPaths = expiredItems.map((item) => item.original_path);
    await supabase
      .from('pyra_file_index')
      .delete()
      .in('file_path', originalPaths);

    // Remove from DB
    const ids = expiredItems.map((item) => item.id);
    await supabase
      .from('pyra_trash')
      .delete()
      .in('id', ids);

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'trash_purge_expired',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: '/trash',
      details: {
        purged_count: expiredItems.length,
        total_size: expiredItems.reduce((sum, item) => sum + (item.file_size || 0), 0),
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ purged: expiredItems.length });
  } catch (err) {
    console.error('POST /api/trash/purge-expired error:', err);
    return apiServerError();
  }
}
