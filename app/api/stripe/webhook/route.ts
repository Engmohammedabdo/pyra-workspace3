import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { getStripe } from '@/lib/stripe';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/webhook
 * Stripe webhook handler — NO auth check (Stripe sends this directly).
 * Raw body is read with request.text() for signature verification.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const sig = req.headers.get('stripe-signature');

    let event: Stripe.Event;

    // Verify webhook signature if secret is configured
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      if (!sig) {
        return NextResponse.json(
          { error: 'Missing stripe-signature header' },
          { status: 400 }
        );
      }
      event = getStripe().webhooks.constructEvent(
        body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } else {
      // No webhook secret configured — parse body directly (dev/initial setup)
      console.warn('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature verification');
      event = JSON.parse(body) as Stripe.Event;
    }

    const supabase = createServiceRoleClient();

    // ── Handle: checkout.session.completed ──────────────────────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const invoiceId = session.metadata?.invoice_id;
      const clientId = session.metadata?.client_id;
      const paymentIntentId = (session.payment_intent as string) || null;

      if (!invoiceId) {
        console.error('[Stripe Webhook] No invoice_id in session metadata');
        return NextResponse.json({ error: 'Missing invoice_id' }, { status: 400 });
      }

      // 1. Update stripe payment record
      await supabase
        .from('pyra_stripe_payments')
        .update({
          stripe_payment_intent_id: paymentIntentId,
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_session_id', session.id);

      // 2. Fetch current invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('pyra_invoices')
        .select('id, status, total, amount_paid, amount_due, invoice_number, client_id')
        .eq('id', invoiceId)
        .single();

      if (invoiceError || !invoice) {
        console.error('[Stripe Webhook] Invoice not found:', invoiceId);
        return NextResponse.json({ error: 'Invoice not found' }, { status: 400 });
      }

      // 3. Calculate payment amount and new totals
      const paymentAmount = (session.amount_total || 0) / 100;
      const newAmountPaid = (invoice.amount_paid || 0) + paymentAmount;
      const newAmountDue = invoice.total - newAmountPaid;
      const newStatus = newAmountDue <= 0 ? 'paid' : 'partially_paid';

      // 4. Insert payment record (same pattern as /api/invoices/[id]/payments)
      await supabase.from('pyra_payments').insert({
        id: generateId('pay'),
        invoice_id: invoiceId,
        amount: paymentAmount,
        payment_date: new Date().toISOString().split('T')[0],
        method: 'online',
        reference: paymentIntentId,
        notes: 'Stripe online payment',
        recorded_by: 'system',
      });

      // 5. Update invoice amounts
      await supabase
        .from('pyra_invoices')
        .update({
          amount_paid: newAmountPaid,
          amount_due: Math.max(0, newAmountDue),
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);

      // 6. Create client notification
      if (clientId) {
        await supabase.from('pyra_client_notifications').insert({
          id: generateId('cn'),
          client_id: clientId,
          type: 'payment_confirmed',
          title: 'تم استلام الدفع',
          message: `تم استلام دفعتك للفاتورة ${invoice.invoice_number} بنجاح بمبلغ ${paymentAmount} ${session.currency?.toUpperCase() || 'SAR'}`,
          is_read: false,
        });
      }

      // 7. Log activity
      await supabase.from('pyra_activity_log').insert({
        id: generateId('log'),
        action_type: 'payment_recorded',
        username: 'system',
        display_name: 'النظام',
        target_path: `/dashboard/invoices/${invoiceId}`,
        details: {
          invoice_number: invoice.invoice_number,
          amount: paymentAmount,
          method: 'online',
          payment_intent: paymentIntentId,
          client_id: clientId || null,
          new_status: newStatus,
          source: 'stripe_webhook',
        },
        ip_address: 'stripe_webhook',
      });

      console.log(`[Stripe Webhook] Payment processed: invoice=${invoiceId}, amount=${paymentAmount}, status=${newStatus}`);
    }

    // ── Handle: checkout.session.expired ────────────────────────
    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session;

      await supabase
        .from('pyra_stripe_payments')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_session_id', session.id);

      console.log(`[Stripe Webhook] Session expired: ${session.id}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    );
  }
}
