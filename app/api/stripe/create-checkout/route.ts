import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import { apiSuccess, apiError, apiValidationError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { getStripeClient } from '@/lib/stripe';
import { logError } from '@/lib/observability/log-error';

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

// Simple in-memory rate limiter
const checkoutRateLimit = new Map<string, { count: number; resetAt: number }>();

function checkRate(key: string, maxPerMinute = 5): boolean {
  const now = Date.now();
  const entry = checkoutRateLimit.get(key);
  if (!entry || now > entry.resetAt) {
    checkoutRateLimit.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= maxPerMinute) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  // Hoisted so the catch block at the end can include user context in the
  // logError call. Stays null if requireApiPermission itself threw before
  // assignment (rare — only if Supabase connection blows up at auth time).
  let authForLogging: ApiAuthResult | null = null;
  try {
    const auth = await requireApiPermission('finance.manage');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const body = await req.json();
    const { invoice_id } = body;

    if (!invoice_id) {
      return apiError('invoice_id is required');
    }

    const supabase = createServiceRoleClient();

    // Fetch invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('pyra_invoices')
      .select('id, invoice_number, amount_due, currency, client_id, contract_id, status')
      .eq('id', invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return apiError('Invoice not found');
    }

    if (invoice.status === 'paid') {
      return apiError('Invoice is already paid');
    }

    // Amount validation with proper rounding
    const amountDue = Math.round(Number(invoice.amount_due) * 100) / 100;
    if (amountDue <= 0) {
      return apiValidationError('لا يوجد مبلغ مستحق على هذه الفاتورة');
    }
    const unitAmount = Math.round(amountDue * 100); // Convert to fils/cents for Stripe

    // Rate limiting
    if (!checkRate(auth.pyraUser.username)) {
      return apiError('تم تجاوز عدد الطلبات المسموح. حاول بعد دقيقة.', 429);
    }

    // Fetch client name and contract_id for metadata
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

    // Resolve contract_id: from invoice directly, or via milestone link
    let contractId = '';
    if (invoice.contract_id) {
      contractId = invoice.contract_id;
    } else {
      const { data: milestone } = await supabase
        .from('pyra_contract_milestones')
        .select('contract_id')
        .eq('invoice_id', invoice.id)
        .maybeSingle();
      if (milestone?.contract_id) contractId = milestone.contract_id;
    }

    // Create Stripe Checkout session with retry + idempotency
    const stripe = await getStripeClient();
    const idempotencyKey = `checkout_${invoice.id}_${Date.now()}`;
    const session = await withRetry(() =>
      stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: invoice.currency.toLowerCase(),
            product_data: {
              name: `Invoice ${invoice.invoice_number}`,
              description: clientName ? `Client: ${clientName}` : undefined,
            },
            unit_amount: unitAmount,
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
          contract_id: contractId,
        },
        // Session metadata does NOT propagate to the payment intent — the
        // payment_intent.payment_failed handler reads intent metadata, so it
        // must be set explicitly here (finance audit 2026-07-02, F-PI-META).
        payment_intent_data: {
          metadata: {
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            client_id: invoice.client_id || '',
          },
        },
      }, {
        idempotencyKey,
      })
    );

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
    // Phase 14.1 Commit 2 — payment session creation failure = lost sale.
    // Log with user context for triage.
    logError({
      error,
      request: req,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { source: 'stripe', action: 'create-checkout' },
    });
    console.error('[Stripe Create Checkout] Error:', error);
    return apiServerError();
  }
}
