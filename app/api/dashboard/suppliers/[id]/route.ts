import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { SUPPLIER_FIELDS } from '@/lib/supabase/fields';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const { data, error } = await supabase
      .from('pyra_suppliers')
      .select(SUPPLIER_FIELDS)
      .eq('id', id)
      .single();

    if (error || !data) return apiNotFound();
    return apiSuccess(data);
  } catch (e: unknown) {
    return apiServerError(e instanceof Error ? e.message : 'Unknown error');
  }
}

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
    const allowedFields = [
      'name', 'company', 'email', 'phone', 'address', 'tax_number',
      'payment_terms_days', 'currency', 'bank_name', 'bank_account',
      'bank_iban', 'notes', 'is_active',
    ];

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowedFields) {
      if (key in body) updates[key] = body[key];
    }

    const { data, error } = await supabase
      .from('pyra_suppliers')
      .update(updates)
      .eq('id', id)
      .select(SUPPLIER_FIELDS)
      .single();

    if (error || !data) return apiNotFound();

    // Log activity (fire-and-forget)
    void supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'supplier_updated',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/finance/suppliers/${id}`,
      details: { updated: Object.keys(updates).filter(k => k !== 'updated_at') },
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
    // Check if supplier has linked expenses
    const { count } = await supabase
      .from('pyra_expenses')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', id);

    if (count && count > 0) {
      // Soft delete — deactivate instead
      const { error } = await supabase
        .from('pyra_suppliers')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return apiServerError(error.message);
      return apiSuccess({ message: 'تم إلغاء تفعيل المورد (مرتبط بمصروفات)' });
    }

    const { error } = await supabase
      .from('pyra_suppliers')
      .delete()
      .eq('id', id);

    if (error) return apiServerError(error.message);

    // Log activity (fire-and-forget)
    void supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'supplier_deleted',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: '/dashboard/finance/suppliers',
      details: {},
    });

    return apiSuccess({ message: 'تم حذف المورد' });
  } catch (e: unknown) {
    return apiServerError(e instanceof Error ? e.message : 'Unknown error');
  }
}
