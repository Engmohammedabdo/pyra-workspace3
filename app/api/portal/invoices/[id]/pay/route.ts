import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import {
  apiSuccess,
  apiError,
  apiUnauthorized,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { stripe } from '@/lib/stripe';

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
      .select('id, invoice_number, total, amount_paid, amount_due, currency, client_id, status')
      .eq('id', id)
      .eq('client_id', client.id)
      .maybeSingle();

    if (fetchError) {
      console.error('Portal pay - invoice fetch error:', fetchError);
      return apiServerError();
    }
    if (!invoice) return apiNotFound('الفاتورة غير موجودة');

    // 3. Validate status
    if (['draft', 'cancelled', 'paid'].includes(invoice.status)) {
      return apiError('لا يمكن الدفع لهذه الفاتورة');
    }

    const amountDue = invoice.amount_due;
    if (!amountDue || amountDue <= 0) {
      return apiError('لا يوجد مبلغ مستحق للدفع');
    }

    // 4. Create Stripe Checkout Session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: (invoice.currency || 'SAR').toLowerCase(),
            product_data: {
              name: `Invoice ${invoice.invoice_number}`,
            },
            unit_amount: Math.round(amountDue * 100),
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
      },
      customer_email: client.email,
    });

    // 5. Insert stripe payment record
    const { error: insertError } = await supabase
      .from('pyra_stripe_payments')
      .insert({
        id: generateId('sp'),
        invoice_id: id,
        stripe_session_id: session.id,
        amount: amountDue,
        currency: invoice.currency || 'SAR',
        status: 'pending',
        client_id: client.id,
      });

    if (insertError) {
      console.error('Stripe payment insert error:', insertError);
      // Don't fail — the Stripe session is already created
    }

    // 6. Return checkout URL
    return apiSuccess({ checkout_url: session.url });
  } catch (err) {
    console.error('POST /api/portal/invoices/[id]/pay error:', err);
    return apiServerError();
  }
}
