import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { generateId } from '@/lib/utils/id';
import { isSuperAdmin } from '@/lib/auth/rbac';

const ASSIGNMENT_FIELDS = `id, remote_jid, instance_name, assigned_to, assigned_by, assigned_at, is_pinned, is_archived`;

/**
 * GET /api/dashboard/sales/whatsapp/assignments
 * List conversation assignments. Admin sees all, agents see their own.
 */
export async function GET() {
  const auth = await requireApiPermission('sales_whatsapp.view');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();
  const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);

  let query = supabase
    .from('pyra_whatsapp_assignments')
    .select(ASSIGNMENT_FIELDS)
    .order('assigned_at', { ascending: false });

  if (!isAdmin) {
    query = query.eq('assigned_to', auth.pyraUser.username);
  }

  const { data, error } = await query;
  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

/**
 * POST /api/dashboard/sales/whatsapp/assignments
 * Assign a conversation to an agent. Admin only.
 * Body: { remote_jid, instance_name, assigned_to }
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiPermission('sales_pipeline.manage');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const { remote_jid, instance_name, assigned_to } = body;

  if (!remote_jid || !instance_name || !assigned_to) {
    return apiError('remote_jid و instance_name و assigned_to مطلوبين');
  }

  // Upsert — if assignment exists, update it
  const { data: existing } = await supabase
    .from('pyra_whatsapp_assignments')
    .select('id')
    .eq('remote_jid', remote_jid)
    .eq('instance_name', instance_name)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('pyra_whatsapp_assignments')
      .update({
        assigned_to,
        assigned_by: auth.pyraUser.username,
        assigned_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select(ASSIGNMENT_FIELDS)
      .single();

    if (error) return apiServerError(error.message);
    return apiSuccess(data);
  }

  const { data, error } = await supabase
    .from('pyra_whatsapp_assignments')
    .insert({
      id: generateId('wa'),
      remote_jid,
      instance_name,
      assigned_to,
      assigned_by: auth.pyraUser.username,
    })
    .select(ASSIGNMENT_FIELDS)
    .single();

  if (error) return apiServerError(error.message);
  return apiSuccess(data, undefined, 201);
}
