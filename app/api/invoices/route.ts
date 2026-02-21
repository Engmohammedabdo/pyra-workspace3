import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { generateNextInvoiceNumber } from '@/lib/utils/invoice-number';
import { escapeLike } from '@/lib/utils/path';
import { INVOICE_FIELDS } from '@/lib/supabase/fields';

/**
 * GET /api/invoices
 * List invoices with optional filters.
 * Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;

    const status = sp.get('status')?.trim() || '';
    const search = sp.get('search')?.trim() || '';
    const clientId = sp.get('client_id')?.trim() || '';
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '20')));
    const offset = (page - 1) * limit;

    let query = supabase
      .from('pyra_invoices')
      .select(INVOICE_FIELDS, { count: 'exact' });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    if (search) {
      const escaped = escapeLike(search);
      query = query.or(
        `invoice_number.ilike.%${escaped}%,client_name.ilike.%${escaped}%,client_company.ilike.%${escaped}%,project_name.ilike.%${escaped}%`
      );
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data: invoices, count, error } = await query;

    if (error) {
      console.error('Invoices list error:', error);
      return apiServerError();
    }

    return apiSuccess(invoices || [], { total: count ?? 0, page, limit });
  } catch (err) {
    console.error('GET /api/invoices error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/invoices
 * Create a new invoice with items.
 * Admin only.
 *
 * Body: {
 *   client_id?, project_name?, issue_date?, due_date,
 *   notes?, items: [{ description, quantity, rate }],
 *   milestone_type?, parent_invoice_id?
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const body = await request.json();
    const {
      client_id,
      project_name,
      issue_date,
      due_date,
      notes,
      items,
      milestone_type,
      parent_invoice_id,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return apiValidationError('يجب إضافة بند واحد على الأقل');
    }
    if (!due_date) {
      return apiValidationError('تاريخ الاستحقاق مطلوب');
    }

    const supabase = createServiceRoleClient();

    // Generate invoice number atomically (race-condition safe)
    const invoiceNumber = await generateNextInvoiceNumber(supabase);

    // Fetch settings in a single query
    const { data: settings } = await supabase
      .from('pyra_settings')
      .select('key, value')
      .in('key', [
        'vat_rate',
        'bank_name',
        'bank_account_name',
        'bank_account_no',
        'bank_iban',
        'company_name',
        'company_logo',
        'payment_terms_days',
      ]);

    const settingsMap: Record<string, string> = {};
    for (const s of settings || []) settingsMap[s.key] = s.value;

    const taxRate = parseFloat(settingsMap.vat_rate || '5');

    const bankDetails = {
      bank: settingsMap.bank_name || '',
      account_name: settingsMap.bank_account_name || '',
      account_no: settingsMap.bank_account_no || '',
      iban: settingsMap.bank_iban || '',
    };

    // Get client info if client_id is provided
    let clientData: Record<string, string | null> = {
      client_name: null,
      client_email: null,
      client_company: null,
      client_phone: null,
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
        };
      }
    }

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
        client_id: client_id || null,
        project_name: project_name?.trim() || null,
        status: 'draft',
        issue_date: issue_date || new Date().toISOString().split('T')[0],
        due_date,
        currency: 'AED',
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        amount_paid: 0,
        amount_due: total,
        notes: notes?.trim() || null,
        bank_details: bankDetails,
        company_name: settingsMap.company_name || null,
        company_logo: settingsMap.company_logo || null,
        milestone_type: milestone_type || null,
        parent_invoice_id: parent_invoice_id || null,
        created_by: admin.pyraUser.username,
        ...clientData,
      })
      .select(INVOICE_FIELDS)
      .single();

    if (insertError) {
      console.error('Invoice insert error:', insertError);
      return apiServerError();
    }

    // Insert items
    const itemRows = processedItems.map(
      (item: { id: string; sort_order: number; description: string; quantity: number; rate: number; amount: number }) => ({
        ...item,
        invoice_id: invoiceId,
      })
    );

    const { error: itemsError } = await supabase
      .from('pyra_invoice_items')
      .insert(itemRows);

    if (itemsError) {
      console.error('Invoice items insert error:', itemsError);
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'invoice_created',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/dashboard/invoices/${invoiceId}`,
      details: { invoice_number: invoiceNumber, total, client_name: clientData.client_name },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(invoice, undefined, 201);
  } catch (err) {
    console.error('POST /api/invoices error:', err);
    return apiServerError();
  }
}
