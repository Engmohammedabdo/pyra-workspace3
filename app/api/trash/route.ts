import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { isFileAdmin, getUserAllowedPaths } from '@/lib/auth/file-access';
import {
  apiSuccess,
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
    const auth = await requireApiPermission('trash.view');
    if (isApiError(auth)) return auth;

    const supabase = await createServerSupabaseClient();

    // Admins see all trash; non-admins only see trash items they deleted
    // or items from paths they have access to
    let query = supabase
      .from('pyra_trash')
      .select('*', { count: 'exact' })
      .order('deleted_at', { ascending: false });

    if (!isFileAdmin(auth)) {
      // Non-admin: only show their own deleted items
      query = query.eq('deleted_by', auth.pyraUser.username);
    }

    const { data: trashItems, count, error } = await query;

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
    const auth = await requireApiPermission('trash.purge');
    if (isApiError(auth)) return auth;

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

    // Clean file index entries for the original paths
    const originalPaths = expiredItems.map((item) => item.original_path);
    if (originalPaths.length > 0) {
      await supabase
        .from('pyra_file_index')
        .delete()
        .in('file_path', originalPaths);
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
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
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
