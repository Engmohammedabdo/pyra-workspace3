import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { generateNextQuoteNumber } from '@/lib/utils/quote-number';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/quotes/[id]/duplicate
 * Duplicate a quote with new number, reset to draft.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiUnauthorized();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // Get original quote
    const { data: original } = await supabase
      .from('pyra_quotes')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!original) return apiNotFound('عرض السعر غير موجود');

    // Get original items
    const { data: originalItems } = await supabase
      .from('pyra_quote_items')
      .select('description, quantity, rate, amount, sort_order')
      .eq('quote_id', id)
      .order('sort_order', { ascending: true });

    // Generate new quote number atomically (race-condition safe)
    const quoteNumber = await generateNextQuoteNumber(supabase);
    const newId = generateId('qt');
    const today = new Date().toISOString().split('T')[0];

    // Insert duplicate
    const { data: newQuote, error } = await supabase
      .from('pyra_quotes')
      .insert({
        id: newId,
        quote_number: quoteNumber,
        team_id: original.team_id,
        client_id: original.client_id,
        project_name: original.project_name,
        status: 'draft',
        estimate_date: today,
        expiry_date: original.expiry_date,
        currency: original.currency,
        subtotal: original.subtotal,
        tax_rate: original.tax_rate,
        tax_amount: original.tax_amount,
        total: original.total,
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
        signature_data: null,
        signed_by: null,
        signed_at: null,
        signed_ip: null,
        sent_at: null,
        viewed_at: null,
        created_by: admin.pyraUser.username,
      })
      .select('id, quote_number, status, total, created_at')
      .single();

    if (error) {
      console.error('Quote duplicate error:', error);
      return apiServerError();
    }

    // Duplicate items
    if (originalItems && originalItems.length > 0) {
      const newItems = originalItems.map((item, idx) => ({
        id: generateId('qi'),
        quote_id: newId,
        sort_order: idx + 1,
        description: item.description,
        quantity: item.quantity,
        rate: item.rate,
        amount: item.amount,
      }));

      await supabase.from('pyra_quote_items').insert(newItems);
    }

    return apiSuccess(newQuote, undefined, 201);
  } catch (err) {
    console.error('POST /api/quotes/[id]/duplicate error:', err);
    return apiServerError();
  }
}
