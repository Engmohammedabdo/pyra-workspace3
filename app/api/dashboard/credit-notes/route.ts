import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { CREDIT_NOTE_FIELDS } from '@/lib/supabase/fields';
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';

// Generate next credit note number
async function generateNextCreditNoteNumber(supabase: ReturnType<typeof createServiceRoleClient>): Promise<string> {
  const { data: prefixSetting } = await supabase
    .from('pyra_settings')
    .select('value')
    .eq('key', 'credit_note_prefix')
    .maybeSingle();
  const prefix = prefixSetting?.value || 'CN';

  const { data: allNotes } = await supabase
    .from('pyra_credit_notes')
    .select('credit_note_number')
    .like('credit_note_number', `${prefix}-%`);

  let maxNum = 0;
  for (const cn of allNotes || []) {
    const match = cn.credit_note_number.match(/(\d+)$/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
  }

  return `${prefix}-${String(maxNum + 1).padStart(4, '0')}`;
}

/**
 * GET /api/dashboard/credit-notes
 * List credit notes with optional filters.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('finance.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;

    const status = sp.get('status')?.trim() || '';
    const search = sp.get('search')?.trim() || '';
    const clientId = sp.get('client_id')?.trim() || '';
    const page = Math.max(1, parseInt(sp.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') || '20')));
    const offset = (page - 1) * limit;

    let query = supabase
      .from('pyra_credit_notes')
      .select(CREDIT_NOTE_FIELDS, { count: 'exact' });

    if (status && status !== 'all') query = query.eq('status', status);
    if (clientId) query = query.eq('client_id', clientId);

    if (search) {
      const escaped = escapePostgrestValue(`%${escapeLike(search)}%`);
      query = query.or(
        `credit_note_number.ilike.${escaped},client_name.ilike.${escaped},reason.ilike.${escaped}`
      );
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) { console.error('Credit notes list error:', error); return apiServerError(); }

    return apiSuccess(data || [], { total: count ?? 0, page, limit });
  } catch (err) {
    console.error('GET /api/dashboard/credit-notes error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/dashboard/credit-notes
 * Create a new credit note with items.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('finance.manage');
    if (isApiError(auth)) return auth;

    const body = await request.json();
    const { invoice_id, client_id, reason, issue_date, notes, items, vat_rate: bodyVatRate } = body;

    if (!reason?.trim()) return apiValidationError('سبب الإشعار الدائن مطلوب');
    if (!items || !Array.isArray(items) || items.length === 0) {
      return apiValidationError('يجب إضافة بند واحد على الأقل');
    }
    if (!issue_date) return apiValidationError('تاريخ الإصدار مطلوب');

    const supabase = createServiceRoleClient();

    // Get settings
    const { data: settings } = await supabase
      .from('pyra_settings')
      .select('key, value')
      .in('key', ['vat_rate', 'company_name', 'company_logo']);
    const settingsMap: Record<string, string> = {};
    for (const s of settings || []) settingsMap[s.key] = s.value;

    const taxRate = bodyVatRate != null ? parseFloat(bodyVatRate) : parseFloat(settingsMap.vat_rate || '5');

    // Get client info
    let clientData: Record<string, string | null> = { client_name: null, client_email: null, client_company: null, client_phone: null };
    if (client_id) {
      const { data: client } = await supabase.from('pyra_clients').select('name, email, phone, company').eq('id', client_id).maybeSingle();
      if (client) clientData = { client_name: client.name, client_email: client.email, client_company: client.company, client_phone: client.phone };
    }

    // Generate number
    const creditNoteNumber = await generateNextCreditNoteNumber(supabase);

    // Process items
    const processedItems = items.map(
      (item: { description: string; quantity: number; rate: number }, idx: number) => ({
        id: generateId('cni'),
        sort_order: idx + 1,
        description: item.description?.trim() || '',
        quantity: item.quantity,
        rate: item.rate,
        amount: item.quantity * item.rate,
      })
    );

    const subtotal = processedItems.reduce((sum: number, i: { amount: number }) => sum + i.amount, 0);
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    const cnId = generateId('cn');

    const { data: creditNote, error: insertError } = await supabase
      .from('pyra_credit_notes')
      .insert({
        id: cnId,
        credit_note_number: creditNoteNumber,
        invoice_id: invoice_id || null,
        client_id: client_id || null,
        reason: reason.trim(),
        status: 'draft',
        issue_date,
        currency: 'AED',
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        applied_amount: 0,
        notes: notes?.trim() || null,
        company_name: settingsMap.company_name || null,
        company_logo: settingsMap.company_logo || null,
        created_by: auth.pyraUser.username,
        ...clientData,
      })
      .select(CREDIT_NOTE_FIELDS)
      .single();

    if (insertError) { console.error('Credit note insert error:', insertError); return apiServerError(); }

    // Insert items
    const itemRows = processedItems.map(
      (item: { id: string; sort_order: number; description: string; quantity: number; rate: number; amount: number }) => ({
        ...item,
        credit_note_id: cnId,
      })
    );

    const { error: itemsError } = await supabase.from('pyra_credit_note_items').insert(itemRows);
    if (itemsError) {
      await supabase.from('pyra_credit_notes').delete().eq('id', cnId);
      return apiServerError('فشل في إضافة بنود الإشعار الدائن');
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'credit_note_created',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/finance/credit-notes/${cnId}`,
      details: { credit_note_number: creditNoteNumber, total, client_name: clientData.client_name },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(creditNote, undefined, 201);
  } catch (err) {
    console.error('POST /api/dashboard/credit-notes error:', err);
    return apiServerError();
  }
}
