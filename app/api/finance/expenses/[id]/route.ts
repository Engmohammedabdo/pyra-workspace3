import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
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

    // Allowlist fields to prevent mass assignment
    const allowedFields = [
      'description', 'amount', 'currency', 'vat_rate', 'vat_amount',
      'expense_date', 'vendor', 'payment_method', 'receipt_url', 'notes',
      'category_id', 'project_id', 'subscription_id', 'is_recurring', 'recurring_period',
    ];
    const update: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) update[field] = body[field];
    }

    // Recalculate VAT if rate or amount changed
    if (update.vat_rate !== undefined || update.amount !== undefined) {
      const { data: existing } = await supabase
        .from('pyra_expenses')
        .select('amount, vat_rate')
        .eq('id', id)
        .single();
      if (existing) {
        const amount = (update.amount as number) ?? existing.amount;
        const vat_rate = (update.vat_rate as number) ?? existing.vat_rate;
        update.vat_amount = amount * vat_rate / 100;
      }
    }

    update.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('pyra_expenses')
      .update(update)
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
      id: generateId('al'),
      action_type: 'delete_expense',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/finance/expenses/${id}`,
      details: { expense_id: id },
    }).then();

    return apiSuccess({ deleted: true });
  } catch {
    return apiServerError();
  }
}
