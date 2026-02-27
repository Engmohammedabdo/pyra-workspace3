import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiError, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { EXPENSE_FIELDS } from '@/lib/supabase/fields';
import { dispatchWebhookEvent } from '@/lib/webhooks/dispatcher';
import { toAED } from '@/lib/utils/currency';

export async function GET(req: NextRequest) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const supabase = createServiceRoleClient();
  const url = req.nextUrl.searchParams;
  const page = parseInt(url.get('page') || '1');
  const pageSize = parseInt(url.get('pageSize') || '20');
  const search = url.get('search') || '';
  const category = url.get('category') || '';
  const projectId = url.get('project_id') || '';
  const from = url.get('from') || '';
  const to = url.get('to') || '';

  try {
    let query = supabase
      .from('pyra_expenses')
      .select(EXPENSE_FIELDS, { count: 'exact' });

    if (search) {
      query = query.or(`description.ilike.%${search}%,vendor.ilike.%${search}%`);
    }
    if (category) {
      query = query.eq('category_id', category);
    }
    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    if (from) {
      query = query.gte('expense_date', from);
    }
    if (to) {
      query = query.lte('expense_date', to);
    }

    const { data, error, count } = await query
      .order('expense_date', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (error) throw error;

    // get category info for each expense
    const categoryIds = [...new Set((data || []).map((e: { category_id: string | null }) => e.category_id).filter(Boolean))];
    let categories: Record<string, { name: string; name_ar: string; color: string }> = {};
    if (categoryIds.length > 0) {
      const { data: cats } = await supabase
        .from('pyra_expense_categories')
        .select('id, name, name_ar, color')
        .in('id', categoryIds);
      if (cats) {
        categories = Object.fromEntries(cats.map((c: { id: string; name: string; name_ar: string; color: string }) => [c.id, c]));
      }
    }

    // get project info for each expense
    const projectIds = [...new Set((data || []).map((e: { project_id: string | null }) => e.project_id).filter(Boolean))];
    let projects: Record<string, { name: string }> = {};
    if (projectIds.length > 0) {
      const { data: projs } = await supabase
        .from('pyra_projects')
        .select('id, name')
        .in('id', projectIds);
      if (projs) {
        projects = Object.fromEntries(projs.map((p: { id: string; name: string }) => [p.id, p]));
      }
    }

    const enriched = (data || []).map((e: Record<string, unknown>) => ({
      ...e,
      category_name: e.category_id ? categories[e.category_id as string]?.name : null,
      category_name_ar: e.category_id ? categories[e.category_id as string]?.name_ar : null,
      category_color: e.category_id ? categories[e.category_id as string]?.color : null,
      project_name: e.project_id ? projects[e.project_id as string]?.name : null,
    }));

    // Calculate summary from a separate query (same filters as main query)
    let summaryQuery = supabase
      .from('pyra_expenses')
      .select('amount, vat_amount, currency');
    if (search) summaryQuery = summaryQuery.or(`description.ilike.%${search}%,vendor.ilike.%${search}%`);
    if (category) summaryQuery = summaryQuery.eq('category_id', category);
    if (projectId) summaryQuery = summaryQuery.eq('project_id', projectId);
    if (from) summaryQuery = summaryQuery.gte('expense_date', from);
    if (to) summaryQuery = summaryQuery.lte('expense_date', to);
    const { data: allExpenses } = await summaryQuery;

    const totalAmount = (allExpenses || []).reduce((sum: number, e: { amount: number; currency: string }) => sum + toAED(Number(e.amount), e.currency), 0);
    const totalVat = (allExpenses || []).reduce((sum: number, e: { vat_amount: number; currency: string }) => sum + toAED(Number(e.vat_amount), e.currency), 0);

    return apiSuccess(enriched, {
      total: count ?? 0,
      page,
      pageSize,
      hasMore: (count ?? 0) > page * pageSize,
      summary: {
        total_amount: totalAmount,
        total_vat: totalVat,
        total_count: count ?? 0,
      },
    });
  } catch {
    return apiServerError();
  }
}

export async function POST(req: NextRequest) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const supabase = createServiceRoleClient();

  try {
    const body = await req.json();
    const { description, amount, currency, vat_rate, expense_date, vendor, payment_method, category_id, project_id, receipt_url, notes, is_recurring, recurring_period } = body;

    if (!amount || amount <= 0) return apiError('المبلغ مطلوب', 422);

    const vat_amount = vat_rate ? (amount * vat_rate / 100) : 0;

    const { data, error } = await supabase
      .from('pyra_expenses')
      .insert({
        id: generateId('exp'),
        description,
        amount,
        currency: currency || 'AED',
        vat_rate: vat_rate || 0,
        vat_amount,
        expense_date,
        vendor,
        payment_method,
        category_id: category_id || null,
        project_id: project_id || null,
        receipt_url,
        notes,
        is_recurring: is_recurring || false,
        recurring_period,
        created_by: admin.pyraUser.username,
      })
      .select(EXPENSE_FIELDS)
      .single();

    if (error) throw error;

    // Activity log
    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'create_expense',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/finance/expenses/${data.id}`,
      details: { description, amount, vendor },
    }).then(null, (e: unknown) => console.error('Activity log error:', e));

    dispatchWebhookEvent('expense_created', { expense_id: data.id, description, amount, vendor });

    return apiSuccess(data, undefined, 201);
  } catch {
    return apiServerError();
  }
}
