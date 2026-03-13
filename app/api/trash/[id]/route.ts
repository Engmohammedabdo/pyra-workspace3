import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// =============================================================
// POST /api/trash/[id]
// Restore item from trash (admin only)
// =============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('trash.restore');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const storage = createServiceRoleClient();

    // Find the trashed item
    const { data: trashItem, error: fetchError } = await supabase
      .from('pyra_trash')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !trashItem) {
      return apiNotFound('العنصر غير موجود في سلة المهملات');
    }

    // Move file from trash path back to original path atomically
    const { error: moveError } = await storage.storage
      .from(BUCKET)
      .move(trashItem.trash_path, trashItem.original_path);

    if (moveError) {
      console.error('Trash restore move error:', moveError);
      return apiServerError('فشل في استعادة الملف إلى مساره الأصلي');
    }

    // Delete from pyra_trash table
    const { error: deleteError } = await supabase
      .from('pyra_trash')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Trash DB delete error:', deleteError);
      return apiServerError();
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'trash_restore',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: trashItem.original_path,
      details: {
        file_name: trashItem.file_name,
        restored_from: trashItem.trash_path,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({
      restored: true,
      original_path: trashItem.original_path,
    });
  } catch (err) {
    console.error('POST /api/trash/[id] error:', err);
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/trash/[id]
// Permanently delete a single item (admin only)
// =============================================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('trash.purge');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const storage = createServiceRoleClient();

    // Find the trashed item
    const { data: trashItem, error: fetchError } = await supabase
      .from('pyra_trash')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !trashItem) {
      return apiNotFound('العنصر غير موجود في سلة المهملات');
    }

    // Remove from storage
    const { error: storageError } = await storage.storage
      .from(BUCKET)
      .remove([trashItem.trash_path]);

    if (storageError) {
      console.error('Trash permanent delete storage error:', storageError);
      // Continue to remove DB record
    }

    // Remove from DB
    const { error: deleteError } = await supabase
      .from('pyra_trash')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Trash permanent delete DB error:', deleteError);
      return apiServerError();
    }

    // Also clean file index if any remnants exist
    await supabase
      .from('pyra_file_index')
      .delete()
      .eq('file_path', trashItem.original_path);

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'trash_permanent_delete',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: trashItem.original_path,
      details: {
        file_name: trashItem.file_name,
        file_size: trashItem.file_size,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/trash/[id] error:', err);
    return apiServerError();
  }
}
