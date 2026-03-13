import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { INVOICE_FIELDS } from '@/lib/supabase/fields';
import { resolveUserScope } from '@/lib/auth/scope';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/invoices/[id]
 * Get a single invoice with items and payments.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('invoices.view');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);
    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: invoice, error } = await supabase
      .from('pyra_invoices')
      .select(INVOICE_FIELDS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Invoice fetch error:', error);
      return apiServerError();
    }
    if (!invoice) return apiNotFound('الفاتورة غير موجودة');

    // Scope check: non-admins can only view invoices for their accessible clients
    if (!scope.isAdmin) {
      if (!invoice.client_id || !scope.clientIds.includes(invoice.client_id)) {
        return apiForbidden();
      }
    }

    // Get items
    const { data: items } = await supabase
      .from('pyra_invoice_items')
      .select('id, invoice_id, sort_order, description, quantity, rate, amount, created_at')
      .eq('invoice_id', id)
      .order('sort_order', { ascending: true });

    // Get payments
    const { data: payments } = await supabase
      .from('pyra_payments')
      .select('*')
      .eq('invoice_id', id)
      .order('payment_date', { ascending: false });

    // Get contract context if invoice is linked to a milestone
    let contract_summary = null;
    const { data: milestone } = await supabase
      .from('pyra_contract_milestones')
      .select('contract_id, title')
      .eq('invoice_id', id)
      .maybeSingle();

    if (milestone?.contract_id) {
      const { data: contract } = await supabase
        .from('pyra_contracts')
        .select('id, title, total_value, currency, amount_billed, amount_collected')
        .eq('id', milestone.contract_id)
        .maybeSingle();

      if (contract) {
        // Fetch all milestones for this contract
        const { data: allMilestones } = await supabase
          .from('pyra_contract_milestones')
          .select('id, title, amount, status, invoice_id')
          .eq('contract_id', contract.id)
          .order('sort_order', { ascending: true });

        // Get invoice numbers for invoiced milestones
        const invoicedMilestoneIds = (allMilestones || [])
          .filter((m: { invoice_id: string | null }) => m.invoice_id)
          .map((m: { invoice_id: string | null }) => m.invoice_id as string);

        let invoiceNumbers: Record<string, string> = {};
        if (invoicedMilestoneIds.length > 0) {
          const { data: linkedInvoices } = await supabase
            .from('pyra_invoices')
            .select('id, invoice_number')
            .in('id', invoicedMilestoneIds);
          if (linkedInvoices) {
            invoiceNumbers = Object.fromEntries(
              linkedInvoices.map((inv: { id: string; invoice_number: string }) => [inv.id, inv.invoice_number])
            );
          }
        }

        contract_summary = {
          contract_id: contract.id,
          contract_title: contract.title,
          contract_total: contract.total_value,
          contract_currency: contract.currency || 'AED',
          total_billed: contract.amount_billed || 0,
          total_collected: contract.amount_collected || 0,
          remaining: (contract.total_value || 0) - (contract.amount_billed || 0),
          milestones: (allMilestones || []).map((m: { id: string; title: string; amount: number; status: string; invoice_id: string | null }) => ({
            id: m.id,
            title: m.title,
            amount: m.amount,
            status: m.status,
            invoice_id: m.invoice_id,
            invoice_number: m.invoice_id ? invoiceNumbers[m.invoice_id] || null : null,
          })),
        };
      }
    }

    return apiSuccess({ ...invoice, items: items || [], payments: payments || [], contract_summary });
  } catch (err) {
    console.error('GET /api/invoices/[id] error:', err);
    return apiServerError();
  }
}

/**
 * PATCH /api/invoices/[id]
 * Update an invoice and its items.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('invoices.edit');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);
    const { id } = await context.params;
    const body = await request.json();
    const supabase = createServiceRoleClient();

    // Check exists
    const { data: existing } = await supabase
      .from('pyra_invoices')
      .select('id, status, tax_rate, amount_paid, client_id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return apiNotFound('الفاتورة غير موجودة');

    // Scope check: non-admins can only edit invoices for their accessible clients
    if (!scope.isAdmin) {
      if (!existing.client_id || !scope.clientIds.includes(existing.client_id)) {
        return apiForbidden();
      }
    }

    // Only draft/sent/overdue invoices can be edited
    const editableStatuses = ['draft', 'sent', 'overdue'];
    if (!editableStatuses.includes(existing.status)) {
      return apiValidationError('لا يمكن تعديل هذه الفاتورة (مدفوعة أو ملغاة)');
    }

    const { items, status, ...updateFields } = body;

    // Build update object
    const updates: Record<string, unknown> = {
      ...updateFields,
      updated_at: new Date().toISOString(),
    };

    // ── Validate state transition ────────────────────
    if (status !== undefined && status !== existing.status) {
      const VALID_TRANSITIONS: Record<string, string[]> = {
        draft: ['cancelled'],
        sent: ['draft', 'cancelled'],
        overdue: ['draft', 'cancelled'],
      };

      const allowedNextStates = VALID_TRANSITIONS[existing.status] || [];
      if (!allowedNextStates.includes(status)) {
        return apiValidationError(
          `لا يمكن تغيير الحالة من "${existing.status}" إلى "${status}"`
        );
      }
      updates.status = status;
    }

    // Recalculate totals if items provided
    if (items && Array.isArray(items)) {
      if (items.length === 0) {
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

      // Delete old items then insert new ones
      await supabase.from('pyra_invoice_items').delete().eq('invoice_id', id);

      const processedItems = items.map(
        (item: { description: string; quantity: number; rate: number }, idx: number) => ({
          id: generateId('ii'),
          invoice_id: id,
          sort_order: idx + 1,
          description: item.description?.trim() || '',
          quantity: item.quantity,
          rate: item.rate,
          amount: item.quantity * item.rate,
        })
      );

      const { error: itemsErr } = await supabase
        .from('pyra_invoice_items')
        .insert(processedItems);
      if (itemsErr) console.error('Invoice items insert error:', itemsErr);

      const subtotal = processedItems.reduce(
        (sum: number, i: { amount: number }) => sum + i.amount,
        0
      );

      const effectiveTaxRate = updates.tax_rate ?? existing.tax_rate ?? 5;
      const taxAmount = subtotal * ((effectiveTaxRate as number) / 100);
      const total = subtotal + taxAmount;
      const amountPaid = existing.amount_paid ?? 0;

      updates.subtotal = subtotal;
      updates.tax_rate = effectiveTaxRate;
      updates.tax_amount = taxAmount;
      updates.total = total;
      updates.amount_due = total - amountPaid;
    }

    const { data: invoice, error: updateError } = await supabase
      .from('pyra_invoices')
      .update(updates)
      .eq('id', id)
      .select(INVOICE_FIELDS)
      .single();

    if (updateError) {
      console.error('Invoice update error:', updateError);
      return apiServerError();
    }

    // Get updated items
    const { data: updatedItems } = await supabase
      .from('pyra_invoice_items')
      .select('id, invoice_id, sort_order, description, quantity, rate, amount, created_at')
      .eq('invoice_id', id)
      .order('sort_order', { ascending: true });

    return apiSuccess({ ...invoice, items: updatedItems || [] });
  } catch (err) {
    console.error('PATCH /api/invoices/[id] error:', err);
    return apiServerError();
  }
}

/**
 * DELETE /api/invoices/[id]
 * Delete a draft invoice (cascade deletes items).
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('invoices.delete');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);
    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: existing } = await supabase
      .from('pyra_invoices')
      .select('id, status, invoice_number, client_id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return apiNotFound('الفاتورة غير موجودة');

    // Scope check: non-admins can only delete invoices for their accessible clients
    if (!scope.isAdmin) {
      if (!existing.client_id || !scope.clientIds.includes(existing.client_id)) {
        return apiForbidden();
      }
    }

    if (existing.status !== 'draft') {
      return apiValidationError('لا يمكن حذف فاتورة غير مسودة');
    }

    // Delete items first
    const { error: itemsDelErr } = await supabase
      .from('pyra_invoice_items')
      .delete()
      .eq('invoice_id', id);
    if (itemsDelErr) console.error('Invoice items delete error:', itemsDelErr);

    const { error } = await supabase
      .from('pyra_invoices')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Invoice delete error:', error);
      return apiServerError();
    }

    return apiSuccess({ deleted: true });
  } catch (err) {
    console.error('DELETE /api/invoices/[id] error:', err);
    return apiServerError();
  }
}
