import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiNotFound, apiServerError } from '@/lib/api/response';
import { LEAD_FIELDS } from '@/lib/supabase/fields';
import { generateId } from '@/lib/utils/id';
import { isSuperAdmin } from '@/lib/auth/rbac';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('sales_leads.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('pyra_sales_leads')
    .select(LEAD_FIELDS)
    .eq('id', id)
    .single();

  if (error || !data) return apiNotFound('العميل المحتمل غير موجود');

  // Agent scoping
  const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
  if (!isAdmin && data.assigned_to !== auth.pyraUser.username) {
    return apiNotFound('العميل المحتمل غير موجود');
  }

  // Fetch labels for this lead
  const { data: labelLinks } = await supabase
    .from('pyra_lead_labels')
    .select('label_id, pyra_sales_labels(id, name, name_ar, color)')
    .eq('lead_id', id);

  const labels = (labelLinks || [])
    .map((l: Record<string, unknown>) => l.pyra_sales_labels)
    .filter(Boolean);

  // Fetch stage info
  let stageInfo = null;
  if (data.stage_id) {
    const { data: stage } = await supabase
      .from('pyra_sales_pipeline_stages')
      .select('id, name, name_ar, color')
      .eq('id', data.stage_id)
      .single();
    stageInfo = stage;
  }

  return apiSuccess({ ...data, labels, stage: stageInfo });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('sales_leads.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const body = await request.json();

  // Check lead exists
  const { data: existing, error: fetchError } = await supabase
    .from('pyra_sales_leads')
    .select('id, stage_id, assigned_to')
    .eq('id', id)
    .single();

  if (fetchError || !existing) return apiNotFound('العميل المحتمل غير موجود');

  // Agent scoping
  const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
  if (!isAdmin && existing.assigned_to !== auth.pyraUser.username) {
    return apiNotFound('العميل المحتمل غير موجود');
  }

  const allowedFields = [
    'name', 'phone', 'email', 'company', 'source', 'stage_id',
    'assigned_to', 'notes', 'priority', 'last_contact_at', 'next_follow_up',
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowedFields) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const { data, error } = await supabase
    .from('pyra_sales_leads')
    .update(updates)
    .eq('id', id)
    .select(LEAD_FIELDS)
    .single();

  if (error) return apiServerError(error.message);

  // Log stage change as activity
  if (body.stage_id && body.stage_id !== existing.stage_id) {
    void supabase.from('pyra_lead_activities').insert({
      id: generateId('la'),
      lead_id: id,
      activity_type: 'stage_change',
      description: `تم تغيير المرحلة`,
      metadata: { from: existing.stage_id, to: body.stage_id },
      created_by: auth.pyraUser.username,
    });
  }

  return apiSuccess(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('sales_leads.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from('pyra_sales_leads')
    .delete()
    .eq('id', id);

  if (error) return apiServerError(error.message);
  return apiSuccess({ deleted: true });
}
