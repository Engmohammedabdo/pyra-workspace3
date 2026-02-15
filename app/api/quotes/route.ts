import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

const QUOTE_FIELDS = `
  id, quote_number, team_id, client_id, project_name, status,
  estimate_date, expiry_date, currency, subtotal, tax_rate,
  tax_amount, total, notes, client_name, client_email,
  client_company, client_phone, client_address,
  signature_data, signed_by, signed_at, sent_at, viewed_at,
  created_by, created_at, updated_at
`;

/**
 * GET /api/quotes
 * List quotes with optional filters.
 * Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiUnauthorized();

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;

    const status = sp.get('status')?.trim() || '';
    const search = sp.get('search')?.trim() || '';
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '20')));
    const offset = (page - 1) * limit;

    let query = supabase
      .from('pyra_quotes')
      .select(QUOTE_FIELDS, { count: 'exact' });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (search) {
      const escaped = search.replace(/%/g, '\\%').replace(/_/g, '\\_');
      query = query.or(
        `quote_number.ilike.%${escaped}%,client_name.ilike.%${escaped}%,client_company.ilike.%${escaped}%,project_name.ilike.%${escaped}%`
      );
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data: quotes, count, error } = await query;

    if (error) {
      console.error('Quotes list error:', error);
      return apiServerError();
    }

    return apiSuccess(quotes || [], { total: count ?? 0, page, limit });
  } catch (err) {
    console.error('GET /api/quotes error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/quotes
 * Create a new quote with items.
 * Admin only.
 *
 * Body: {
 *   client_id?, project_name?, estimate_date, expiry_date?,
 *   notes?, items: [{ description, quantity, rate }]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiUnauthorized();

    const body = await request.json();
    const {
      client_id,
      project_name,
      estimate_date,
      expiry_date,
      notes,
      items,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return apiValidationError('يجب إضافة عنصر واحد على الأقل');
    }

    const supabase = createServiceRoleClient();

    // Generate quote number: QT-XXXX
    // Get settings for prefix
    const { data: prefixSetting } = await supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', 'quote_prefix')
      .maybeSingle();

    const prefix = prefixSetting?.value || 'QT';

    // Get max quote number
    const { data: lastQuote } = await supabase
      .from('pyra_quotes')
      .select('quote_number')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextNum = 1;
    if (lastQuote?.quote_number) {
      const match = lastQuote.quote_number.match(/(\d+)$/);
      if (match) nextNum = parseInt(match[1]) + 1;
    }

    const quoteNumber = `${prefix}-${String(nextNum).padStart(4, '0')}`;

    // Calculate totals
    const subtotal = items.reduce(
      (sum: number, item: { quantity: number; rate: number }) =>
        sum + (item.quantity || 0) * (item.rate || 0),
      0
    );

    // Get tax rate from settings (default 5%)
    const { data: vatSetting } = await supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', 'vat_rate')
      .maybeSingle();

    const taxRate = parseFloat(vatSetting?.value || '5');
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    // Get bank details from settings
    const { data: bankSettings } = await supabase
      .from('pyra_settings')
      .select('key, value')
      .in('key', ['bank_name', 'bank_account_name', 'bank_account_no', 'bank_iban']);

    const bankMap: Record<string, string> = {};
    for (const s of bankSettings || []) bankMap[s.key] = s.value;

    const bankDetails = {
      bank: bankMap.bank_name || '',
      account_name: bankMap.bank_account_name || '',
      account_no: bankMap.bank_account_no || '',
      iban: bankMap.bank_iban || '',
    };

    // Get company info from settings
    const { data: companySettings } = await supabase
      .from('pyra_settings')
      .select('key, value')
      .in('key', ['company_name', 'company_logo']);

    const companyMap: Record<string, string> = {};
    for (const s of companySettings || []) companyMap[s.key] = s.value;

    // Get client info if client_id is provided
    let clientData: Record<string, string | null> = {
      client_name: null,
      client_email: null,
      client_company: null,
      client_phone: null,
      client_address: null,
    };

    if (client_id) {
      const { data: client } = await supabase
        .from('pyra_clients')
        .select('name, email, phone, company')
        .eq('id', client_id)
        .maybeSingle();

      if (client) {
        clientData = {
          client_name: client.name,
          client_email: client.email,
          client_company: client.company,
          client_phone: client.phone,
          client_address: null,
        };
      }
    }

    // Get expiry days from settings
    const { data: expirySetting } = await supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', 'quote_expiry_days')
      .maybeSingle();

    const expiryDays = parseInt(expirySetting?.value || '30');

    const estDate = estimate_date || new Date().toISOString().split('T')[0];
    const expDate =
      expiry_date ||
      new Date(new Date(estDate).getTime() + expiryDays * 86400000)
        .toISOString()
        .split('T')[0];

    const quoteId = generateId('qt');

    const termsConditions = [
      { text: 'Quotation valid for 30 days from the date of issue.' },
      { text: '50% advance payment required to commence work.' },
      { text: 'Balance payment due upon project completion.' },
    ];

    const { data: quote, error: insertError } = await supabase
      .from('pyra_quotes')
      .insert({
        id: quoteId,
        quote_number: quoteNumber,
        team_id: 'default',
        client_id: client_id || null,
        project_name: project_name?.trim() || null,
        status: 'draft',
        estimate_date: estDate,
        expiry_date: expDate,
        currency: 'AED',
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        notes: notes?.trim() || null,
        terms_conditions: termsConditions,
        bank_details: bankDetails,
        company_name: companyMap.company_name || null,
        company_logo: companyMap.company_logo || null,
        ...clientData,
        created_by: admin.pyraUser.username,
      })
      .select(QUOTE_FIELDS)
      .single();

    if (insertError) {
      console.error('Quote insert error:', insertError);
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

    const { error: itemsError } = await supabase
      .from('pyra_quote_items')
      .insert(itemRows);

    if (itemsError) {
      console.error('Quote items insert error:', itemsError);
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'quote_created',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/quotes/${quoteId}`,
      details: { quote_number: quoteNumber, total },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(quote, undefined, 201);
  } catch (err) {
    console.error('POST /api/quotes error:', err);
    return apiServerError();
  }
}
