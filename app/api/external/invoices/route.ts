import { NextRequest } from 'next/server';
import { getExternalAuth, hasPermission } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { generateNextInvoiceNumber } from '@/lib/utils/invoice-number';
import { INVOICE_FIELDS } from '@/lib/supabase/fields';
import { dispatchWebhookEvent } from '@/lib/webhooks/dispatcher';

/**
 * GET /api/external/invoices
 * List invoices (paginated) from external source.
 * Auth: API key with 'invoices:read' permission
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getExternalAuth(req);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    if (!hasPermission(ctx, 'invoices:read')) return apiError('لا تملك صلاحية قراءة الفواتير', 403);

    const supabase = createServiceRoleClient();
    const sp = req.nextUrl.searchParams;

    const status = sp.get('status')?.trim() || '';
    const clientId = sp.get('client_id')?.trim() || '';
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') || '20')));
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('pyra_invoices')
      .select(INVOICE_FIELDS, { count: 'exact' });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);

    const { data: invoices, count, error } = await query;

    if (error) throw error;

    return apiSuccess(invoices || [], { total: count ?? 0, page, pageSize });
  } catch {
    return apiServerError();
  }
}

/**
 * POST /api/external/invoices
 * Create an invoice from an external source (n8n, Telegram bot, etc.)
 * Auth: API key with 'invoices:create' permission
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getExternalAuth(req);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    if (!hasPermission(ctx, 'invoices:create')) return apiError('لا تملك صلاحية إنشاء الفواتير', 403);

    const supabase = createServiceRoleClient();
    const body = await req.json();

    const {
      client_id,
      client_name,
      items,
      currency,
      notes,
      due_date,
      source,
    } = body;

    // Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return apiError('يجب إضافة بند واحد على الأقل', 422);
    }

    // Resolve client_id from client_name if needed
    let resolvedClientId: string | null = client_id || null;
    let resolvedClientData: Record<string, string | null> = {
      client_name: null,
      client_email: null,
      client_company: null,
      client_phone: null,
    };

    if (!resolvedClientId && client_name) {
      const { data: client } = await supabase
        .from('pyra_clients')
        .select('id, name, email, phone, company')
        .ilike('name', client_name)
        .limit(1)
        .maybeSingle();

      if (client) {
        resolvedClientId = client.id;
        resolvedClientData = {
          client_name: client.name,
          client_email: client.email,
          client_company: client.company,
          client_phone: client.phone,
        };
      } else {
        // Use the provided name even if no client record found
        resolvedClientData.client_name = client_name;
      }
    } else if (resolvedClientId) {
      const { data: client } = await supabase
        .from('pyra_clients')
        .select('name, email, phone, company')
        .eq('id', resolvedClientId)
        .maybeSingle();

      if (client) {
        resolvedClientData = {
          client_name: client.name,
          client_email: client.email,
          client_company: client.company,
          client_phone: client.phone,
        };
      }
    }

    // Generate invoice number
    const invoiceNumber = await generateNextInvoiceNumber(supabase);

    // Fetch VAT rate from settings
    const { data: vatSetting } = await supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', 'vat_rate')
      .maybeSingle();

    const taxRate = parseFloat(vatSetting?.value || '5');

    // Fetch bank details from settings
    const { data: bankSettings } = await supabase
      .from('pyra_settings')
      .select('key, value')
      .in('key', ['bank_name', 'bank_account_name', 'bank_account_no', 'bank_iban', 'company_name', 'company_logo']);

    const settingsMap: Record<string, string> = {};
    for (const s of bankSettings || []) settingsMap[s.key] = s.value;

    const bankDetails = {
      bank: settingsMap.bank_name || '',
      account_name: settingsMap.bank_account_name || '',
      account_no: settingsMap.bank_account_no || '',
      iban: settingsMap.bank_iban || '',
    };

    // Calculate totals
    const processedItems = items.map(
      (item: { description: string; quantity: number; rate: number }, idx: number) => ({
        id: generateId('ii'),
        sort_order: idx + 1,
        description: item.description?.trim() || '',
        quantity: item.quantity || 1,
        rate: item.rate || 0,
        amount: (item.quantity || 1) * (item.rate || 0),
      })
    );

    const subtotal = processedItems.reduce(
      (sum: number, i: { amount: number }) => sum + i.amount,
      0
    );
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    const invoiceId = generateId('inv');

    const { data: invoice, error: insertError } = await supabase
      .from('pyra_invoices')
      .insert({
        id: invoiceId,
        invoice_number: invoiceNumber,
        client_id: resolvedClientId,
        status: 'draft',
        issue_date: new Date().toISOString().split('T')[0],
        due_date: due_date || null,
        currency: currency || 'AED',
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        amount_paid: 0,
        amount_due: total,
        notes: notes ? `${notes}${source ? ` [${source}]` : ''}` : (source ? `[${source}]` : null),
        bank_details: bankDetails,
        company_name: settingsMap.company_name || null,
        company_logo: settingsMap.company_logo || null,
        created_by: 'api',
        ...resolvedClientData,
      })
      .select(INVOICE_FIELDS)
      .single();

    if (insertError) throw insertError;

    // Insert invoice items
    const itemRows = processedItems.map(
      (item: { id: string; sort_order: number; description: string; quantity: number; rate: number; amount: number }) => ({
        ...item,
        invoice_id: invoiceId,
      })
    );

    await supabase.from('pyra_invoice_items').insert(itemRows);

    // Activity log
    supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'invoice_created',
      username: 'api',
      display_name: ctx.apiKey.name,
      target_path: `/dashboard/invoices/${invoiceId}`,
      details: {
        invoice_number: invoiceNumber,
        total,
        client_name: resolvedClientData.client_name,
        source: source || 'api',
      },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
    }).then(null, (e: unknown) => console.error('Activity log error:', e));

    dispatchWebhookEvent('invoice_created', { invoice_id: invoiceId, invoice_number: invoiceNumber, total, client_name: resolvedClientData.client_name, source: source || 'api' });

    // Fetch items to return with invoice
    const { data: createdItems } = await supabase
      .from('pyra_invoice_items')
      .select('id, description, quantity, rate, amount, sort_order')
      .eq('invoice_id', invoiceId)
      .order('sort_order', { ascending: true });

    return apiSuccess({ ...invoice, items: createdItems || [] }, undefined, 201);
  } catch {
    return apiServerError();
  }
}
