import { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError, getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';

/**
 * GET /api/dashboard/sales/whatsapp/sla
 * List all SLA policies.
 */
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return apiError('غير مصرح', 401);

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('pyra_sla_policies')
      .select('*')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) return apiServerError(error.message);
    return apiSuccess(data || []);
  } catch (err) {
    return apiServerError(err instanceof Error ? err.message : 'خطأ في الخادم');
  }
}

/**
 * POST /api/dashboard/sales/whatsapp/sla
 * Create a new SLA policy.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiPermission('sales_whatsapp.manage');
  if (isApiError(auth)) return auth;

  try {
    const body = await request.json();
    const { name, name_ar, first_response_minutes, resolution_minutes, priority } = body;

    if (!name) return apiError('اسم السياسة مطلوب');
    if (!first_response_minutes || first_response_minutes < 1) return apiError('وقت الرد الأول مطلوب');
    if (!resolution_minutes || resolution_minutes < 1) return apiError('وقت الحل مطلوب');

    const supabase = createServiceRoleClient();
    const id = generateId('sla');

    const { data, error } = await supabase
      .from('pyra_sla_policies')
      .insert({
        id,
        name,
        name_ar: name_ar || null,
        first_response_minutes: Number(first_response_minutes),
        resolution_minutes: Number(resolution_minutes),
        priority: priority || 'normal',
        is_active: true,
        created_by: auth.pyraUser.username,
      })
      .select()
      .single();

    if (error) return apiServerError(error.message);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'sla_policy_created',
      `/dashboard/sales/settings`,
      { policy_id: id, name }
    );

    return apiSuccess(data, undefined, 201);
  } catch (err) {
    return apiServerError(err instanceof Error ? err.message : 'خطأ في الخادم');
  }
}

/**
 * PUT /api/dashboard/sales/whatsapp/sla
 * Update an existing SLA policy.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireApiPermission('sales_whatsapp.manage');
  if (isApiError(auth)) return auth;

  try {
    const body = await request.json();
    const { id, name, name_ar, first_response_minutes, resolution_minutes, priority, is_active } = body;

    if (!id) return apiError('معرف السياسة مطلوب');

    const supabase = createServiceRoleClient();

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (name_ar !== undefined) updateData.name_ar = name_ar;
    if (first_response_minutes !== undefined) updateData.first_response_minutes = Number(first_response_minutes);
    if (resolution_minutes !== undefined) updateData.resolution_minutes = Number(resolution_minutes);
    if (priority !== undefined) updateData.priority = priority;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from('pyra_sla_policies')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) return apiServerError(error.message);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'sla_policy_updated',
      `/dashboard/sales/settings`,
      { policy_id: id }
    );

    return apiSuccess(data);
  } catch (err) {
    return apiServerError(err instanceof Error ? err.message : 'خطأ في الخادم');
  }
}

/**
 * DELETE /api/dashboard/sales/whatsapp/sla
 * Delete an SLA policy.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireApiPermission('sales_whatsapp.manage');
  if (isApiError(auth)) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return apiError('معرف السياسة مطلوب');

    const supabase = createServiceRoleClient();

    // Remove SLA policy reference from conversations first
    await supabase
      .from('pyra_whatsapp_conversations')
      .update({ sla_policy_id: null })
      .eq('sla_policy_id', id);

    const { error } = await supabase
      .from('pyra_sla_policies')
      .delete()
      .eq('id', id);

    if (error) return apiServerError(error.message);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'sla_policy_deleted',
      `/dashboard/sales/settings`,
      { policy_id: id }
    );

    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiServerError(err instanceof Error ? err.message : 'خطأ في الخادم');
  }
}
