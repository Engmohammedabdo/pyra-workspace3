import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { SUPPLIER_FIELDS } from '@/lib/supabase/fields';
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';

export async function GET(req: NextRequest) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();
  const url = req.nextUrl.searchParams;
  const page = parseInt(url.get('page') || '1');
  const limit = parseInt(url.get('limit') || '20');
  const search = url.get('search') || '';
  const active = url.get('active') || '';

  try {
    let query = supabase
      .from('pyra_suppliers')
      .select(SUPPLIER_FIELDS, { count: 'exact' });

    if (search) {
      const safe = `%${escapeLike(search)}%`;
      query = query.or(
        `name.ilike.${escapePostgrestValue(safe)},company.ilike.${escapePostgrestValue(safe)},email.ilike.${escapePostgrestValue(safe)}`
      );
    }
    if (active === 'true') query = query.eq('is_active', true);
    if (active === 'false') query = query.eq('is_active', false);

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
    const { name, company, email, phone, address, tax_number, payment_terms_days, currency, bank_name, bank_account, bank_iban, notes } = body;

    if (!name?.trim()) return apiValidationError('اسم المورد مطلوب');

    const id = generateId('sup');
    const { data, error } = await supabase
      .from('pyra_suppliers')
      .insert({
        id,
        name: name.trim(),
        company: company || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        tax_number: tax_number || null,
        payment_terms_days: payment_terms_days || 30,
        currency: currency || 'AED',
        bank_name: bank_name || null,
        bank_account: bank_account || null,
        bank_iban: bank_iban || null,
        notes: notes || null,
        is_active: true,
        created_by: auth.pyraUser.username,
      })
      .select(SUPPLIER_FIELDS)
      .single();

    if (error) return apiServerError(error.message);

    // Log activity (fire-and-forget)
    void supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'supplier_created',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/finance/suppliers/${id}`,
      details: { name: name.trim() },
    }).then(({ error: e }) => { if (e) console.error('Activity log error:', e.message); });

    return apiSuccess(data);
  } catch (e: unknown) {
    return apiServerError(e instanceof Error ? e.message : 'Unknown error');
  }
}
