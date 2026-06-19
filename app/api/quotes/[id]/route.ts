import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { resolveUserScope } from '@/lib/auth/scope';
import { canAccessLead } from '@/lib/auth/lead-scope';
import { escapePostgrestValue } from '@/lib/utils/path';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { QUOTE_FIELDS } from '@/lib/supabase/fields';
import { QUOTE_VALID_TRANSITIONS } from '@/lib/constants/statuses';
import { logActivity } from '@/lib/api/activity';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/quotes/[id]
 * Get a single quote with items.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('quotes.view');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);
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

    // Gap #5a — three-way scope: own quote OR lead-owned OR client-scope.
    // Mirrors the list endpoint so an agent can open a quote they created or a
    // quote on a lead they own (team-less agents have no clientIds).
    if (!scope.isAdmin) {
      const me = auth.pyraUser.username;
      const ownsQuote = quote.created_by === me;
      const inClientScope =
        !!quote.client_id && scope.clientIds.some((c) => String(c) === quote.client_id);
      const ownsLead =
        !!quote.lead_id &&
        (await canAccessLead(supabase, me, auth.pyraUser.role, quote.lead_id));
      if (!ownsQuote && !inClientScope && !ownsLead) {
        return apiForbidden();
      }
    }

    // Get items
    const { data: items } = await supabase
      .from('pyra_quote_items')
      .select('id, quote_id, sort_order, description, quantity, rate, amount, created_at')
      .eq('quote_id', id)
      .order('sort_order', { ascending: true });

    // Get company settings (for PDF generation)
    const { data: settingsRows } = await supabase
      .from('pyra_settings')
      .select('key, value')
      .in('key', ['company_name', 'company_logo', 'bank_name', 'bank_account_name', 'bank_account_number', 'bank_iban']);
    const settingsMap: Record<string, string> = {};
    (settingsRows || []).forEach((s: { key: string; value: string }) => { settingsMap[s.key] = s.value; });

    const bankDetails = (settingsMap.bank_name || settingsMap.bank_iban) ? {
      bank: settingsMap.bank_name || '',
      account_name: settingsMap.bank_account_name || '',
      account_no: settingsMap.bank_account_number || '',
      iban: settingsMap.bank_iban || '',
    } : null;

    // Get linked lead info if lead_id exists
    let leadInfo: { id: string; name: string; phone?: string; email?: string; company?: string } | null = null;
    if (quote.lead_id) {
      const { data: lead } = await supabase
        .from('pyra_sales_leads')
        .select('id, name, phone, email, company')
        .eq('id', quote.lead_id)
        .maybeSingle();
      if (lead) leadInfo = lead;
    }

    // Get revisions (other versions in the same chain)
    const rootId = quote.parent_quote_id || quote.id;
    // escapePostgrestValue on the .or() interpolation (Phase D convention).
    // Quote IDs are nanoid (no dots) so practical risk is nil, but keep the
    // guard consistent across all .or() call sites.
    const safeRootId = escapePostgrestValue(rootId);
    const { data: revisions } = await supabase
      .from('pyra_quotes')
      .select('id, quote_number, version, status, created_at')
      .or(`id.eq.${safeRootId},parent_quote_id.eq.${safeRootId}`)
      .neq('id', id)
      .order('version', { ascending: false });

    return apiSuccess({
      ...quote,
      items: items || [],
      lead: leadInfo,
      revisions: revisions || [],
      // Preserve entity's company info saved at creation; fall back to settings only if empty
      company_name: quote.company_name || settingsMap.company_name || null,
      company_logo: quote.company_logo || settingsMap.company_logo || null,
      bank_details: bankDetails || quote.bank_details || null,
    });
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
    const auth = await requireApiPermission('quotes.edit');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);
    const { id } = await context.params;
    const body = await request.json();
    const supabase = createServiceRoleClient();

    // Check exists
    const { data: existing } = await supabase
      .from('pyra_quotes')
      .select('id, status, client_id, tax_rate, discount_type, discount_value, created_by')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return apiNotFound('عرض السعر غير موجود');

    // Scope check: non-admins can only edit quotes for their own clients
    if (!scope.isAdmin && !scope.clientIds.includes(existing.client_id)) {
      return apiForbidden();
    }

    // Q2: Ownership check — non-admins can only edit quotes they created
    if (!scope.isAdmin && existing.created_by !== auth.pyraUser.username) {
      return apiForbidden('لا يمكنك تعديل عرض سعر لم تنشئه');
    }

    // Q7: Lock quotes during pending approval — only admins can edit
    if (existing.status === 'pending_approval' && !scope.isAdmin) {
      return apiForbidden('عرض السعر قيد الموافقة ولا يمكن تعديله');
    }

    const {
      client_id,
      project_name,
      estimate_date,
      expiry_date,
      notes,
      items,
      status,
      currency: bodyCurrency,
      vat_rate: bodyVatRate,
      tax_rate: bodyTaxRate,
      discount_type: bodyDiscountType,
      discount_value: bodyDiscountValue,
      client_address: bodyClientAddress,
      client_name: bodyClientName,
      client_email: bodyClientEmail,
      client_phone: bodyClientPhone,
      client_company: bodyClientCompany,
      terms_conditions: bodyTerms,
    } = body;

    // ── Validate state transition ────────────────────
    // Valid transitions: draft→sent, sent→viewed, viewed→signed, signed→(none)
    // Admin can also revert: sent→draft, viewed→draft
    // Use centralized valid transitions from constants
    const VALID_TRANSITIONS = QUOTE_VALID_TRANSITIONS;

    // Build update object
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (project_name !== undefined) updates.project_name = project_name?.trim() || null;
    if (estimate_date !== undefined) updates.estimate_date = estimate_date;
    if (expiry_date !== undefined) updates.expiry_date = expiry_date;
    if (notes !== undefined) updates.notes = notes?.trim() || null;
    if (bodyCurrency !== undefined) updates.currency = bodyCurrency;
    if (bodyClientAddress !== undefined) updates.client_address = bodyClientAddress?.trim() || null;
    if (Array.isArray(bodyTerms)) updates.terms_conditions = bodyTerms;
    if (bodyDiscountType !== undefined) updates.discount_type = bodyDiscountType || null;
    if (bodyDiscountValue !== undefined) updates.discount_value = parseFloat(bodyDiscountValue) || 0;

    if (status !== undefined) {
      const currentStatus = existing.status as string;
      const allowedNextStates = VALID_TRANSITIONS[currentStatus] || [];

      if (!allowedNextStates.includes(status)) {
        return apiValidationError(
          `لا يمكن تغيير حالة عرض السعر من "${currentStatus}" إلى "${status}"`
        );
      }

      // Q1: Only admins can change status away from pending_approval
      if (currentStatus === 'pending_approval' && !scope.isAdmin) {
        return apiForbidden('عرض السعر قيد الموافقة ولا يمكن تعديل حالته');
      }

      // Q8: Status revert transitions (back to draft) are admin-only
      const REVERT_STATUSES = ['sent', 'viewed', 'rejected', 'expired', 'cancelled'];
      if (REVERT_STATUSES.includes(currentStatus) && status === 'draft' && !scope.isAdmin) {
        return apiForbidden('فقط الأدمن يمكنه إعادة عرض السعر إلى مسودة');
      }

      updates.status = status;
    }

    // Update client info if changed — DB lookup when client_id provided, manual fields otherwise
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
        // No client_id — clear or use manual fields
        updates.client_name = bodyClientName?.trim() || null;
        updates.client_email = bodyClientEmail?.trim() || null;
        updates.client_company = bodyClientCompany?.trim() || null;
        updates.client_phone = bodyClientPhone?.trim() || null;
      }
    } else {
      // client_id not changed — still update manual fields if explicitly provided
      if (bodyClientName !== undefined) updates.client_name = bodyClientName?.trim() || null;
      if (bodyClientEmail !== undefined) updates.client_email = bodyClientEmail?.trim() || null;
      if (bodyClientPhone !== undefined) updates.client_phone = bodyClientPhone?.trim() || null;
      if (bodyClientCompany !== undefined) updates.client_company = bodyClientCompany?.trim() || null;
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

      // Use vat_rate/tax_rate from body if provided, otherwise fall back to settings
      const explicitRate = bodyVatRate ?? bodyTaxRate;
      let taxRate: number;
      if (explicitRate != null) {
        taxRate = parseFloat(explicitRate);
      } else {
        const { data: vatSetting } = await supabase
          .from('pyra_settings')
          .select('value')
          .eq('key', 'vat_rate')
          .maybeSingle();
        taxRate = parseFloat(vatSetting?.value || '5');
      }
      // Discount calculation
      const dType = bodyDiscountType ?? existing.discount_type ?? null;
      const dValue = bodyDiscountValue != null ? parseFloat(bodyDiscountValue) : (existing.discount_value || 0);
      let dAmount = 0;
      if (dType === 'percentage' && dValue > 0) {
        dAmount = Math.round(subtotal * (dValue / 100) * 100) / 100;
      } else if (dType === 'fixed' && dValue > 0) {
        dAmount = Math.min(dValue, subtotal);
      }

      const taxableAmount = subtotal - dAmount;
      const taxAmount = taxableAmount * (taxRate / 100);

      updates.subtotal = subtotal;
      updates.tax_rate = taxRate;
      updates.tax_amount = taxAmount;
      updates.total = taxableAmount + taxAmount;
      updates.discount_type = dType;
      updates.discount_value = dValue;
      updates.discount_amount = dAmount;

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
    } else if ((bodyVatRate ?? bodyTaxRate) != null || bodyDiscountType !== undefined || bodyDiscountValue !== undefined) {
      // VAT rate or discount changed but items not re-sent — recalculate using existing subtotal
      const { data: currentQuote } = await supabase
        .from('pyra_quotes')
        .select('subtotal, discount_type, discount_value')
        .eq('id', id)
        .single();

      if (currentQuote) {
        const taxRate = (bodyVatRate ?? bodyTaxRate) != null
          ? parseFloat(bodyVatRate ?? bodyTaxRate)
          : (existing.tax_rate || 5);
        const sub = currentQuote.subtotal || 0;
        const dType = bodyDiscountType !== undefined ? (bodyDiscountType || null) : (currentQuote.discount_type || null);
        const dValue = bodyDiscountValue != null ? parseFloat(bodyDiscountValue) : (currentQuote.discount_value || 0);
        let dAmount = 0;
        if (dType === 'percentage' && dValue > 0) dAmount = Math.round(sub * (dValue / 100) * 100) / 100;
        else if (dType === 'fixed' && dValue > 0) dAmount = Math.min(dValue, sub);
        const taxableAmt = sub - dAmount;
        const taxAmount = taxableAmt * (taxRate / 100);
        updates.tax_rate = taxRate;
        updates.tax_amount = taxAmount;
        updates.total = taxableAmt + taxAmount;
        updates.discount_type = dType;
        updates.discount_value = dValue;
        updates.discount_amount = dAmount;
      }
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

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'quote_updated',
      `/dashboard/quotes/${id}`,
      { updated_fields: Object.keys(updates) },
      request.headers.get('x-forwarded-for') || undefined,
    );

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
    const auth = await requireApiPermission('quotes.delete');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);
    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // Fetch quote for scope check
    const { data: existing } = await supabase
      .from('pyra_quotes')
      .select('id, client_id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return apiNotFound('عرض السعر غير موجود');

    // Scope check: non-admins can only delete quotes for their own clients
    if (!scope.isAdmin && !scope.clientIds.includes(existing.client_id)) {
      return apiForbidden();
    }

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

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'quote_deleted',
      `/dashboard/quotes/${id}`,
      { quote_id: id },
      _request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/quotes/[id] error:', err);
    return apiServerError();
  }
}
