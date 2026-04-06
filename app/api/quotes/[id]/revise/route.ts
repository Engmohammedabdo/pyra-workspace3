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
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { generateNextQuoteNumber } from '@/lib/utils/quote-number';
import { QUOTE_FIELDS } from '@/lib/supabase/fields';
import { QUOTE_STATUS } from '@/lib/constants/statuses';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/quotes/[id]/revise
 * Create a new revision of an existing quote.
 * Copies all data, bumps version, links to parent.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('quotes.create');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);
    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // Fetch original quote
    const { data: original } = await supabase
      .from('pyra_quotes')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!original) return apiNotFound('عرض السعر غير موجود');

    // Q5: Scope check — non-admins can only revise quotes for their own clients
    if (!scope.isAdmin && !scope.clientIds.includes(original.client_id)) {
      return apiForbidden('لا يمكنك مراجعة عرض سعر لعميل غير مسند إليك');
    }

    // Only allow revisions of sent/viewed/expired/rejected quotes
    const revisableStatuses = [QUOTE_STATUS.SENT, QUOTE_STATUS.VIEWED, QUOTE_STATUS.EXPIRED, QUOTE_STATUS.REJECTED, QUOTE_STATUS.CANCELLED];
    if (!revisableStatuses.includes(original.status)) {
      return apiValidationError(
        `لا يمكن إنشاء مراجعة من عرض بحالة "${original.status}"`
      );
    }

    // Determine version: find the highest version in the chain
    const rootId = original.parent_quote_id || original.id;
    const { data: siblings } = await supabase
      .from('pyra_quotes')
      .select('version')
      .or(`id.eq.${rootId},parent_quote_id.eq.${rootId}`)
      .order('version', { ascending: false })
      .limit(1);

    const nextVersion = (siblings?.[0]?.version || original.version || 1) + 1;

    // Fetch original items
    const { data: originalItems } = await supabase
      .from('pyra_quote_items')
      .select('*')
      .eq('quote_id', id)
      .order('sort_order', { ascending: true });

    // Generate new quote number
    const quoteNumber = await generateNextQuoteNumber(supabase);
    const newId = generateId('qt');

    // Create revised quote
    const { data: revised, error: insertError } = await supabase
      .from('pyra_quotes')
      .insert({
        id: newId,
        quote_number: quoteNumber,
        parent_quote_id: rootId,
        version: nextVersion,
        client_id: original.client_id,
        lead_id: original.lead_id,
        project_name: original.project_name,
        status: QUOTE_STATUS.DRAFT,
        estimate_date: new Date().toISOString().split('T')[0],
        expiry_date: original.expiry_date,
        currency: original.currency,
        subtotal: original.subtotal,
        tax_rate: original.tax_rate,
        tax_amount: original.tax_amount,
        total: original.total,
        discount_type: original.discount_type,
        discount_value: original.discount_value,
        discount_amount: original.discount_amount,
        notes: original.notes,
        terms_conditions: original.terms_conditions,
        bank_details: original.bank_details,
        company_name: original.company_name,
        company_logo: original.company_logo,
        client_name: original.client_name,
        client_email: original.client_email,
        client_company: original.client_company,
        client_phone: original.client_phone,
        client_address: original.client_address,
        created_by: auth.pyraUser.username,
      })
      .select(QUOTE_FIELDS)
      .single();

    if (insertError) {
      console.error('Quote revision insert error:', insertError);
      return apiServerError();
    }

    // Copy items
    if (originalItems && originalItems.length > 0) {
      const newItems = originalItems.map(
        (item: { sort_order: number; description: string; quantity: number; rate: number; amount: number }) => ({
          id: generateId('qi'),
          quote_id: newId,
          sort_order: item.sort_order,
          description: item.description,
          quantity: item.quantity,
          rate: item.rate,
          amount: item.amount,
        })
      );

      const { error: itemsErr } = await supabase.from('pyra_quote_items').insert(newItems);
      if (itemsErr) console.error('Quote revision items error:', itemsErr);
    }

    // Cancel the original quote
    await supabase
      .from('pyra_quotes')
      .update({ status: QUOTE_STATUS.CANCELLED, updated_at: new Date().toISOString() })
      .eq('id', id);

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'quote_revised',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/quotes/${newId}`,
      details: {
        original_quote: original.quote_number,
        new_quote: quoteNumber,
        version: nextVersion,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(revised, undefined, 201);
  } catch (err) {
    console.error('POST /api/quotes/[id]/revise error:', err);
    return apiServerError();
  }
}
