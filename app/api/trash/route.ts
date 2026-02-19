import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// =============================================================
// GET /api/trash
// List trashed items (admin only)
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = await createServerSupabaseClient();

    const { data: trashItems, count, error } = await supabase
      .from('pyra_trash')
      .select('*', { count: 'exact' })
      .order('deleted_at', { ascending: false });

    if (error) {
      console.error('Trash list error:', error);
      return apiServerError();
    }

    return apiSuccess(trashItems || [], {
      total: count ?? 0,
    });
  } catch (err) {
    console.error('GET /api/trash error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/trash
// Permanently delete all expired trash items (admin only)
// =============================================================
export async function DELETE(request: NextRequest) {
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
      console.error('Trash fetch expired error:', fetchError);
      return apiServerError();
    }

    if (!expiredItems || expiredItems.length === 0) {
      return apiSuccess({ purged: 0 });
    }

    // Remove files from storage
    const trashPaths = expiredItems.map((item) => item.trash_path);
    const { error: storageError } = await storage.storage
      .from(BUCKET)
      .remove(trashPaths);

    if (storageError) {
      console.error('Trash storage purge error:', storageError);
      // Continue to remove DB records even if storage removal partially fails
    }

    // Remove from DB
    const ids = expiredItems.map((item) => item.id);
    const { error: deleteError } = await supabase
      .from('pyra_trash')
      .delete()
      .in('id', ids);

    if (deleteError) {
      console.error('Trash DB purge error:', deleteError);
      return apiServerError();
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'trash_purge',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: '/trash',
      details: {
        purged_count: expiredItems.length,
        purged_ids: ids,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ purged: expiredItems.length });
  } catch (err) {
    console.error('DELETE /api/trash error:', err);
    return apiServerError();
  }
}
