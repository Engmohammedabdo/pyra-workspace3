import { NextRequest } from 'next/server';
import { getExternalAuth, hasPermission } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { EXPENSE_FIELDS } from '@/lib/supabase/fields';

/**
 * POST /api/external/expenses
 * Create an expense from an external source (n8n, Telegram bot, etc.)
 * Auth: API key with 'expenses:create' permission
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getExternalAuth(req);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    if (!hasPermission(ctx, 'expenses:create')) return apiError('لا تملك صلاحية إنشاء المصروفات', 403);

    const supabase = createServiceRoleClient();
    const body = await req.json();

    const {
      description,
      amount,
      currency,
      category,
      vendor,
      expense_date,
      payment_method,
      notes,
      project_id,
      source,
    } = body;

    // Validation
    if (!description || !description.trim()) {
      return apiError('الوصف مطلوب', 422);
    }
    if (!amount || amount <= 0) {
      return apiError('المبلغ مطلوب ويجب أن يكون أكبر من صفر', 422);
    }

    // Try to match category name to existing category
    let category_id: string | null = null;
    if (category) {
      const { data: cat } = await supabase
        .from('pyra_expense_categories')
        .select('id')
        .or(`name.ilike.${category},name_ar.ilike.${category}`)
        .limit(1)
        .maybeSingle();

      if (cat) {
        category_id = cat.id;
      }
    }

    const { data, error } = await supabase
      .from('pyra_expenses')
      .insert({
        id: generateId('exp'),
        description: description.trim(),
        amount,
        currency: currency || 'AED',
        vat_rate: 0,
        vat_amount: 0,
        expense_date: expense_date || new Date().toISOString().split('T')[0],
        vendor: vendor || null,
        payment_method: payment_method || null,
        category_id,
        project_id: project_id || null,
        notes: notes ? `${notes}${source ? ` [${source}]` : ''}` : (source ? `[${source}]` : null),
        created_by: 'api',
      })
      .select(EXPENSE_FIELDS)
      .single();

    if (error) throw error;

    // Activity log
    supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'create_expense',
      username: 'api',
      display_name: ctx.apiKey.name,
      target_path: `/finance/expenses/${data.id}`,
      details: { description, amount, vendor, source: source || 'api' },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    }).then();

    return apiSuccess(data, undefined, 201);
  } catch {
    return apiServerError();
  }
}
