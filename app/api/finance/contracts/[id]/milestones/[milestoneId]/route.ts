import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiError,
  apiForbidden,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { MILESTONE_FIELDS } from '@/lib/supabase/fields';

type RouteContext = { params: Promise<{ id: string; milestoneId: string }> };

/**
 * PATCH /api/finance/contracts/[id]/milestones/[milestoneId]
 * Update a milestone.
 *
 * Body: { title?, description?, percentage?, amount?, due_date?, status?, sort_order? }
 */
export async function PATCH(
  req: NextRequest,
  context: RouteContext
) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const { id, milestoneId } = await context.params;
  const supabase = createServiceRoleClient();

  try {
    // Fetch existing milestone
    const { data: existing, error: fetchErr } = await supabase
      .from('pyra_contract_milestones')
      .select(MILESTONE_FIELDS)
      .eq('id', milestoneId)
      .eq('contract_id', id)
      .maybeSingle();

    if (fetchErr || !existing) return apiNotFound('المرحلة غير موجودة');

    const body = await req.json();
    const update: Record<string, unknown> = {};

    // Copy allowed fields
    const allowedFields = ['title', 'description', 'percentage', 'amount', 'due_date', 'status', 'sort_order'];
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        update[field] = body[field];
      }
    }

    // Handle status transitions for completed_at
    if (body.status !== undefined) {
      if (body.status === 'completed' && existing.status !== 'completed') {
        update.completed_at = new Date().toISOString();
      } else if (body.status !== 'completed' && existing.status === 'completed') {
        update.completed_at = null;
      }
    }

    update.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('pyra_contract_milestones')
      .update(update)
      .eq('id', milestoneId)
      .eq('contract_id', id)
      .select(MILESTONE_FIELDS)
      .single();

    if (error || !data) {
      console.error('Milestone update error:', error);
      return apiServerError();
    }

    // Log activity
    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'update_milestone',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/finance/contracts/${id}`,
      details: { milestone_id: milestoneId, changes: Object.keys(update) },
    }).then();

    return apiSuccess(data);
  } catch {
    return apiServerError();
  }
}

/**
 * DELETE /api/finance/contracts/[id]/milestones/[milestoneId]
 * Delete a milestone (cannot delete if invoiced).
 */
export async function DELETE(
  _req: NextRequest,
  context: RouteContext
) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const { id, milestoneId } = await context.params;
  const supabase = createServiceRoleClient();

  try {
    // Check milestone exists and status
    const { data: existing, error: fetchErr } = await supabase
      .from('pyra_contract_milestones')
      .select('id, status, title')
      .eq('id', milestoneId)
      .eq('contract_id', id)
      .maybeSingle();

    if (fetchErr || !existing) return apiNotFound('المرحلة غير موجودة');

    if (existing.status === 'invoiced') {
      return apiError('لا يمكن حذف مرحلة تم فوترتها', 400);
    }

    const { error } = await supabase
      .from('pyra_contract_milestones')
      .delete()
      .eq('id', milestoneId)
      .eq('contract_id', id);

    if (error) throw error;

    // Log activity
    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'delete_milestone',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/finance/contracts/${id}`,
      details: { milestone_id: milestoneId, title: existing.title },
    }).then();

    return apiSuccess({ deleted: true });
  } catch {
    return apiServerError();
  }
}
