import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

export const dynamic = 'force-dynamic';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

type RouteContext = { params: Promise<{ id: string }> };

// =============================================================
// DELETE /api/files/versions/[id]
// Delete a specific version (storage + record)
// =============================================================
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const { id } = await context.params;

    const supabase = await createServerSupabaseClient();

    // Get version record first
    const { data: version, error: fetchError } = await supabase
      .from('pyra_file_versions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !version) {
      return apiNotFound('النسخة غير موجودة');
    }

    // Delete from storage
    const storage = createServiceRoleClient();
    await storage.storage.from(BUCKET).remove([version.version_path]);

    // Delete record
    const { error: deleteError } = await supabase
      .from('pyra_file_versions')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Version delete error:', deleteError);
      return apiServerError();
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'version_delete',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: version.file_path,
      details: {
        version_number: version.version_number,
        version_path: version.version_path,
      },
      ip_address: 'system',
    });

    return apiSuccess({ deleted: true, version_id: id });
  } catch (err) {
    console.error('DELETE /api/files/versions/[id] error:', err);
    return apiServerError();
  }
}
