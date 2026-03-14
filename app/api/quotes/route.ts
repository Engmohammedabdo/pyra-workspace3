import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { resolveUserScope } from '@/lib/auth/scope';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { generateNextQuoteNumber } from '@/lib/utils/quote-number';
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';
import { QUOTE_FIELDS } from '@/lib/supabase/fields';
import { hasPermission } from '@/lib/auth/rbac';

/**
 * GET /api/quotes
 * List quotes with optional filters.
 * Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('quotes.view');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);

    // Non-admin with no linked clients → empty result
    if (!scope.isAdmin && scope.clientIds.length === 0) {
      return apiSuccess([], { total: 0, page: 1, limit: 20 });
    }

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;

    const status = sp.get('status')?.trim() || '';
    const search = sp.get('search')?.trim() || '';
    const clientId = sp.get('client_id')?.trim() || '';
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '20')));
    const offset = (page - 1) * limit;

    let query = supabase
      .from('pyra_quotes')
      .select(QUOTE_FIELDS, { count: 'exact' });

    // Scope-based filtering: non-admins only see quotes for their clients
    if (!scope.isAdmin) {
      query = query.in('client_id', scope.clientIds);
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    if (search) {
      const escaped = escapePostgrestValue(`%${escapeLike(search)}%`);
      query = query.or(
        `quote_number.ilike.${escaped},client_name.ilike.${escaped},client_company.ilike.${escaped},project_name.ilike.${escaped}`
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
    const auth = await requireApiPermission('quotes.create');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);

    const body = await request.json();
    const {
      client_id,
      lead_id,
      project_name,
      estimate_date,
      expiry_date,
      notes,
      items,
      vat_rate: bodyVatRate,
      client_address: bodyClientAddress,
      terms_conditions: bodyTerms,
    } = body;

    // Scope check: non-admins can only create quotes for their own clients
    if (!scope.isAdmin && client_id && !scope.clientIds.includes(client_id)) {
      return apiForbidden();
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return apiValidationError('يجب إضافة عنصر واحد على الأقل');
    }
    // Validate item values
    for (const item of items) {
      if (!item.quantity || item.quantity <= 0) {
        return apiValidationError('الكمية يجب أن تكون أكبر من صفر');
      }
      if (item.rate == null || item.rate < 0) {
        return apiValidationError('السعر يجب أن يكون صفر أو أكثر');
      }
    }

    const supabase = createServiceRoleClient();

    // Generate quote number atomically (race-condition safe)
    const quoteNumber = await generateNextQuoteNumber(supabase);

    // Calculate totals
    const subtotal = items.reduce(
      (sum: number, item: { quantity: number; rate: number }) =>
        sum + item.quantity * item.rate,
      0
    );

    // Get tax rate from settings (default 5%)
    const { data: vatSetting } = await supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', 'vat_rate')
      .maybeSingle();

    // Use vat_rate from request body if explicitly provided (even 0), otherwise fall back to settings
    const taxRate = bodyVatRate != null ? parseFloat(bodyVatRate) : parseFloat(vatSetting?.value || '5');
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
      client_address: bodyClientAddress?.trim() || null,
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
          client_address: bodyClientAddress?.trim() || null,
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

    const termsConditions = Array.isArray(bodyTerms) && bodyTerms.length > 0
      ? bodyTerms
      : [
          { text: `Quotation valid for ${expiryDays} days from the date of issue.` },
          { text: '50% advance payment required to commence work.' },
          { text: 'Balance payment due upon project completion.' },
        ];

    // Determine status: admins create as draft, sales agents create as pending_approval
    const canManageApprovals = hasPermission(auth.pyraUser.rolePermissions, 'quote_approvals.manage');
    const quoteStatus = canManageApprovals ? 'draft' : 'pending_approval';

    const { data: quote, error: insertError } = await supabase
      .from('pyra_quotes')
      .insert({
        id: quoteId,
        quote_number: quoteNumber,
        client_id: client_id || null,
        lead_id: lead_id || null,
        project_name: project_name?.trim() || null,
        status: quoteStatus,
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
        created_by: auth.pyraUser.username,
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
        quantity: item.quantity,
        rate: item.rate,
        amount: item.quantity * item.rate,
      })
    );

    const { error: itemsError } = await supabase
      .from('pyra_quote_items')
      .insert(itemRows);

    if (itemsError) {
      console.error('Quote items insert error:', itemsError);
      // Rollback: delete the quote if items failed
      await supabase.from('pyra_quotes').delete().eq('id', quoteId);
      return apiServerError('فشل في إضافة بنود عرض السعر');
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'quote_created',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/quotes/${quoteId}`,
      details: { quote_number: quoteNumber, total },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    // Log lead activity if linked to a lead
    if (lead_id) {
      void supabase.from('pyra_lead_activities').insert({
        id: generateId('la'),
        lead_id,
        activity_type: 'note',
        description: `تم إنشاء عرض سعر ${quoteNumber} بمبلغ ${total} AED`,
        metadata: { quote_id: quoteId, quote_number: quoteNumber, total },
        created_by: auth.pyraUser.username,
      });
    }

    // If pending approval, create approval record
    if (quoteStatus === 'pending_approval') {
      await supabase.from('pyra_quote_approvals').insert({
        id: generateId('qa'),
        quote_id: quoteId,
        requested_by: auth.pyraUser.username,
        status: 'pending',
      });
    }

    return apiSuccess(quote, undefined, 201);
  } catch (err) {
    console.error('POST /api/quotes error:', err);
    return apiServerError();
  }
}
