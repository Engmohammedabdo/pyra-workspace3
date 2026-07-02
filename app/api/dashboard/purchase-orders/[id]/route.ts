import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { PURCHASE_ORDER_FIELDS, PO_ITEM_FIELDS } from '@/lib/supabase/fields';
import { PO_VALID_TRANSITIONS, PO_STATUS, EXPENSE_STATUS } from '@/lib/constants/statuses';

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

// Use centralized valid transitions from constants
const VALID_TRANSITIONS = PO_VALID_TRANSITIONS;

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

    // ── When PO is received, auto-create an expense ──
    if (status === PO_STATUS.RECEIVED) {
      // Fetch PO items for description
      const { data: poItems } = await supabase
        .from('pyra_purchase_order_items')
        .select('description')
        .eq('purchase_order_id', id)
        .order('sort_order', { ascending: true })
        .limit(1);

      const firstItemDesc = poItems?.[0]?.description || '';
      const expenseDesc = `أمر شراء ${data.po_number} — ${firstItemDesc}`.trim();

      const { error: expErr } = await supabase.from('pyra_expenses').insert({
        id: generateId('exp'),
        description: expenseDesc,
        amount: data.total,
        currency: data.currency || 'AED',
        vat_rate: data.tax_rate || 0,
        vat_amount: data.tax_amount || 0,
        supplier_id: data.supplier_id || null,
        project_id: data.project_id || null,
        purchase_order_id: data.id,
        vendor: data.supplier_name || null,
        status: EXPENSE_STATUS.APPROVED,
        expense_date: new Date().toISOString().split('T')[0],
        created_by: auth.pyraUser.username,
      });

      if (expErr) {
        console.error('Auto-create expense error:', expErr);
        // Rollback PO status to previous value
        await supabase
          .from('pyra_purchase_orders')
          .update({ status: existing.status, updated_at: new Date().toISOString() })
          .eq('id', id);
        return apiServerError('فشل في إنشاء المصروف تلقائياً — تم إلغاء تحديث الحالة');
      }
    }

    // Log activity
    void supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'purchase_order_status_changed',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/finance/purchase-orders/${id}`,
      details: { from: existing.status, to: status },
    }).then(({ error: e }) => { if (e) console.error('Activity log error:', e.message); });

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
    if (existing.status !== PO_STATUS.DRAFT) return apiError('يمكن حذف المسودات فقط', 422);

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
    }).then(({ error: e }) => { if (e) console.error('Activity log error:', e.message); });

    return apiSuccess({ message: 'تم حذف أمر الشراء' });
  } catch (e: unknown) {
    return apiServerError(e instanceof Error ? e.message : 'Unknown error');
  }
}
