import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { generateNextInvoiceNumber } from '@/lib/utils/invoice-number';
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';
import { INVOICE_FIELDS } from '@/lib/supabase/fields';
import { dispatchWebhookEvent } from '@/lib/webhooks/dispatcher';
import { resolveUserScope } from '@/lib/auth/scope';
import { INVOICE_STATUS } from '@/lib/constants/statuses';

/**
 * GET /api/invoices
 * List invoices with optional filters.
 * Admin only.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('invoices.view');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);

    // Non-admin with no accessible clients → empty result
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
      .from('pyra_invoices')
      .select(INVOICE_FIELDS, { count: 'exact' });

    // Scope filtering: non-admins only see invoices for their accessible clients
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
        `invoice_number.ilike.${escaped},client_name.ilike.${escaped},client_company.ilike.${escaped},project_name.ilike.${escaped}`
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
    const auth = await requireApiPermission('invoices.create');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);

    const body = await request.json();
    let {
      client_id,
      project_id: bodyProjectId,
      project_name,
      issue_date,
      due_date,
      notes,
      items,
      milestone_type,
      parent_invoice_id,
      contract_id,
      vat_rate: bodyVatRate,
      discount_type: bodyDiscountType,
      discount_value: bodyDiscountValue,
      display_client_name,
    } = body;

    // Scope check: non-admins can only create invoices for their accessible clients
    if (!scope.isAdmin && client_id) {
      if (!scope.clientIds.includes(client_id)) {
        return apiForbidden();
      }
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return apiValidationError('يجب إضافة بند واحد على الأقل');
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
        'default_currency',
        'default_early_payment_discount_percent',
        'default_early_payment_discount_days',
      ]);

    const settingsMap: Record<string, string> = {};
    for (const s of settings || []) settingsMap[s.key] = s.value;

    // Entity lookup — override company_name/logo if entity_id provided
    const entity_id = body.entity_id;
    if (entity_id) {
      const { data: entity } = await supabase
        .from('pyra_business_entities')
        .select('name_en, name_ar, license_no, logo_url')
        .eq('id', entity_id)
        .maybeSingle();
      if (entity) {
        settingsMap.company_name = entity.name_en;
        settingsMap.company_logo = entity.logo_url || settingsMap.company_logo;
        settingsMap._license_no = entity.license_no;
        settingsMap._entity_id = entity_id;
      }
    }

    // Auto-calculate due_date from payment_terms_days if not provided
    const paymentTermsDays = parseInt(settingsMap.payment_terms_days || '0');
    if (!due_date && paymentTermsDays > 0) {
      const issueDate = new Date(issue_date || new Date().toISOString().split('T')[0]);
      issueDate.setDate(issueDate.getDate() + paymentTermsDays);
      due_date = issueDate.toISOString().split('T')[0];
    }
    if (!due_date) {
      return apiValidationError('تاريخ الاستحقاق مطلوب — حدد التاريخ أو اضبط مدة الدفع في الإعدادات');
    }

    // Use vat_rate from request body if explicitly provided (even 0), otherwise fall back to settings
    const taxRate = bodyVatRate != null ? parseFloat(bodyVatRate) : parseFloat(settingsMap.vat_rate || '5');

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

    // Resolve project_id: use explicit value, or look up by project_name
    let resolvedProjectId: string | null = bodyProjectId || null;
    if (!resolvedProjectId && project_name) {
      const { data: matchedProject } = await supabase
        .from('pyra_projects')
        .select('id')
        .eq('name', project_name.trim())
        .maybeSingle();
      if (matchedProject) resolvedProjectId = matchedProject.id;
    }

    // Calculate totals
    const processedItems = items.map(
      (item: { description: string; quantity: number; rate: number }, idx: number) => ({
        id: generateId('ii'),
        sort_order: idx + 1,
        description: item.description?.trim() || '',
        quantity: item.quantity,
        rate: item.rate,
        amount: item.quantity * item.rate,
      })
    );

    const subtotal = processedItems.reduce(
      (sum: number, i: { amount: number }) => sum + i.amount,
      0
    );

    // Calculate discount
    const discountType = bodyDiscountType || null; // 'percentage' | 'fixed' | null
    const discountValue = parseFloat(bodyDiscountValue) || 0;
    let discountAmount = 0;
    if (discountType === 'percentage' && discountValue > 0) {
      discountAmount = Math.round(subtotal * (discountValue / 100) * 100) / 100;
    } else if (discountType === 'fixed' && discountValue > 0) {
      discountAmount = Math.min(discountValue, subtotal);
    }

    // Early payment discount defaults from settings
    const earlyPaymentDiscountPercent = parseFloat(settingsMap.default_early_payment_discount_percent || '0');
    const earlyPaymentDiscountDays = parseInt(settingsMap.default_early_payment_discount_days || '0');

    // Tax is calculated on subtotal AFTER discount (UAE standard)
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = taxableAmount * (taxRate / 100);
    const total = taxableAmount + taxAmount;

    const invoiceId = generateId('inv');

    const { data: invoice, error: insertError } = await supabase
      .from('pyra_invoices')
      .insert({
        id: invoiceId,
        invoice_number: invoiceNumber,
        client_id: client_id || null,
        project_id: resolvedProjectId,
        project_name: project_name?.trim() || null,
        status: INVOICE_STATUS.DRAFT,
        issue_date: issue_date || new Date().toISOString().split('T')[0],
        due_date,
        currency: body.currency || settingsMap.default_currency || 'AED',
        subtotal,
        discount_type: discountType,
        discount_value: discountValue,
        discount_amount: discountAmount,
        early_payment_discount_percent: earlyPaymentDiscountPercent,
        early_payment_discount_days: earlyPaymentDiscountDays,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        amount_paid: 0,
        amount_due: total,
        notes: notes?.trim() || null,
        bank_details: bankDetails,
        company_name: settingsMap.company_name || null,
        company_logo: settingsMap.company_logo || null,
        entity_id: settingsMap._entity_id || null,
        license_no: settingsMap._license_no || null,
        milestone_type: milestone_type || null,
        parent_invoice_id: parent_invoice_id || null,
        contract_id: contract_id || null,
        display_client_name: display_client_name?.trim() || null,
        created_by: auth.pyraUser.username,
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
      // Rollback: delete the invoice since items failed
      await supabase.from('pyra_invoices').delete().eq('id', invoiceId);
      return apiServerError('فشل في إضافة بنود الفاتورة');
    }

    // Update contract amount_billed if invoice is linked to a contract
    if (contract_id) {
      const { data: contractData } = await supabase
        .from('pyra_contracts')
        .select('id, amount_billed')
        .eq('id', contract_id)
        .maybeSingle();

      if (contractData) {
        await supabase
          .from('pyra_contracts')
          .update({
            amount_billed: (contractData.amount_billed || 0) + total,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contract_id);
      }
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'invoice_created',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/invoices/${invoiceId}`,
      details: { invoice_number: invoiceNumber, total, client_name: clientData.client_name },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    dispatchWebhookEvent('invoice_created', { invoice_id: invoiceId, invoice_number: invoiceNumber, total, client_name: clientData.client_name });

    return apiSuccess(invoice, undefined, 201);
  } catch (err) {
    console.error('POST /api/invoices error:', err);
    return apiServerError();
  }
}
