import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { EXPENSE_FIELDS } from '@/lib/supabase/fields';
import { dispatchWebhookEvent } from '@/lib/webhooks/dispatcher';
import { toAED } from '@/lib/utils/currency';
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';
import { resolveUserScope } from '@/lib/auth/scope';
import { logActivity } from '@/lib/api/activity';

export async function GET(req: NextRequest) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const scope = await resolveUserScope(auth);

  const supabase = createServiceRoleClient();
  const url = req.nextUrl.searchParams;
  const page = parseInt(url.get('page') || '1');
  const pageSize = parseInt(url.get('pageSize') || '20');
  const search = url.get('search') || '';
  const category = url.get('category') || '';
  const projectId = url.get('project_id') || '';
  const from = url.get('from') || '';
  const to = url.get('to') || '';
  const status = url.get('status') || '';

  try {
    let query = supabase
      .from('pyra_expenses')
      .select(EXPENSE_FIELDS, { count: 'exact' });

    if (search) {
      const safeSearch = `%${escapeLike(search)}%`;
      query = query.or(`description.ilike.${escapePostgrestValue(safeSearch)},vendor.ilike.${escapePostgrestValue(safeSearch)}`);
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
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    // Scope filtering for non-admins
    if (!scope.isAdmin) {
      if (scope.projectIds.length === 0) return apiSuccess([], { total: 0, page, pageSize, hasMore: false, summary: { total_amount: 0, total_vat: 0, total_count: 0 } });
      query = query.in('project_id', scope.projectIds);
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

    // get supplier info for each expense
    const supplierIds = [...new Set((data || []).map((e: { supplier_id: string | null }) => e.supplier_id).filter(Boolean))];
    let suppliers: Record<string, { name: string; company: string | null }> = {};
    if (supplierIds.length > 0) {
      const { data: sups } = await supabase
        .from('pyra_suppliers')
        .select('id, name, company')
        .in('id', supplierIds);
      if (sups) {
        suppliers = Object.fromEntries(sups.map((s: { id: string; name: string; company: string | null }) => [s.id, s]));
      }
    }

    const enriched = (data || []).map((e: Record<string, unknown>) => ({
      ...e,
      category_name: e.category_id ? categories[e.category_id as string]?.name : null,
      category_name_ar: e.category_id ? categories[e.category_id as string]?.name_ar : null,
      category_color: e.category_id ? categories[e.category_id as string]?.color : null,
      project_name: e.project_id ? projects[e.project_id as string]?.name : null,
      supplier_name: e.supplier_id ? suppliers[e.supplier_id as string]?.name : null,
      supplier_company: e.supplier_id ? suppliers[e.supplier_id as string]?.company : null,
    }));

    // Calculate summary from a separate query (same filters as main query)
    let summaryQuery = supabase
      .from('pyra_expenses')
      .select('amount, vat_amount, currency');
    if (search) { const ss = `%${escapeLike(search)}%`; summaryQuery = summaryQuery.or(`description.ilike.${escapePostgrestValue(ss)},vendor.ilike.${escapePostgrestValue(ss)}`); }
    if (category) summaryQuery = summaryQuery.eq('category_id', category);
    if (projectId) summaryQuery = summaryQuery.eq('project_id', projectId);
    if (from) summaryQuery = summaryQuery.gte('expense_date', from);
    if (to) summaryQuery = summaryQuery.lte('expense_date', to);
    if (!scope.isAdmin) summaryQuery = summaryQuery.in('project_id', scope.projectIds);
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
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const scope = await resolveUserScope(auth);
  const supabase = createServiceRoleClient();

  try {
    const body = await req.json();
    const { description, amount, currency, vat_rate, expense_date, vendor, payment_method, category_id, project_id, supplier_id, receipt_url, notes, is_recurring, recurring_period } = body;

    if (!amount || amount <= 0) return apiError('المبلغ مطلوب', 422);

    // Scope check: non-admins can only create expenses for their projects
    if (!scope.isAdmin && project_id && !scope.projectIds.includes(project_id)) {
      return apiForbidden('لا تملك صلاحية إنشاء مصروف لهذا المشروع');
    }

    const vat_amount = vat_rate ? (amount * vat_rate / 100) : 0;

    // Check if expense approval is required from settings
    const { data: approvalSetting } = await supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', 'expense_approval_required')
      .maybeSingle();

    const approvalRequired = approvalSetting?.value === 'true';
    const expenseStatus = approvalRequired ? 'pending' : 'approved';

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
        supplier_id: supplier_id || null,
        receipt_url,
        notes,
        is_recurring: is_recurring || false,
        recurring_period,
        status: expenseStatus,
        submitted_by: approvalRequired ? auth.pyraUser.username : null,
        created_by: auth.pyraUser.username,
      })
      .select(EXPENSE_FIELDS)
      .single();

    if (error) throw error;

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'expense_created',
      `/dashboard/finance/expenses/${data.id}`,
      { description, amount, vendor },
      req.headers.get('x-forwarded-for') || undefined,
    );

    dispatchWebhookEvent('expense_created', { expense_id: data.id, description, amount, vendor });

    return apiSuccess(data, undefined, 201);
  } catch {
    return apiServerError();
  }
}
