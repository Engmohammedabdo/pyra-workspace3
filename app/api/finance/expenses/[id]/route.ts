import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { EXPENSE_FIELDS } from '@/lib/supabase/fields';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const { data, error } = await supabase
      .from('pyra_expenses')
      .select(EXPENSE_FIELDS)
      .eq('id', id)
      .single();

    if (error || !data) return apiNotFound();
    return apiSuccess(data);
  } catch {
    return apiServerError();
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const body = await req.json();
    // Recalculate VAT if rate or amount changed
    if (body.vat_rate !== undefined || body.amount !== undefined) {
      const { data: existing } = await supabase
        .from('pyra_expenses')
        .select('amount, vat_rate')
        .eq('id', id)
        .single();
      if (existing) {
        const amount = body.amount ?? existing.amount;
        const vat_rate = body.vat_rate ?? existing.vat_rate;
        body.vat_amount = amount * vat_rate / 100;
      }
    }

    body.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('pyra_expenses')
      .update(body)
      .eq('id', id)
      .select(EXPENSE_FIELDS)
      .single();

    if (error || !data) return apiNotFound();
    return apiSuccess(data);
  } catch {
    return apiServerError();
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const { id } = await params;
  const supabase = createServiceRoleClient();

  try {
    const { error } = await supabase
      .from('pyra_expenses')
      .delete()
      .eq('id', id);

    if (error) throw error;

    supabase.from('pyra_activity_log').insert({
      id: `al_${Date.now()}`,
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      action: 'delete_expense',
      target_type: 'expense',
      target_id: id,
    }).then();

    return apiSuccess({ deleted: true });
  } catch {
    return apiServerError();
  }
}
