import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { PURCHASE_ORDER_FIELDS, PO_ITEM_FIELDS } from '@/lib/supabase/fields';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const { data: po, error } = await supabase
      .from('pyra_purchase_orders')
      .select(PURCHASE_ORDER_FIELDS)
      .eq('id', id)
      .single();

    if (error || !po) return apiNotFound();

    const { data: items } = await supabase
      .from('pyra_purchase_order_items')
      .select(PO_ITEM_FIELDS)
      .eq('purchase_order_id', id)
      .order('sort_order', { ascending: true });

    return apiSuccess({ ...po, items: items || [] });
  } catch (e: unknown) {
    return apiServerError(e instanceof Error ? e.message : 'Unknown error');
  }
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['acknowledged', 'cancelled'],
  acknowledged: ['received', 'cancelled'],
  received: ['invoiced'],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const body = await req.json();
    const { status } = body;

    if (!status) return apiError('الحالة مطلوبة', 422);

    // Verify current status and valid transition
    const { data: existing } = await supabase
      .from('pyra_purchase_orders')
      .select('status')
      .eq('id', id)
      .single();

    if (!existing) return apiNotFound();

    const allowed = VALID_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(status)) {
      return apiError(`لا يمكن تغيير الحالة من ${existing.status} إلى ${status}`, 422);
    }

    const { data, error } = await supabase
      .from('pyra_purchase_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(PURCHASE_ORDER_FIELDS)
      .single();

    if (error || !data) return apiServerError(error?.message || 'فشل التحديث');

    // Log activity
    void supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'purchase_order_status_changed',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/finance/purchase-orders/${id}`,
      details: { from: existing.status, to: status },
    });

    return apiSuccess(data);
  } catch (e: unknown) {
    return apiServerError(e instanceof Error ? e.message : 'Unknown error');
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    // Only allow deleting drafts
    const { data: existing } = await supabase
      .from('pyra_purchase_orders')
      .select('status')
      .eq('id', id)
      .single();

    if (!existing) return apiNotFound();
    if (existing.status !== 'draft') return apiError('يمكن حذف المسودات فقط', 422);

    // Items will be cascade-deleted
    const { error } = await supabase
      .from('pyra_purchase_orders')
      .delete()
      .eq('id', id);

    if (error) return apiServerError(error.message);

    void supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'purchase_order_deleted',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: '/dashboard/finance/purchase-orders',
      details: {},
    });

    return apiSuccess({ message: 'تم حذف أمر الشراء' });
  } catch (e: unknown) {
    return apiServerError(e instanceof Error ? e.message : 'Unknown error');
  }
}
