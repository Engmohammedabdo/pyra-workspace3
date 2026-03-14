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

    // Verify webhook signature — REQUIRED in production
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set — refusing to process');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }
    if (!sig) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret);

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

      // 3. Calculate payment amount
      const paymentAmount = (session.amount_total || 0) / 100;

      // 4. Idempotency check — prevent duplicate payment records on webhook replay
      const { data: existingPayment } = await supabase
        .from('pyra_payments')
        .select('id')
        .eq('invoice_id', invoiceId)
        .eq('reference', paymentIntentId)
        .maybeSingle();

      if (existingPayment) {
        console.log(`[Stripe Webhook] Payment already recorded for intent=${paymentIntentId}, skipping`);
        return NextResponse.json({ received: true });
      }

      // 5. Insert payment record
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

      // 6. Sum ALL payments for this invoice (race-condition safe)
      const { data: allPayments } = await supabase
        .from('pyra_payments')
        .select('amount')
        .eq('invoice_id', invoiceId);
      const newAmountPaid = (allPayments || []).reduce(
        (sum: number, p: { amount: number }) => sum + Number(p.amount), 0
      );
      const newAmountDue = invoice.total - newAmountPaid;
      const newStatus = newAmountDue <= 0 ? 'paid' : 'partially_paid';

      // 6. Update invoice amounts
      await supabase
        .from('pyra_invoices')
        .update({
          amount_paid: newAmountPaid,
          amount_due: Math.max(0, newAmountDue),
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);

      // 7. Create client notification
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

      // 8. Log activity
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

      // 9. Update contract amount_collected (retainer or milestone)
      const contractIdFromMeta = session.metadata?.contract_id;
      // Resolve contract_id: from metadata, from invoice, or from milestone link
      let resolvedContractId = contractIdFromMeta || null;
      if (!resolvedContractId) {
        // Check direct contract_id on invoice
        const { data: invContract } = await supabase
          .from('pyra_invoices')
          .select('contract_id')
          .eq('id', invoiceId)
          .maybeSingle();
        if (invContract?.contract_id) {
          resolvedContractId = invContract.contract_id;
        } else {
          // Check milestone link
          const { data: milestone } = await supabase
            .from('pyra_contract_milestones')
            .select('contract_id')
            .eq('invoice_id', invoiceId)
            .maybeSingle();
          if (milestone?.contract_id) resolvedContractId = milestone.contract_id;
        }
      }

      if (resolvedContractId) {
        // Sum all payments for all invoices linked to this contract (race-safe)
        const { data: contractInvoices } = await supabase
          .from('pyra_invoices')
          .select('id')
          .eq('contract_id', resolvedContractId);

        // Also include milestone-linked invoices
        const { data: milestoneInvoices } = await supabase
          .from('pyra_contract_milestones')
          .select('invoice_id')
          .eq('contract_id', resolvedContractId)
          .not('invoice_id', 'is', null);

        const allInvoiceIds = new Set<string>();
        (contractInvoices || []).forEach((i: { id: string }) => allInvoiceIds.add(i.id));
        (milestoneInvoices || []).forEach((m: { invoice_id: string | null }) => {
          if (m.invoice_id) allInvoiceIds.add(m.invoice_id);
        });

        if (allInvoiceIds.size > 0) {
          const { data: allContractPayments } = await supabase
            .from('pyra_payments')
            .select('amount')
            .in('invoice_id', Array.from(allInvoiceIds));

          const totalCollected = (allContractPayments || []).reduce(
            (sum: number, p: { amount: number }) => sum + Number(p.amount), 0
          );

          await supabase
            .from('pyra_contracts')
            .update({ amount_collected: totalCollected, updated_at: new Date().toISOString() })
            .eq('id', resolvedContractId);

          console.log(`[Stripe Webhook] Contract ${resolvedContractId} amount_collected updated to ${totalCollected}`);
        }
      }

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

    // ── Handle: charge.refunded ─────────────────────────────────
    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = (charge.payment_intent as string) || null;
      const refundAmount = (charge.amount_refunded || 0) / 100;
      const currency = charge.currency?.toUpperCase() || 'AED';

      if (paymentIntentId) {
        // Find the stripe payment record via payment_intent
        const { data: stripePayment } = await supabase
          .from('pyra_stripe_payments')
          .select('id, invoice_id, client_id')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .maybeSingle();

        if (stripePayment) {
          // Update stripe payment status
          await supabase
            .from('pyra_stripe_payments')
            .update({ status: 'refunded', updated_at: new Date().toISOString() })
            .eq('id', stripePayment.id);

          if (stripePayment.invoice_id) {
            // Insert negative payment record (refund)
            await supabase.from('pyra_payments').insert({
              id: generateId('pay'),
              invoice_id: stripePayment.invoice_id,
              amount: -refundAmount,
              payment_date: new Date().toISOString().split('T')[0],
              method: 'refund',
              reference: `refund_${paymentIntentId}`,
              notes: `استرجاع Stripe — ${refundAmount} ${currency}`,
              recorded_by: 'system',
            });

            // Recalculate invoice amounts
            const { data: allPayments } = await supabase
              .from('pyra_payments')
              .select('amount')
              .eq('invoice_id', stripePayment.invoice_id);
            const newAmountPaid = (allPayments || []).reduce(
              (sum: number, p: { amount: number }) => sum + Number(p.amount), 0
            );

            const { data: invoice } = await supabase
              .from('pyra_invoices')
              .select('total, invoice_number')
              .eq('id', stripePayment.invoice_id)
              .maybeSingle();

            if (invoice) {
              const newAmountDue = invoice.total - newAmountPaid;
              const newStatus = newAmountPaid <= 0 ? 'sent' : (newAmountDue <= 0 ? 'paid' : 'partially_paid');

              await supabase
                .from('pyra_invoices')
                .update({
                  amount_paid: Math.max(0, newAmountPaid),
                  amount_due: Math.max(0, newAmountDue),
                  status: newStatus,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', stripePayment.invoice_id);

              // Notify client
              if (stripePayment.client_id) {
                void supabase.from('pyra_client_notifications').insert({
                  id: generateId('cn'),
                  client_id: stripePayment.client_id,
                  type: 'payment_refunded',
                  title: 'تم استرجاع المبلغ',
                  message: `تم استرجاع ${refundAmount} ${currency} للفاتورة ${invoice.invoice_number}`,
                  is_read: false,
                });
              }

              // Log activity
              void supabase.from('pyra_activity_log').insert({
                id: generateId('log'),
                action_type: 'payment_refunded',
                username: 'system',
                display_name: 'النظام',
                target_path: `/dashboard/invoices/${stripePayment.invoice_id}`,
                details: {
                  invoice_number: invoice.invoice_number,
                  refund_amount: refundAmount,
                  currency,
                  payment_intent: paymentIntentId,
                  new_status: newStatus,
                  source: 'stripe_webhook',
                },
                ip_address: 'stripe_webhook',
              });
            }
          }
        }
      }

      console.log(`[Stripe Webhook] Refund processed: intent=${paymentIntentId}, amount=${refundAmount}`);
    }

    // ── Handle: charge.dispute.created ───────────────────────────
    if (event.type === 'charge.dispute.created') {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = (dispute.charge as string) || null;
      const disputeAmount = (dispute.amount || 0) / 100;
      const currency = dispute.currency?.toUpperCase() || 'AED';
      const reason = dispute.reason || 'unknown';
      const paymentIntentId = (dispute.payment_intent as string) || null;

      if (paymentIntentId) {
        // Find related stripe payment
        const { data: stripePayment } = await supabase
          .from('pyra_stripe_payments')
          .select('id, invoice_id, client_id')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .maybeSingle();

        if (stripePayment) {
          // Update stripe payment status to disputed
          await supabase
            .from('pyra_stripe_payments')
            .update({
              status: 'disputed',
              metadata: { dispute_id: dispute.id, dispute_reason: reason, dispute_amount: disputeAmount },
              updated_at: new Date().toISOString(),
            })
            .eq('id', stripePayment.id);

          // Create admin notification (critical alert)
          void supabase.from('pyra_notifications').insert({
            id: generateId('nt'),
            recipient_username: 'admin',
            type: 'dispute_created',
            title: '⚠️ نزاع دفع جديد',
            message: `تم فتح نزاع بقيمة ${disputeAmount} ${currency} — السبب: ${reason}`,
            source_username: 'system',
            source_display_name: 'Stripe',
            target_path: stripePayment.invoice_id ? `/dashboard/invoices/${stripePayment.invoice_id}` : '/dashboard/finance',
            is_read: false,
          });
        }
      }

      // Log activity
      void supabase.from('pyra_activity_log').insert({
        id: generateId('log'),
        action_type: 'stripe_dispute_created',
        username: 'system',
        display_name: 'النظام',
        target_path: '/dashboard/finance',
        details: {
          dispute_id: dispute.id,
          charge_id: chargeId,
          payment_intent: paymentIntentId,
          amount: disputeAmount,
          currency,
          reason,
          status: dispute.status,
          source: 'stripe_webhook',
        },
        ip_address: 'stripe_webhook',
      });

      console.log(`[Stripe Webhook] Dispute created: dispute=${dispute.id}, amount=${disputeAmount}, reason=${reason}`);
    }

    // ── Handle: charge.dispute.closed ────────────────────────────
    if (event.type === 'charge.dispute.closed') {
      const dispute = event.data.object as Stripe.Dispute;
      const paymentIntentId = (dispute.payment_intent as string) || null;
      const outcome = dispute.status; // won, lost, etc.

      if (paymentIntentId) {
        const { data: stripePayment } = await supabase
          .from('pyra_stripe_payments')
          .select('id, invoice_id')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .maybeSingle();

        if (stripePayment) {
          // If dispute lost, status stays disputed; if won, restore to completed
          const newStatus = outcome === 'won' ? 'completed' : 'disputed';
          await supabase
            .from('pyra_stripe_payments')
            .update({
              status: newStatus,
              metadata: { dispute_id: dispute.id, dispute_outcome: outcome },
              updated_at: new Date().toISOString(),
            })
            .eq('id', stripePayment.id);

          // If dispute lost and invoice exists, update invoice amounts
          if (outcome === 'lost' && stripePayment.invoice_id) {
            const disputeAmount = (dispute.amount || 0) / 100;

            // Insert negative payment (like refund due to lost dispute)
            await supabase.from('pyra_payments').insert({
              id: generateId('pay'),
              invoice_id: stripePayment.invoice_id,
              amount: -disputeAmount,
              payment_date: new Date().toISOString().split('T')[0],
              method: 'dispute_lost',
              reference: `dispute_${dispute.id}`,
              notes: `خسارة نزاع Stripe — ${disputeAmount} ${dispute.currency?.toUpperCase() || 'AED'}`,
              recorded_by: 'system',
            });

            // Recalculate invoice
            const { data: allPayments } = await supabase
              .from('pyra_payments')
              .select('amount')
              .eq('invoice_id', stripePayment.invoice_id);
            const newAmountPaid = Math.max(0, (allPayments || []).reduce(
              (sum: number, p: { amount: number }) => sum + Number(p.amount), 0
            ));

            const { data: invoice } = await supabase
              .from('pyra_invoices')
              .select('total')
              .eq('id', stripePayment.invoice_id)
              .maybeSingle();

            if (invoice) {
              const newAmountDue = Math.max(0, invoice.total - newAmountPaid);
              await supabase
                .from('pyra_invoices')
                .update({
                  amount_paid: newAmountPaid,
                  amount_due: newAmountDue,
                  status: newAmountPaid <= 0 ? 'sent' : (newAmountDue <= 0 ? 'paid' : 'partially_paid'),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', stripePayment.invoice_id);
            }
          }

          // Admin notification
          void supabase.from('pyra_notifications').insert({
            id: generateId('nt'),
            recipient_username: 'admin',
            type: 'dispute_closed',
            title: outcome === 'won' ? '✅ تم كسب النزاع' : '❌ تم خسارة النزاع',
            message: `النزاع ${dispute.id} انتهى — النتيجة: ${outcome}`,
            source_username: 'system',
            source_display_name: 'Stripe',
            target_path: stripePayment.invoice_id ? `/dashboard/invoices/${stripePayment.invoice_id}` : '/dashboard/finance',
            is_read: false,
          });
        }
      }

      void supabase.from('pyra_activity_log').insert({
        id: generateId('log'),
        action_type: 'stripe_dispute_closed',
        username: 'system',
        display_name: 'النظام',
        target_path: '/dashboard/finance',
        details: { dispute_id: dispute.id, outcome, source: 'stripe_webhook' },
        ip_address: 'stripe_webhook',
      });

      console.log(`[Stripe Webhook] Dispute closed: dispute=${dispute.id}, outcome=${outcome}`);
    }

    // ── Handle: payment_intent.payment_failed ────────────────────
    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const failureMessage = paymentIntent.last_payment_error?.message || 'Unknown error';
      const failureCode = paymentIntent.last_payment_error?.code || 'unknown';
      const invoiceId = paymentIntent.metadata?.invoice_id;
      const clientId = paymentIntent.metadata?.client_id;

      // Update stripe payment record
      if (paymentIntent.id) {
        await supabase
          .from('pyra_stripe_payments')
          .update({
            status: 'failed',
            metadata: { failure_message: failureMessage, failure_code: failureCode },
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_payment_intent_id', paymentIntent.id);
      }

      // Notify client about failed payment
      if (clientId && invoiceId) {
        const { data: invoice } = await supabase
          .from('pyra_invoices')
          .select('invoice_number')
          .eq('id', invoiceId)
          .maybeSingle();

        void supabase.from('pyra_client_notifications').insert({
          id: generateId('cn'),
          client_id: clientId,
          type: 'payment_failed',
          title: 'فشل عملية الدفع',
          message: `فشلت عملية الدفع للفاتورة ${invoice?.invoice_number || invoiceId}. يرجى المحاولة مرة أخرى.`,
          is_read: false,
        });
      }

      // Admin notification
      void supabase.from('pyra_notifications').insert({
        id: generateId('nt'),
        recipient_username: 'admin',
        type: 'payment_failed',
        title: 'فشل دفع إلكتروني',
        message: `فشل الدفع — ${failureMessage}`,
        source_username: 'system',
        source_display_name: 'Stripe',
        target_path: invoiceId ? `/dashboard/invoices/${invoiceId}` : '/dashboard/finance',
        is_read: false,
      });

      // Log activity
      void supabase.from('pyra_activity_log').insert({
        id: generateId('log'),
        action_type: 'payment_failed',
        username: 'system',
        display_name: 'النظام',
        target_path: invoiceId ? `/dashboard/invoices/${invoiceId}` : '/dashboard/finance',
        details: {
          payment_intent: paymentIntent.id,
          invoice_id: invoiceId || null,
          failure_code: failureCode,
          failure_message: failureMessage,
          source: 'stripe_webhook',
        },
        ip_address: 'stripe_webhook',
      });

      console.log(`[Stripe Webhook] Payment failed: intent=${paymentIntent.id}, error=${failureCode}: ${failureMessage}`);
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
