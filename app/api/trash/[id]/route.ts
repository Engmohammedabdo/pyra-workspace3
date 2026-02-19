import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiForbidden,
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
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

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

    // Move file from trash path back to original path in storage
    const { data: fileData, error: downloadError } = await storage.storage
      .from(BUCKET)
      .download(trashItem.trash_path);

    if (downloadError || !fileData) {
      console.error('Trash restore download error:', downloadError);
      return apiServerError('فشل في استعادة الملف من التخزين');
    }

    // Upload to original path
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const { error: uploadError } = await storage.storage
      .from(BUCKET)
      .upload(trashItem.original_path, buffer, {
        contentType: trashItem.mime_type || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      console.error('Trash restore upload error:', uploadError);
      return apiServerError('فشل في إعادة الملف إلى مساره الأصلي');
    }

    // Remove from trash path in storage
    await storage.storage
      .from(BUCKET)
      .remove([trashItem.trash_path]);

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
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
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
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

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

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'trash_permanent_delete',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
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
