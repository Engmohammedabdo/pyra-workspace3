import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { FOLLOW_UP_FIELDS } from '@/lib/supabase/fields';
import { generateId } from '@/lib/utils/id';
import { isSuperAdmin } from '@/lib/auth/rbac';

export async function GET(request: NextRequest) {
  const auth = await requireApiPermission('sales_leads.view');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const dueBefore = searchParams.get('due_before');

  let query = supabase
    .from('pyra_sales_follow_ups')
    .select(FOLLOW_UP_FIELDS)
    .order('due_at', { ascending: true });

  // Agent scoping
  const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
  if (!isAdmin) {
    query = query.eq('assigned_to', auth.pyraUser.username);
  }

  if (status) query = query.eq('status', status);
  if (dueBefore) query = query.lte('due_at', dueBefore);

  const { data, error } = await query;
  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiPermission('sales_leads.view');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();
  const body = await request.json();

  const { lead_id, due_at, title, notes, assigned_to } = body;
  if (!lead_id || !due_at) return apiError('العميل المحتمل ووقت المتابعة مطلوبين');

  const { data, error } = await supabase
    .from('pyra_sales_follow_ups')
    .insert({
      id: generateId('fu'),
      lead_id,
      assigned_to: assigned_to || auth.pyraUser.username,
      due_at,
      title: title || null,
      notes: notes || null,
      status: 'pending',
      created_by: auth.pyraUser.username,
    })
    .select(FOLLOW_UP_FIELDS)
    .single();

  if (error) return apiServerError(error.message);

  // Update lead next_follow_up
  void supabase
    .from('pyra_sales_leads')
    .update({ next_follow_up: due_at, updated_at: new Date().toISOString() })
    .eq('id', lead_id);

  return apiSuccess(data, undefined, 201);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiPermission('sales_leads.view');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();
  const body = await request.json();
  const { id, status, title, notes, due_at } = body;

  if (!id) return apiError('معرّف المتابعة مطلوب');

  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (title !== undefined) updates.title = title;
  if (notes !== undefined) updates.notes = notes;
  if (due_at !== undefined) updates.due_at = due_at;
  if (status === 'completed') updates.completed_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('pyra_sales_follow_ups')
    .update(updates)
    .eq('id', id)
    .select(FOLLOW_UP_FIELDS)
    .single();

  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}
