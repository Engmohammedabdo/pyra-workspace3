import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

const CYCLE_ARABIC: Record<string, string> = {
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
  yearly: 'سنوي',
  weekly: 'أسبوعي',
};

/**
 * POST /api/finance/subscriptions/[id]/approve-renewal
 * Admin approves a subscription renewal:
 * 1. Creates an expense record
 * 2. Advances the next_renewal_date
 * 3. Logs the activity
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  // Admin can override the actual cost (since subscription costs vary month-to-month)
  const actualCost = body.actual_cost != null ? parseFloat(body.actual_cost) : null;
  const notes = body.notes?.trim() || null;
  const supabase = createServiceRoleClient();

  try {
    // Fetch the subscription
    const { data: sub, error } = await supabase
      .from('pyra_subscriptions')
      .select('id, name, provider, cost, currency, billing_cycle, next_renewal_date, status, auto_renew')
      .eq('id', id)
      .single();

    if (error || !sub) return apiNotFound('الاشتراك غير موجود');
    if (sub.status !== 'active') return apiError('الاشتراك غير نشط');

    // Check if expense already exists for this renewal date (prevent duplicates)
    const { data: existingExpense } = await supabase
      .from('pyra_expenses')
      .select('id')
      .eq('subscription_id', sub.id)
      .eq('expense_date', sub.next_renewal_date)
      .maybeSingle();

    if (existingExpense) {
      return apiError('تم تسجيل مصروف لهذا التجديد مسبقاً');
    }

    // 1. Create expense — use actual_cost if provided (costs can vary), fall back to sub.cost
    const expenseCost = (actualCost != null && !isNaN(actualCost) && actualCost > 0) ? actualCost : sub.cost;
    const cycleName = CYCLE_ARABIC[sub.billing_cycle || 'monthly'] || 'شهري';
    const expenseId = generateId('exp');
    await supabase.from('pyra_expenses').insert({
      id: expenseId,
      description: `${sub.name} — تجديد ${cycleName}${notes ? ` (${notes})` : ''}`,
      amount: expenseCost,
      currency: sub.currency,
      subscription_id: sub.id,
      category_id: 'ec_subscriptions',
      vendor: sub.provider,
      status: 'approved',
      expense_date: sub.next_renewal_date,
      created_by: auth.pyraUser.username,
    });

    // 2. Advance next_renewal_date
    const nextDate = calculateNextRenewalDate(sub.next_renewal_date, sub.billing_cycle || 'monthly');
    await supabase
      .from('pyra_subscriptions')
      .update({
        next_renewal_date: nextDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sub.id);

    // 3. Log activity
    void supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'subscription_renewal_approved',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/finance/subscriptions`,
      details: {
        subscription_name: sub.name,
        provider: sub.provider,
        cost: expenseCost,
        original_cost: sub.cost,
        currency: sub.currency,
        renewal_date: sub.next_renewal_date,
        next_date: nextDate,
        expense_id: expenseId,
        notes,
      },
      ip_address: 'system',
    });

    return apiSuccess({
      message: `تم الموافقة على تجديد "${sub.name}" وتسجيل المصروف`,
      expense_id: expenseId,
      next_renewal_date: nextDate,
    });
  } catch (err) {
    console.error('POST /api/finance/subscriptions/[id]/approve-renewal error:', err);
    return apiServerError();
  }
}

function calculateNextRenewalDate(currentDate: string, billingCycle: string): string {
  const date = new Date(currentDate);
  const day = date.getDate();

  switch (billingCycle) {
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }

  if (date.getDate() !== day && billingCycle !== 'weekly') {
    date.setDate(0);
  }

  return date.toISOString().split('T')[0];
}
