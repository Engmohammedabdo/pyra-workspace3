import { NextRequest } from 'next/server';
import { getExternalAuth, hasPermission } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { EXPENSE_FIELDS } from '@/lib/supabase/fields';
import { dispatchWebhookEvent } from '@/lib/webhooks/dispatcher';

/**
 * GET /api/external/expenses
 * List expenses (paginated) from external source.
 * Auth: API key with 'expenses:read' permission
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getExternalAuth(req);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    if (!hasPermission(ctx, 'expenses:read')) return apiError('لا تملك صلاحية قراءة المصروفات', 403);

    const supabase = createServiceRoleClient();
    const sp = req.nextUrl.searchParams;

    const category_id = sp.get('category_id')?.trim() || '';
    const vendor = sp.get('vendor')?.trim() || '';
    const project_id = sp.get('project_id')?.trim() || '';
    const from = sp.get('from')?.trim() || '';
    const to = sp.get('to')?.trim() || '';
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') || '20')));
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('pyra_expenses')
      .select(EXPENSE_FIELDS, { count: 'exact' });

    if (category_id) {
      query = query.eq('category_id', category_id);
    }
    if (vendor) {
      query = query.ilike('vendor', `%${vendor}%`);
    }
    if (project_id) {
      query = query.eq('project_id', project_id);
    }
    if (from) {
      query = query.gte('expense_date', from);
    }
    if (to) {
      query = query.lte('expense_date', to);
    }

    query = query.order('expense_date', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data: expenses, count, error } = await query;

    if (error) throw error;

    return apiSuccess(expenses || [], { total: count ?? 0, page, pageSize });
  } catch {
    return apiServerError();
  }
}

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
      category_id: rawCategoryId,
      vendor,
      expense_date,
      payment_method,
      vat_rate: rawVatRate,
      vat_amount: rawVatAmount,
      notes,
      project_id,
      subscription_id,
      source,
    } = body;

    // Validation
    if (!description || !description.trim()) {
      return apiError('الوصف مطلوب', 422);
    }
    if (!amount || amount <= 0) {
      return apiError('المبلغ مطلوب ويجب أن يكون أكبر من صفر', 422);
    }

    // Resolve category: category_id (direct ID) has priority over category (name search)
    let category_id: string | null = null;
    if (rawCategoryId) {
      // Verify the category_id exists
      const { data: cat } = await supabase
        .from('pyra_expense_categories')
        .select('id')
        .eq('id', rawCategoryId)
        .maybeSingle();
      if (cat) {
        category_id = cat.id;
      }
    } else if (category) {
      // Fallback: match by name (Arabic or English) — sanitize input
      const safeCat = category.replace(/[%_,().\\]/g, '');
      const { data: cat } = await supabase
        .from('pyra_expense_categories')
        .select('id')
        .or(`name.ilike.%${safeCat}%,name_ar.ilike.%${safeCat}%`)
        .limit(1)
        .maybeSingle();
      if (cat) {
        category_id = cat.id;
      }
    }

    // Validate subscription_id if provided
    if (subscription_id) {
      const { data: sub } = await supabase
        .from('pyra_subscriptions')
        .select('id')
        .eq('id', subscription_id)
        .maybeSingle();
      if (!sub) {
        return apiError('معرّف الاشتراك غير صالح', 422);
      }
    }

    const { data, error } = await supabase
      .from('pyra_expenses')
      .insert({
        id: generateId('exp'),
        description: description.trim(),
        amount,
        currency: currency || 'AED',
        vat_rate: (typeof rawVatRate === 'number' && rawVatRate >= 0) ? rawVatRate : 0,
        vat_amount: (typeof rawVatAmount === 'number' && rawVatAmount >= 0) ? rawVatAmount : 0,
        expense_date: expense_date || new Date().toISOString().split('T')[0],
        vendor: vendor || null,
        payment_method: payment_method || null,
        category_id,
        subscription_id: subscription_id || null,
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
    }).then(null, (e: unknown) => console.error('Activity log error:', e));

    dispatchWebhookEvent('expense_created', { expense_id: data.id, description, amount, vendor, source: source || 'api' });

    return apiSuccess(data, undefined, 201);
  } catch {
    return apiServerError();
  }
}
