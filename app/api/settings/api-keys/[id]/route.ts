import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { API_KEY_FIELDS } from '@/lib/supabase/fields';

/**
 * PATCH /api/settings/api-keys/[id]
 * Update an API key (name, permissions, is_active).
 * Admin only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await params;
    const supabase = createServiceRoleClient();
    const body = await req.json();

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.permissions !== undefined) updates.permissions = body.permissions;
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('pyra_api_keys')
      .update(updates)
      .eq('id', id)
      .select(API_KEY_FIELDS)
      .single();

    if (error || !data) return apiNotFound('مفتاح API غير موجود');

    // Activity log
    supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'update_api_key',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/settings/api-keys/${id}`,
      details: { updates },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    }).then();

    return apiSuccess(data);
  } catch {
    return apiServerError();
  }
}

/**
 * DELETE /api/settings/api-keys/[id]
 * Hard-delete an API key.
 * Admin only.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // Fetch key name for activity log before deleting
    const { data: existing } = await supabase
      .from('pyra_api_keys')
      .select('name')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return apiNotFound('مفتاح API غير موجود');

    const { error } = await supabase
      .from('pyra_api_keys')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Activity log
    supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'delete_api_key',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/settings/api-keys/${id}`,
      details: { api_key_name: existing.name },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    }).then();

    return apiSuccess({ deleted: true });
  } catch {
    return apiServerError();
  }
}
