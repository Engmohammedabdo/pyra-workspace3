import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';

const QUOTE_FIELDS = `
  id, quote_number, client_id, project_name, status,
  estimate_date, expiry_date, currency, subtotal, tax_rate,
  tax_amount, total, notes, terms, bank_details,
  company_name, company_logo, client_name, client_email,
  client_company, client_phone, client_address,
  signature_data, signed_by, signed_at, signed_ip,
  sent_at, viewed_at, created_by, created_at, updated_at
`;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/quotes/[id]
 * Get a single quote with items.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiUnauthorized();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: quote, error } = await supabase
      .from('pyra_quotes')
      .select(QUOTE_FIELDS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Quote fetch error:', error);
      return apiServerError();
    }
    if (!quote) return apiNotFound('عرض السعر غير موجود');

    // Get items
    const { data: items } = await supabase
      .from('pyra_quote_items')
      .select('id, quote_id, sort_order, description, quantity, rate, amount, created_at')
      .eq('quote_id', id)
      .order('sort_order', { ascending: true });

    return apiSuccess({ ...quote, items: items || [] });
  } catch (err) {
    console.error('GET /api/quotes/[id] error:', err);
    return apiServerError();
  }
}

/**
 * PATCH /api/quotes/[id]
 * Update a quote and its items.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiUnauthorized();

    const { id } = await context.params;
    const body = await request.json();
    const supabase = createServiceRoleClient();

    // Check exists
    const { data: existing } = await supabase
      .from('pyra_quotes')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return apiNotFound('عرض السعر غير موجود');

    const {
      client_id,
      project_name,
      estimate_date,
      expiry_date,
      notes,
      items,
      status,
    } = body;

    // ── Validate state transition ────────────────────
    // Valid transitions: draft→sent, sent→viewed, viewed→signed, signed→(none)
    // Admin can also revert: sent→draft, viewed→draft
    const VALID_TRANSITIONS: Record<string, string[]> = {
      draft:   ['sent'],
      sent:    ['draft', 'viewed'],
      viewed:  ['draft', 'signed'],
      signed:  [],            // terminal state — cannot be changed via PATCH
      expired: ['draft'],     // can reactivate
    };

    // Build update object
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (project_name !== undefined) updates.project_name = project_name?.trim() || null;
    if (estimate_date !== undefined) updates.estimate_date = estimate_date;
    if (expiry_date !== undefined) updates.expiry_date = expiry_date;
    if (notes !== undefined) updates.notes = notes?.trim() || null;

    if (status !== undefined) {
      const currentStatus = existing.status as string;
      const allowedNextStates = VALID_TRANSITIONS[currentStatus] || [];

      if (!allowedNextStates.includes(status)) {
        return apiValidationError(
          `لا يمكن تغيير حالة عرض السعر من "${currentStatus}" إلى "${status}"`
        );
      }
      updates.status = status;
    }

    // Update client info if changed
    if (client_id !== undefined) {
      updates.client_id = client_id || null;
      if (client_id) {
        const { data: client } = await supabase
          .from('pyra_clients')
          .select('name, email, phone, company')
          .eq('id', client_id)
          .maybeSingle();

        if (client) {
          updates.client_name = client.name;
          updates.client_email = client.email;
          updates.client_company = client.company;
          updates.client_phone = client.phone;
        }
      } else {
        updates.client_name = null;
        updates.client_email = null;
        updates.client_company = null;
        updates.client_phone = null;
      }
    }

    // Recalculate totals if items provided
    if (items && Array.isArray(items)) {
      if (items.length === 0) {
        return apiValidationError('يجب إضافة عنصر واحد على الأقل');
      }

      const subtotal = items.reduce(
        (sum: number, item: { quantity: number; rate: number }) =>
          sum + (item.quantity || 0) * (item.rate || 0),
        0
      );

      const { data: vatSetting } = await supabase
        .from('pyra_settings')
        .select('value')
        .eq('key', 'vat_rate')
        .maybeSingle();

      const taxRate = parseFloat(vatSetting?.value || '5');
      const taxAmount = subtotal * (taxRate / 100);

      updates.subtotal = subtotal;
      updates.tax_rate = taxRate;
      updates.tax_amount = taxAmount;
      updates.total = subtotal + taxAmount;

      // Replace all items
      await supabase.from('pyra_quote_items').delete().eq('quote_id', id);

      const itemRows = items.map(
        (item: { description: string; quantity: number; rate: number }, idx: number) => ({
          id: generateId('qi'),
          quote_id: id,
          sort_order: idx + 1,
          description: item.description?.trim() || '',
          quantity: item.quantity || 0,
          rate: item.rate || 0,
          amount: (item.quantity || 0) * (item.rate || 0),
        })
      );

      const { error: itemsErr } = await supabase.from('pyra_quote_items').insert(itemRows);
      if (itemsErr) console.error('Quote items insert error:', itemsErr);
    }

    const { data: quote, error: updateError } = await supabase
      .from('pyra_quotes')
      .update(updates)
      .eq('id', id)
      .select(QUOTE_FIELDS)
      .single();

    if (updateError) {
      console.error('Quote update error:', updateError);
      return apiServerError();
    }

    // Get updated items
    const { data: updatedItems } = await supabase
      .from('pyra_quote_items')
      .select('id, quote_id, sort_order, description, quantity, rate, amount, created_at')
      .eq('quote_id', id)
      .order('sort_order', { ascending: true });

    return apiSuccess({ ...quote, items: updatedItems || [] });
  } catch (err) {
    console.error('PATCH /api/quotes/[id] error:', err);
    return apiServerError();
  }
}

/**
 * DELETE /api/quotes/[id]
 * Delete a quote (cascade deletes items).
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiUnauthorized();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // Delete items first
    const { error: itemsDelErr } = await supabase.from('pyra_quote_items').delete().eq('quote_id', id);
    if (itemsDelErr) console.error('Quote items delete error:', itemsDelErr);

    const { error } = await supabase
      .from('pyra_quotes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Quote delete error:', error);
      return apiServerError();
    }

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/quotes/[id] error:', err);
    return apiServerError();
  }
}
