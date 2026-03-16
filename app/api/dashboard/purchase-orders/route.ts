import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { PURCHASE_ORDER_FIELDS } from '@/lib/supabase/fields';
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';

// Generate next PO number
async function generateNextPONumber(supabase: ReturnType<typeof createServiceRoleClient>): Promise<string> {
  const { data: prefixSetting } = await supabase
    .from('pyra_settings')
    .select('value')
    .eq('key', 'po_prefix')
    .maybeSingle();
  const prefix = prefixSetting?.value || 'PO';

  const { data: allPOs } = await supabase
    .from('pyra_purchase_orders')
    .select('po_number')
    .like('po_number', `${prefix}-%`);

  let maxNum = 0;
  for (const po of allPOs || []) {
    const match = po.po_number.match(/(\d+)$/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
  }

  return `${prefix}-${String(maxNum + 1).padStart(4, '0')}`;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();
  const url = req.nextUrl.searchParams;
  const page = parseInt(url.get('page') || '1');
  const limit = parseInt(url.get('limit') || '20');
  const search = url.get('search') || '';
  const status = url.get('status') || '';
  const supplierId = url.get('supplier_id') || '';

  try {
    let query = supabase
      .from('pyra_purchase_orders')
      .select(PURCHASE_ORDER_FIELDS, { count: 'exact' });

    if (search) {
      const safe = `%${escapeLike(search)}%`;
      query = query.or(
        `po_number.ilike.${escapePostgrestValue(safe)},supplier_name.ilike.${escapePostgrestValue(safe)}`
      );
    }
    if (status) query = query.eq('status', status);
    if (supplierId) query = query.eq('supplier_id', supplierId);

    const from = (page - 1) * limit;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (error) return apiServerError(error.message);

    return apiSuccess(data, { total: count || 0, page, limit });
  } catch (e: unknown) {
    return apiServerError(e instanceof Error ? e.message : 'Unknown error');
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();

  try {
    const body = await req.json();
    const {
      supplier_id, project_id, issue_date, expected_delivery_date,
      notes, vat_rate, items,
    } = body;

    if (!items || items.length === 0) return apiValidationError('يجب إضافة بند واحد على الأقل');
    if (!issue_date) return apiValidationError('تاريخ الإصدار مطلوب');

    // Look up supplier details
    let supplierName: string | null = null;
    let supplierCompany: string | null = null;
    let supplierEmail: string | null = null;
    let currency = 'AED';

    if (supplier_id) {
      const { data: sup } = await supabase
        .from('pyra_suppliers')
        .select('name, company, email, currency')
        .eq('id', supplier_id)
        .single();
      if (sup) {
        supplierName = sup.name;
        supplierCompany = sup.company;
        supplierEmail = sup.email;
        currency = sup.currency || 'AED';
      }
    }

    // Calculate totals
    const subtotal = items.reduce((sum: number, it: { quantity: number; rate: number }) => sum + (it.quantity * it.rate), 0);
    const taxRate = vat_rate ?? 0;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    const poNumber = await generateNextPONumber(supabase);
    const poId = generateId('po');

    const { error: poError } = await supabase
      .from('pyra_purchase_orders')
      .insert({
        id: poId,
        po_number: poNumber,
        supplier_id: supplier_id || null,
        project_id: project_id || null,
        status: 'draft',
        issue_date,
        expected_delivery_date: expected_delivery_date || null,
        currency,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        notes: notes || null,
        supplier_name: supplierName,
        supplier_company: supplierCompany,
        supplier_email: supplierEmail,
        created_by: auth.userId,
      });

    if (poError) return apiServerError(poError.message);

    // Insert items
    const itemRows = items.map((it: { description: string; quantity: number; rate: number }, i: number) => ({
      id: generateId('poi'),
      purchase_order_id: poId,
      description: it.description.trim(),
      quantity: it.quantity,
      rate: it.rate,
      amount: it.quantity * it.rate,
      sort_order: i,
    }));

    const { error: itemsError } = await supabase
      .from('pyra_purchase_order_items')
      .insert(itemRows);

    if (itemsError) {
      // Rollback PO
      await supabase.from('pyra_purchase_orders').delete().eq('id', poId);
      return apiServerError(itemsError.message);
    }

    // Log activity
    void supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'purchase_order_created',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/finance/purchase-orders/${poId}`,
      details: { po_number: poNumber, supplier_name: supplierName, total },
    });

    return apiSuccess({ id: poId, po_number: poNumber });
  } catch (e: unknown) {
    return apiServerError(e instanceof Error ? e.message : 'Unknown error');
  }
}
