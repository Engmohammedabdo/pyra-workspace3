import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { getStripe } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('finance.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json();
    const { invoice_id } = body;

    if (!invoice_id) {
      return apiError('invoice_id is required');
    }

    const supabase = createServiceRoleClient();

    // Fetch invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('pyra_invoices')
      .select('id, invoice_number, amount_due, currency, client_id, status')
      .eq('id', invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return apiError('Invoice not found');
    }

    if (invoice.amount_due <= 0) {
      return apiError('Invoice has no amount due');
    }

    if (invoice.status === 'paid') {
      return apiError('Invoice is already paid');
    }

    // Fetch client name if client_id exists
    let clientName: string | null = null;
    if (invoice.client_id) {
      const { data: client } = await supabase
        .from('pyra_clients')
        .select('name')
        .eq('id', invoice.client_id)
        .single();

      if (client) {
        clientName = client.name;
      }
    }

    // Create Stripe Checkout session
    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: invoice.currency.toLowerCase(),
          product_data: {
            name: `Invoice ${invoice.invoice_number}`,
            description: clientName ? `Client: ${clientName}` : undefined,
          },
          unit_amount: Math.round(invoice.amount_due * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/portal/invoices/${invoice_id}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/portal/invoices/${invoice_id}/pay/cancel`,
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        client_id: invoice.client_id || '',
      },
    });

    // Insert payment record
    await supabase.from('pyra_stripe_payments').insert({
      id: generateId('sp'),
      invoice_id: invoice.id,
      stripe_session_id: session.id,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: 'pending',
      client_id: invoice.client_id || null,
      metadata: { checkout_url: session.url },
    });

    return apiSuccess({ checkout_url: session.url, session_id: session.id });
  } catch (error) {
    console.error('[Stripe Create Checkout] Error:', error);
    return apiServerError();
  }
}
