import { NextRequest } from 'next/server';
import { getExternalAuth, hasPermission } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { generateNextQuoteNumber } from '@/lib/utils/quote-number';
import { QUOTE_FIELDS } from '@/lib/supabase/fields';
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';
import { QUOTE_STATUS } from '@/lib/constants/statuses';
import { logActivity } from '@/lib/api/activity';

/**
 * GET /api/external/quotes
 * List quotes (paginated) from external source.
 * Auth: API key with 'quotes:read' permission
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getExternalAuth(req);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    if (!hasPermission(ctx, 'quotes:read')) return apiError('لا تملك صلاحية قراءة عروض الأسعار', 403);

    const supabase = createServiceRoleClient();
    const sp = req.nextUrl.searchParams;

    const status = sp.get('status')?.trim() || '';
    const clientId = sp.get('client_id')?.trim() || '';
    const search = sp.get('search')?.trim() || '';
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') || '20')));
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('pyra_quotes')
      .select(QUOTE_FIELDS, { count: 'exact' });

    if (status && status !== 'all') query = query.eq('status', status);
    if (clientId) query = query.eq('client_id', clientId);
    if (search) {
      const escaped = escapePostgrestValue(`%${escapeLike(search)}%`);
      query = query.or(
        `quote_number.ilike.${escaped},client_name.ilike.${escaped},client_company.ilike.${escaped},project_name.ilike.${escaped}`
      );
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;
    if (error) {
      console.error('External quotes list error:', error);
      return apiServerError();
    }

    
    logActivity('external_api', 'External API', 'external_quote_created', '/dashboard/quotes', {});

return apiSuccess(data || [], { total: count ?? 0, page, pageSize });
  } catch (err) {
    console.error('GET /api/external/quotes error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/external/quotes
 * Create a quote from external source (n8n, Telegram Bot).
 * Auth: API key with 'quotes:create' permission
 *
 * Body: {
 *   client_company: string (auto-resolved to client_id),
 *   project_name?, items: [{ description, quantity, rate }],
 *   currency?, vat_rate?, notes?, terms_conditions?
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getExternalAuth(req);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    if (!hasPermission(ctx, 'quotes:create')) return apiError('لا تملك صلاحية إنشاء عروض أسعار', 403);

    const body = await req.json();
    const { client_company, client_id: bodyClientId, project_name, items, currency, vat_rate, notes, terms_conditions } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return apiError('يجب إضافة عنصر واحد على الأقل', 400);
    }

    const supabase = createServiceRoleClient();

    // Resolve client
    let resolvedClientId = bodyClientId || null;
    let clientData: Record<string, string | null> = {
      client_name: null,
      client_email: null,
      client_company: client_company || null,
      client_phone: null,
      client_address: null,
    };

    if (!resolvedClientId && client_company) {
      const escaped = escapePostgrestValue(`%${escapeLike(client_company)}%`);
      const { data: matched } = await supabase
        .from('pyra_clients')
        .select('id, name, email, phone, company')
        .or(`company.ilike.${escaped},name.ilike.${escaped}`)
        .limit(1)
        .maybeSingle();

      if (matched) {
        resolvedClientId = matched.id;
        clientData = {
          client_name: matched.name,
          client_email: matched.email,
          client_phone: matched.phone,
          client_company: matched.company,
          client_address: null,
        };
      }
    } else if (resolvedClientId) {
      const { data: client } = await supabase
        .from('pyra_clients')
        .select('name, email, phone, company')
        .eq('id', resolvedClientId)
        .maybeSingle();

      if (client) {
        clientData = {
          client_name: client.name,
          client_email: client.email,
          client_phone: client.phone,
          client_company: client.company,
          client_address: null,
        };
      }
    }

    // Calculate totals
    const subtotal = items.reduce(
      (sum: number, item: { quantity: number; rate: number }) =>
        sum + (item.quantity || 0) * (item.rate || 0),
      0
    );

    // Get VAT rate
    const { data: vatSetting } = await supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', 'vat_rate')
      .maybeSingle();

    const taxRate = vat_rate != null ? parseFloat(vat_rate) : parseFloat(vatSetting?.value || '5');
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    // Get company + bank info
    const { data: settings } = await supabase
      .from('pyra_settings')
      .select('key, value')
      .in('key', ['company_name', 'company_logo', 'bank_name', 'bank_account_name', 'bank_account_no', 'bank_iban', 'quote_expiry_days']);

    const settingsMap: Record<string, string> = {};
    for (const s of settings || []) settingsMap[s.key] = s.value;

    const expiryDays = parseInt(settingsMap.quote_expiry_days || '30');
    const estDate = new Date().toISOString().split('T')[0];
    const expDate = new Date(Date.now() + expiryDays * 86400000).toISOString().split('T')[0];

    const quoteId = generateId('qt');
    const quoteNumber = await generateNextQuoteNumber(supabase);

    const { data: quote, error: insertError } = await supabase
      .from('pyra_quotes')
      .insert({
        id: quoteId,
        quote_number: quoteNumber,
        client_id: resolvedClientId,
        project_name: project_name?.trim() || null,
        status: QUOTE_STATUS.DRAFT,
        estimate_date: estDate,
        expiry_date: expDate,
        currency: currency || 'AED',
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        notes: notes?.trim() || null,
        terms_conditions: terms_conditions || [],
        bank_details: {
          bank: settingsMap.bank_name || '',
          account_name: settingsMap.bank_account_name || '',
          account_no: settingsMap.bank_account_no || '',
          iban: settingsMap.bank_iban || '',
        },
        company_name: settingsMap.company_name || null,
        company_logo: settingsMap.company_logo || null,
        ...clientData,
        created_by: ctx.apiKey.created_by || 'external',
      })
      .select(QUOTE_FIELDS)
      .single();

    if (insertError) {
      console.error('External quote insert error:', insertError);
      return apiServerError();
    }

    // Insert items
    const itemRows = items.map(
      (item: { description: string; quantity: number; rate: number }, idx: number) => ({
        id: generateId('qi'),
        quote_id: quoteId,
        sort_order: idx + 1,
        description: item.description?.trim() || '',
        quantity: item.quantity || 0,
        rate: item.rate || 0,
        amount: (item.quantity || 0) * (item.rate || 0),
      })
    );

    const { error: itemsErr } = await supabase.from('pyra_quote_items').insert(itemRows);
    if (itemsErr) {
      console.error('External quote items error:', itemsErr);
      await supabase.from('pyra_quotes').delete().eq('id', quoteId);
      return apiServerError('فشل في إضافة بنود عرض السعر');
    }

    return apiSuccess(quote, undefined, 201);
  } catch (err) {
    console.error('POST /api/external/quotes error:', err);
    return apiServerError();
  }
}
