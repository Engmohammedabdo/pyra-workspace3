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

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/finance/contracts/[id]/milestones
 * List milestones for a contract.
 */
export async function GET(
  _req: NextRequest,
  context: RouteContext
) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const { id } = await context.params;
  const supabase = createServiceRoleClient();

  try {
    // Verify contract exists
    const { data: contract, error: cErr } = await supabase
      .from('pyra_contracts')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (cErr || !contract) return apiNotFound('العقد غير موجود');

    const { data, error } = await supabase
      .from('pyra_contract_milestones')
      .select(MILESTONE_FIELDS)
      .eq('contract_id', id)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Milestones list error:', error);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch {
    return apiServerError();
  }
}

/**
 * POST /api/finance/contracts/[id]/milestones
 * Create a new milestone for a contract.
 *
 * Body: { title, description?, percentage, amount?, due_date?, sort_order? }
 */
export async function POST(
  req: NextRequest,
  context: RouteContext
) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const { id } = await context.params;
  const supabase = createServiceRoleClient();

  try {
    // Fetch contract to get total_value
    const { data: contract, error: cErr } = await supabase
      .from('pyra_contracts')
      .select('id, title, total_value')
      .eq('id', id)
      .maybeSingle();

    if (cErr || !contract) return apiNotFound('العقد غير موجود');

    const body = await req.json();
    const { title, description, percentage, amount, due_date, sort_order } = body;

    if (!title) return apiError('عنوان المرحلة مطلوب', 422);
    if (percentage == null || percentage <= 0) return apiError('نسبة المرحلة مطلوبة', 422);

    // Calculate amount from contract total_value * percentage / 100 if not provided
    const calculatedAmount =
      amount != null && amount > 0
        ? Number(amount)
        : (contract.total_value || 0) * (Number(percentage) / 100);

    // Determine next sort_order if not provided
    let finalSortOrder = sort_order;
    if (finalSortOrder == null) {
      const { data: lastMilestone } = await supabase
        .from('pyra_contract_milestones')
        .select('sort_order')
        .eq('contract_id', id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      finalSortOrder = (lastMilestone?.sort_order ?? 0) + 1;
    }

    const milestoneId = generateId('cm');

    const { data, error } = await supabase
      .from('pyra_contract_milestones')
      .insert({
        id: milestoneId,
        contract_id: id,
        title: title.trim(),
        description: description?.trim() || null,
        percentage: Number(percentage),
        amount: calculatedAmount,
        due_date: due_date || null,
        status: 'pending',
        invoice_id: null,
        sort_order: finalSortOrder,
        completed_at: null,
      })
      .select(MILESTONE_FIELDS)
      .single();

    if (error) {
      console.error('Milestone insert error:', error);
      return apiServerError();
    }

    // Log activity
    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'create_milestone',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/finance/contracts/${id}`,
      details: { milestone_id: milestoneId, title, percentage, amount: calculatedAmount },
    }).then(null, (e: unknown) => console.error('Activity log error:', e));

    return apiSuccess(data, undefined, 201);
  } catch {
    return apiServerError();
  }
}
