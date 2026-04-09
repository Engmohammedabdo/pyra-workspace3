import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import {
  apiSuccess,
  apiError,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { getStripeClient } from '@/lib/stripe';

// Simple retry helper for Stripe API failures
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      // Exponential backoff: 1s, 2s
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw new Error('Unreachable');
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/portal/invoices/[id]/pay
 * Portal client initiates a Stripe Checkout session for an invoice.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    // 1. Portal auth
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // 2. Fetch invoice — must belong to this client
    const { data: invoice, error: fetchError } = await supabase
      .from('pyra_invoices')
      .select('id, invoice_number, total, amount_paid, amount_due, currency, client_id, contract_id, status')
      .eq('id', id)
      .eq('client_id', client.id)
      .maybeSingle();

    if (fetchError) {
      console.error('Portal pay - invoice fetch error:', fetchError);
      return apiServerError();
    }
    if (!invoice) return apiNotFound('الفاتورة غير موجودة');

    // 3. Validate status
    if (['draft', 'cancelled', 'paid', 'expired'].includes(invoice.status)) {
      return apiError('لا يمكن الدفع لهذه الفاتورة');
    }

    // Amount validation with proper rounding
    const amountDue = Math.round(Number(invoice.amount_due) * 100) / 100;
    if (!amountDue || amountDue <= 0) {
      return apiValidationError('لا يوجد مبلغ مستحق على هذه الفاتورة');
    }
    const unitAmount = Math.round(amountDue * 100); // Convert to fils/cents for Stripe

    // 4. Resolve contract_id for metadata
    let contractId = '';
    if (invoice.contract_id) {
      contractId = invoice.contract_id;
    } else {
      const { data: milestone } = await supabase
        .from('pyra_contract_milestones')
        .select('contract_id')
        .eq('invoice_id', id)
        .maybeSingle();
      if (milestone?.contract_id) contractId = milestone.contract_id;
    }

    // 5. Create Stripe Checkout Session with retry + idempotency
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const stripe = await getStripeClient();
    const idempotencyKey = `checkout_${invoice.id}_${Date.now()}`;
    const session = await withRetry(() =>
      stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: (invoice.currency || 'AED').toLowerCase(),
              product_data: {
                name: `Invoice ${invoice.invoice_number}`,
              },
              unit_amount: unitAmount,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${appUrl}/portal/invoices/${id}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/portal/invoices/${id}/pay/cancel`,
        metadata: {
          invoice_id: id,
          client_id: client.id,
          contract_id: contractId,
        },
        customer_email: client.email,
      }, {
        idempotencyKey,
      })
    );

    // 6. Insert stripe payment record
    const { error: insertError } = await supabase
      .from('pyra_stripe_payments')
      .insert({
        id: generateId('sp'),
        invoice_id: id,
        stripe_session_id: session.id,
        amount: amountDue,
        currency: invoice.currency || 'AED',
        status: 'pending',
        client_id: client.id,
      });

    if (insertError) {
      console.error('Stripe payment insert error:', insertError);
      // Don't fail — the Stripe session is already created
    }

    // 7. Return checkout URL
    return apiSuccess({ checkout_url: session.url });
  } catch (err) {
    console.error('POST /api/portal/invoices/[id]/pay error:', err);
    return apiServerError();
  }
}
