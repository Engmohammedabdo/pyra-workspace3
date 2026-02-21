import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
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

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/invoices/[id]
 * Get a single invoice with items and payments.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

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

    return apiSuccess({ ...invoice, items: items || [], payments: payments || [] });
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
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await context.params;
    const body = await request.json();
    const supabase = createServiceRoleClient();

    // Check exists
    const { data: existing } = await supabase
      .from('pyra_invoices')
      .select('id, status, tax_rate, amount_paid')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return apiNotFound('الفاتورة غير موجودة');

    // Only draft invoices can be fully edited
    if (existing.status !== 'draft') {
      return apiValidationError('لا يمكن تعديل فاتورة غير مسودة');
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

      // Delete old items then insert new ones
      await supabase.from('pyra_invoice_items').delete().eq('invoice_id', id);

      const processedItems = items.map(
        (item: { description: string; quantity: number; rate: number }, idx: number) => ({
          id: generateId('ii'),
          invoice_id: id,
          sort_order: idx + 1,
          description: item.description?.trim() || '',
          quantity: item.quantity || 1,
          rate: item.rate || 0,
          amount: (item.quantity || 1) * (item.rate || 0),
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
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: existing } = await supabase
      .from('pyra_invoices')
      .select('id, status, invoice_number')
      .eq('id', id)
      .maybeSingle();

    if (!existing) return apiNotFound('الفاتورة غير موجودة');
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
