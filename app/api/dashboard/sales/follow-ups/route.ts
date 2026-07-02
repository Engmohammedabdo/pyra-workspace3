import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiForbidden, apiNotFound, apiServerError } from '@/lib/api/response';
import { FOLLOW_UP_FIELDS } from '@/lib/supabase/fields';
import { generateId } from '@/lib/utils/id';
import { isSuperAdmin } from '@/lib/auth/rbac';
import { FOLLOW_UP_STATUS } from '@/lib/constants/statuses';
import { logActivity } from '@/lib/api/activity';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_leads.view');
    if (isApiError(auth)) return auth;

    const supabase = await createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const dueBefore = searchParams.get('due_before');
    const quoteId = searchParams.get('quote_id');

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
    if (quoteId) query = query.eq('quote_id', quoteId);

    const { data, error } = await query;
    if (error) return apiServerError(error.message);
    return apiSuccess(data);

  } catch (err) {
    console.error('[GET /api/dashboard/sales/follow-ups] error:', err);
    return apiServerError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_leads.view');
    if (isApiError(auth)) return auth;

    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const { lead_id, quote_id, due_at, title, notes, assigned_to } = body;
    if ((!lead_id && !quote_id) || !due_at) return apiError('العميل المحتمل أو عرض السعر ووقت المتابعة مطلوبين');

    // F1: Verify lead ownership for non-admins
    const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
    if (!isAdmin && lead_id) {
      const { data: lead } = await supabase
        .from('pyra_sales_leads')
        .select('assigned_to')
        .eq('id', lead_id)
        .single();
      if (!lead || lead.assigned_to !== auth.pyraUser.username) {
        return apiForbidden('لا يمكنك إنشاء متابعة لعميل محتمل غير مسند إليك');
      }
    }

    // F2: Non-admins always assigned to self
    const actualAssignedTo = isAdmin ? (assigned_to || auth.pyraUser.username) : auth.pyraUser.username;

    const { data, error } = await supabase
      .from('pyra_sales_follow_ups')
      .insert({
        id: generateId('fu'),
        lead_id: lead_id || null,
        quote_id: quote_id || null,
        assigned_to: actualAssignedTo,
        due_at,
        title: title || null,
        notes: notes || null,
        status: FOLLOW_UP_STATUS.PENDING,
        created_by: auth.pyraUser.username,
      })
      .select(FOLLOW_UP_FIELDS)
      .single();

    if (error) return apiServerError(error.message);

    // Update lead next_follow_up — await + guard on lead_id (a bare `void
    // <builder>` never dispatched, so the parent lead's next_follow_up never
    // reflected a follow-up scheduled from the WhatsApp chat panel).
    if (lead_id) {
      const { error: nfErr } = await supabase
        .from('pyra_sales_leads')
        .update({ next_follow_up: due_at, updated_at: new Date().toISOString() })
        .eq('id', lead_id);
      if (nfErr) console.error('[POST sales/follow-ups] next_follow_up update failed:', nfErr.message);
    }

  
    logActivity(auth.pyraUser.username, auth.pyraUser.display_name, 'follow_up_created', '/dashboard/crm/follow-ups', {});

  return apiSuccess(data, undefined, 201);

  } catch (err) {
    console.error('[POST /api/dashboard/sales/follow-ups] error:', err);
    return apiServerError();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_leads.view');
    if (isApiError(auth)) return auth;

    const supabase = await createServerSupabaseClient();
    const body = await request.json();
    const { id, status, title, notes, due_at } = body;

    if (!id) return apiError('معرّف المتابعة مطلوب');

    // Agent scoping: verify ownership before update
    const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
    if (!isAdmin) {
      const { data: existing } = await supabase
        .from('pyra_sales_follow_ups')
        .select('assigned_to')
        .eq('id', id)
        .single();
      if (!existing || existing.assigned_to !== auth.pyraUser.username) {
        return apiNotFound('المتابعة غير موجودة');
      }
    }

    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (title !== undefined) updates.title = title;
    if (notes !== undefined) updates.notes = notes;
    if (due_at !== undefined) updates.due_at = due_at;
    if (status === FOLLOW_UP_STATUS.COMPLETED) updates.completed_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('pyra_sales_follow_ups')
      .update(updates)
      .eq('id', id)
      .select(FOLLOW_UP_FIELDS)
      .single();

    if (error) return apiServerError(error.message);
    return apiSuccess(data);

  } catch (err) {
    console.error('[PATCH /api/dashboard/sales/follow-ups] error:', err);
    return apiServerError();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_leads.manage');
    if (isApiError(auth)) return auth;

    const supabase = await createServerSupabaseClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return apiError('معرّف المتابعة مطلوب');

    // Agent scoping: verify ownership before deletion
    const isAdmin = isSuperAdmin(auth.pyraUser.rolePermissions);
    if (!isAdmin) {
      const { data: existing } = await supabase
        .from('pyra_sales_follow_ups')
        .select('assigned_to')
        .eq('id', id)
        .single();
      if (!existing || existing.assigned_to !== auth.pyraUser.username) {
        return apiNotFound('المتابعة غير موجودة');
      }
    }

    const { error } = await supabase
      .from('pyra_sales_follow_ups')
      .delete()
      .eq('id', id);

    if (error) return apiServerError(error.message);
    return apiSuccess({ deleted: true });

  } catch (err) {
    console.error('[DELETE /api/dashboard/sales/follow-ups] error:', err);
    return apiServerError();
  }
}
