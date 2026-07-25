import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { dubaiDayKey } from '@/lib/utils/format';
import { getStripeClient, getStripeWebhookSecret } from '@/lib/stripe';
import { logError } from '@/lib/observability/log-error';
import { notifyMany, type NotifyInput } from '@/lib/notifications/notify';
import { settleInvoicePayment, splitGross, recalcContractCollected, deriveInvoiceState } from '@/lib/stripe/settle';
import Stripe from 'stripe';

/**
 * Notify all active admins. The previous direct inserts addressed a literal
 * user named 'admin' which does not exist — dispute/failure alerts were
 * invisible (finance audit 2026-07-02, F-ADMIN-GHOST).
 */
async function notifyAdmins(
  supabase: SupabaseClient,
  input: Omit<NotifyInput, 'to'>
): Promise<void> {
  const { data: admins } = await supabase
    .from('pyra_users')
    .select('username')
    .eq('role', 'admin')
    .eq('status', 'active');
  const usernames = (admins || []).map((a: { username: string }) => a.username);
  if (usernames.length === 0) {
    console.error('[Stripe Webhook] No active admin users found for notification');
    return;
  }
  await notifyMany(supabase, usernames, input);
}

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
    const webhookSecret = await getStripeWebhookSecret();
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
    const stripe = await getStripeClient();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);

    const supabase = createServiceRoleClient();

    // ── Handle: checkout.session.completed / async_payment_succeeded ──
    //
    // Both events settle a session the same way. They are separate because
    // ASYNCHRONOUS payment methods (SEPA debit, Bacs, bank redirects, konbini…)
    // fire `completed` while payment_status is still 'unpaid' — the customer has
    // committed but the funds have not arrived. Only `async_payment_succeeded`
    // means the money actually landed.
    //
    // Dynamic payment methods are now enabled (the card-only pin was removed),
    // so async methods are reachable: this guard is load-bearing, not defensive.
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const invoiceId = session.metadata?.invoice_id;
      const clientId = session.metadata?.client_id;
      const paymentIntentId = (session.payment_intent as string) || null;
      // Idempotency reference: payment_intent is always present for paid card
      // sessions, but fall back to the session id so a null intent can never
      // bypass the duplicate check (PostgREST .eq(null) matches nothing).
      const paymentRef = paymentIntentId || `session_${session.id}`;

      // NEVER book money for a session Stripe has not marked paid.
      if (session.payment_status !== 'paid') {
        const { error: pendErr } = await supabase
          .from('pyra_stripe_payments')
          .update({ status: 'pending', updated_at: new Date().toISOString() })
          .eq('stripe_session_id', session.id);
        if (pendErr) {
          logError({
            severity: 'warning', error: pendErr, request: req,
            metadata: { source: 'stripe_webhook', step: 'await_async', session_id: session.id },
          });
        }
        console.log(
          `[Stripe Webhook] Session ${session.id} completed but payment_status=${session.payment_status} — awaiting async_payment_succeeded`,
        );
        return NextResponse.json({ received: true, awaiting: session.payment_status });
      }

      if (!invoiceId) {
        // Unprocessable but NOT retryable: a Stripe Dashboard "send test webhook",
        // or a session minted outside this app, will never gain an invoice_id.
        // Returning 400 made Stripe retry it for days, and sustained delivery
        // failure is what auto-disables an endpoint — which is how this endpoint
        // came to be disabled (found 2026-07-25: zero events ever settled).
        // ACK it so it cannot poison the endpoint, but leave a trail.
        logError({
          severity: 'warning',
          error: new Error('Checkout session has no invoice_id metadata'),
          request: req,
          metadata: { source: 'stripe_webhook', event: event.type, session_id: session.id },
        });
        console.warn('[Stripe Webhook] No invoice_id in session metadata — ignoring', session.id);
        return NextResponse.json({ received: true, ignored: 'no invoice_id' });
      }

      // 1. Book the money. settleInvoicePayment owns the insert, the re-sum and
      //    the invoice update, and checks every Supabase error — the previous
      //    inline version discarded all of them and still returned 200, so a
      //    failed insert lost the payment permanently.
      const gross = (session.amount_total || 0) / 100;
      const { base, surcharge } = splitGross(gross, session.metadata?.surcharge_amount);

      const settled = await settleInvoicePayment(supabase, {
        invoiceId,
        grossAmount: gross,
        baseAmount: base,
        reference: paymentRef,
        note: surcharge > 0
          ? `Stripe online payment — ${base} + ${surcharge} card fee`
          : 'Stripe online payment',
      });

      if (!settled.ok) {
        logError({
          error: new Error(settled.error),
          request: req,
          metadata: {
            source: 'stripe_webhook', event: event.type,
            invoice_id: invoiceId, reference: paymentRef, gross,
          },
        });
        console.error('[Stripe Webhook] Settlement failed:', settled.error);

        // A NON-retryable failure means real money was charged that we can never
        // book automatically (e.g. the invoice was deleted). Stripe will stop on
        // a 4xx, so a human must be told — otherwise the charge vanishes with
        // only an error-log row behind it.
        if (!settled.retryable) {
          await notifyAdmins(supabase, {
            type: 'payment_confirmed',
            title: '⚠️ دفعة محصلة لم تُسجَّل',
            message: `تم خصم ${gross} ${session.currency?.toUpperCase() || 'AED'} من العميل لكن تعذّر تسجيلها — ${settled.error}`,
            link: '/dashboard/finance',
            from: { username: 'system', displayName: 'Stripe' },
          });
        }

        // Non-2xx so Stripe REDELIVERS. Safe: uniq_payments_invoice_reference
        // (migration 053) makes a duplicate booking impossible.
        return NextResponse.json(
          { error: settled.error },
          { status: settled.retryable ? 500 : 400 },
        );
      }

      // 2. Mark the session record settled. Done AFTER the money is booked, so a
      //    row still 'pending' remains a truthful signal for the reconcile cron.
      const { error: sessErr } = await supabase
        .from('pyra_stripe_payments')
        .update({
          stripe_payment_intent_id: paymentIntentId,
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_session_id', session.id);
      if (sessErr) {
        logError({
          severity: 'warning', error: sessErr, request: req,
          metadata: { source: 'stripe_webhook', step: 'session_record', session_id: session.id },
        });
      }

      if (settled.skipped) {
        console.log(`[Stripe Webhook] Already settled ref=${paymentRef}, skipping`);
        return NextResponse.json({ received: true, skipped: 'already_recorded' });
      }

      const invoice = { invoice_number: settled.invoiceNumber };
      const paymentAmount = base;
      const newStatus = settled.status;

      // 7. Create client notification
      if (clientId) {
        await supabase.from('pyra_client_notifications').insert({
          id: generateId('cn'),
          client_id: clientId,
          type: 'payment_confirmed',
          title: 'تم استلام الدفع',
          message: `تم استلام دفعتك للفاتورة ${invoice.invoice_number} بنجاح بمبلغ ${paymentAmount} ${session.currency?.toUpperCase() || 'AED'}`,
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

      // 9. Recompute the contract's collected total from actual payments.
      //    Shared helper: the refund and dispute-loss branches call it too, so
      //    amount_collected can now go DOWN — the old inline version ran only
      //    here, meaning a refund never reduced it.
      await recalcContractCollected(supabase, invoiceId);

      // ── Auto-calculate commission for commission employees ──
      try {
        const { data: commissionSetting } = await supabase
          .from('pyra_settings')
          .select('value')
          .eq('key', 'commission_auto_calculate')
          .maybeSingle();

        if (commissionSetting?.value === 'true') {
          const { data: rateSetting } = await supabase
            .from('pyra_settings')
            .select('value')
            .eq('key', 'commission_rate')
            .maybeSingle();
          const globalRate = parseFloat(rateSetting?.value || '0');

          // Find the project linked to this invoice
          const { data: invProject } = await supabase
            .from('pyra_invoices')
            .select('project_id')
            .eq('id', invoiceId)
            .maybeSingle();

          const projectId = invProject?.project_id;

          if (projectId) {
            const { data: commissionEmployees } = await supabase
              .from('pyra_timesheets')
              .select('username')
              .eq('project_id', projectId)
              .eq('payment_type', 'commission');

            const uniqueUsernames = [...new Set((commissionEmployees || []).map((e: { username: string }) => e.username))];

            if (uniqueUsernames.length > 0) {
              const { data: users } = await supabase
                .from('pyra_users')
                .select('username, display_name, commission_rate')
                .in('username', uniqueUsernames);

              for (const user of users || []) {
                const rate = user.commission_rate ?? globalRate;
                if (rate <= 0) continue;

                const commissionAmount = Math.round(paymentAmount * rate) / 100;
                if (commissionAmount <= 0) continue;

                await supabase.from('pyra_employee_payments').insert({
                  id: generateId('ep'),
                  username: user.username,
                  display_name: user.display_name,
                  type: 'bonus',
                  source_type: 'commission',
                  source_id: invoiceId,
                  amount: commissionAmount,
                  currency: 'AED',
                  status: 'pending',
                  notes: `عمولة تلقائية — فاتورة ${invoice.invoice_number} — ${rate}%`,
                  created_by: 'system',
                });
              }
            }
          }
        }
      } catch (commErr) {
        console.error('[Stripe Webhook] Commission auto-calculate error:', commErr);
      }

      console.log(`[Stripe Webhook] Payment processed: invoice=${invoiceId}, amount=${paymentAmount}, status=${newStatus}`);
    }

    // ── Handle: checkout.session.async_payment_failed ────────────
    // The customer committed to an asynchronous method and it later failed
    // (insufficient funds, mandate revoked…). Nothing was ever booked — the
    // payment_status guard above refused to settle it — so this only has to
    // close out the session record and tell a human.
    if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object as Stripe.Checkout.Session;

      const { error: failErr } = await supabase
        .from('pyra_stripe_payments')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('stripe_session_id', session.id);
      if (failErr) {
        logError({
          severity: 'warning', error: failErr, request: req,
          metadata: { source: 'stripe_webhook', step: 'async_failed', session_id: session.id },
        });
      }

      const invoiceId = session.metadata?.invoice_id;
      await notifyAdmins(supabase, {
        type: 'payment_failed',
        title: 'فشل دفع مؤجل',
        message: `فشلت عملية دفع بطريقة مؤجلة بقيمة ${(session.amount_total || 0) / 100} ${session.currency?.toUpperCase() || 'AED'} — لم يُسجَّل أي مبلغ`,
        link: invoiceId ? `/dashboard/invoices/${invoiceId}` : '/dashboard/finance',
        from: { username: 'system', displayName: 'Stripe' },
      });

      console.log(`[Stripe Webhook] Async payment failed: ${session.id}`);
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
      // Stripe's charge.amount_refunded is CUMULATIVE across all refunds on
      // the charge, and this event fires per refund AND on replays. We record
      // only the DELTA vs what is already in pyra_payments — this makes the
      // handler idempotent for replays and correct for partial refunds
      // (finance audit 2026-07-02, F-STRIPE-REF).
      const cumulativeRefunded = Math.round(((charge.amount_refunded || 0) / 100) * 100) / 100;
      const currency = charge.currency?.toUpperCase() || 'AED';

      if (paymentIntentId) {
        // Find the stripe payment record via payment_intent
        const { data: sessionRow, error: sessionLookupErr } = await supabase
          .from('pyra_stripe_payments')
          .select('id, invoice_id, client_id')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .maybeSingle();

        // A failed lookup is NOT "no match". Treating it as one would fall into
        // the unmatched-refund ACK below and drop a real refund permanently.
        if (sessionLookupErr) {
          logError({
            error: sessionLookupErr, request: req,
            metadata: { source: 'stripe_webhook', event: event.type, step: 'session_lookup', payment_intent: paymentIntentId },
          });
          return NextResponse.json({ error: 'session lookup failed' }, { status: 500 });
        }

        // Fall back to the LEDGER when no session record matches. A payment can
        // legitimately exist without one — booked by manual reconciliation, by
        // the reconcile cron, or from a Stripe-native invoice. Without this
        // fallback the handler returned 200 and the refund was never recorded,
        // leaving the invoice permanently overstated as paid.
        let stripePayment = sessionRow;
        if (!stripePayment) {
          const { data: ledgerRow, error: ledgerErr } = await supabase
            .from('pyra_payments')
            .select('invoice_id')
            .eq('reference', paymentIntentId)
            .maybeSingle();

          if (ledgerErr) {
            logError({
              error: ledgerErr, request: req,
              metadata: { source: 'stripe_webhook', event: event.type, step: 'ledger_fallback', payment_intent: paymentIntentId },
            });
            return NextResponse.json({ error: 'ledger lookup failed' }, { status: 500 });
          }

          if (ledgerRow) {
            // Recover the client from the invoice so the refund notification
            // still reaches them on a hand-reconciled payment.
            const { data: inv } = await supabase
              .from('pyra_invoices')
              .select('client_id')
              .eq('id', ledgerRow.invoice_id)
              .maybeSingle();
            stripePayment = { id: '', invoice_id: ledgerRow.invoice_id, client_id: inv?.client_id ?? null };
          }
        }

        if (!stripePayment) {
          logError({
            severity: 'warning',
            error: new Error(`Refund for unknown payment intent ${paymentIntentId}`),
            request: req,
            metadata: { source: 'stripe_webhook', event: event.type, payment_intent: paymentIntentId, cumulativeRefunded },
          });
          await notifyAdmins(supabase, {
            type: 'payment_refunded',
            title: '⚠️ استرجاع لدفعة غير مسجلة',
            message: `استرجاع من Stripe بقيمة ${cumulativeRefunded} ${currency} لعملية غير موجودة في النظام — يحتاج مراجعة يدوية`,
            link: '/dashboard/finance',
            from: { username: 'system', displayName: 'Stripe' },
          });
          return NextResponse.json({ received: true, unmatched: true });
        }

        {
          // Update stripe payment status (only when a session record exists)
          if (stripePayment.id) {
            await supabase
              .from('pyra_stripe_payments')
              .update({ status: 'refunded', updated_at: new Date().toISOString() })
              .eq('id', stripePayment.id);
          }

          if (stripePayment.invoice_id) {
            // Sum refunds already recorded for this payment intent.
            // The error must be checked: reading a failure as "nothing recorded
            // yet" would re-book a refund that already exists.
            const { data: priorRefundRows, error: priorErr } = await supabase
              .from('pyra_payments')
              .select('amount, reference')
              .eq('invoice_id', stripePayment.invoice_id)
              .eq('method', 'refund');

            if (priorErr) {
              logError({
                error: priorErr, request: req,
                metadata: {
                  source: 'stripe_webhook', event: event.type,
                  step: 'prior_refunds', payment_intent: paymentIntentId,
                },
              });
              return NextResponse.json({ error: 'prior refunds lookup failed' }, { status: 500 });
            }

            const alreadyRecorded = Math.round(
              (priorRefundRows || [])
                .filter((p: { reference: string | null }) =>
                  (p.reference || '').startsWith(`refund_${paymentIntentId}`))
                .reduce((sum: number, p: { amount: number }) => sum + Math.abs(Number(p.amount)), 0) * 100
            ) / 100;
            const refundAmount = Math.round((cumulativeRefunded - alreadyRecorded) * 100) / 100;

            // Delta 0 means the refund row already exists. Do NOT return here:
            // a previous delivery may have inserted it and then failed before
            // updating the invoice. Fall through to the recompute so the retry
            // is self-healing — the recompute is idempotent by construction.
            const alreadyBooked = refundAmount <= 0;
            if (alreadyBooked) {
              console.log(`[Stripe Webhook] Refund delta 0 (cumulative=${cumulativeRefunded}, recorded=${alreadyRecorded}) — re-syncing invoice only`);
            }

            // Insert the negative payment (the refund DELTA only), unless this
            // step is already on the ledger. Reference is keyed on the
            // cumulative level so each refund step gets a distinct reference.
            if (!alreadyBooked) {
              const { error: refundErr } = await supabase.from('pyra_payments').insert({
                id: generateId('pay'),
                invoice_id: stripePayment.invoice_id,
                amount: -refundAmount,
                // Dubai day, not the UTC day: cash-basis reports key on this date
                // and the two differ for the last 4 hours of every Dubai day.
                payment_date: dubaiDayKey(),
                method: 'refund',
                reference: `refund_${paymentIntentId}_${Math.round(cumulativeRefunded * 100)}`,
                notes: `استرجاع Stripe — ${refundAmount} ${currency}`,
                recorded_by: 'system',
              });

              // 23505 = a concurrent delivery booked this exact step first. That
              // is success. Fall through to the recompute either way so the
              // invoice ends in sync regardless of who won the race.
              if (refundErr && refundErr.code !== '23505') {
                logError({
                  error: refundErr, request: req,
                  metadata: {
                    source: 'stripe_webhook', event: event.type,
                    payment_intent: paymentIntentId, invoice_id: stripePayment.invoice_id, refundAmount,
                  },
                });
                // 500 so Stripe redelivers rather than us telling the client
                // their money came back when nothing was recorded.
                return NextResponse.json({ error: 'refund insert failed' }, { status: 500 });
              }
            }

            // Recalculate invoice amounts.
            // The error MUST be checked: a failed re-sum yields null, which the
            // old code read as "this invoice has no payments" and wrote back as
            // amount_paid=0 / status='sent' — wiping a fully-paid invoice and
            // returning 200 so Stripe never retried.
            const { data: allPayments, error: sumErr } = await supabase
              .from('pyra_payments')
              .select('amount')
              .eq('invoice_id', stripePayment.invoice_id);

            if (sumErr) {
              logError({
                error: sumErr, request: req,
                metadata: {
                  source: 'stripe_webhook', event: event.type,
                  step: 'refund_resum', invoice_id: stripePayment.invoice_id,
                },
              });
              return NextResponse.json({ error: 'payments re-sum failed' }, { status: 500 });
            }

            const newAmountPaid = (allPayments || []).reduce(
              (sum: number, p: { amount: number }) => sum + Number(p.amount), 0
            );

            const { data: invoice, error: invReadErr } = await supabase
              .from('pyra_invoices')
              .select('total, invoice_number, status')
              .eq('id', stripePayment.invoice_id)
              .maybeSingle();

            if (invReadErr) {
              logError({
                error: invReadErr, request: req,
                metadata: {
                  source: 'stripe_webhook', event: event.type,
                  step: 'refund_invoice_read', invoice_id: stripePayment.invoice_id,
                },
              });
              return NextResponse.json({ error: 'invoice read failed' }, { status: 500 });
            }

            if (invoice) {
              // Shared derivation — same rules as the payment branch, instead of
              // the three subtly different inline versions this file used to have.
              const derived = deriveInvoiceState(Number(invoice.total), newAmountPaid);
              const newStatus = derived.status;

              // Same terminal guard settleInvoicePayment applies: never write a
              // status onto a cancelled invoice. Amounts still track the ledger.
              const refundUpdate: Record<string, unknown> = {
                amount_paid: derived.amountPaid,
                amount_due: derived.amountDue,
                updated_at: new Date().toISOString(),
              };
              if (invoice.status !== 'cancelled') refundUpdate.status = newStatus;

              const { error: invUpdErr } = await supabase
                .from('pyra_invoices')
                .update(refundUpdate)
                .eq('id', stripePayment.invoice_id);

              if (invUpdErr) {
                logError({
                  error: invUpdErr, request: req,
                  metadata: {
                    source: 'stripe_webhook', event: event.type,
                    step: 'refund_invoice_update', invoice_id: stripePayment.invoice_id,
                  },
                });
                return NextResponse.json({ error: 'invoice update failed' }, { status: 500 });
              }

              // A refund must reduce the contract's collected total too — the
              // old code only ever raised it from the payment branch.
              await recalcContractCollected(supabase, stripePayment.invoice_id);

              // Notify client
              if (stripePayment.client_id) {
                void supabase.from('pyra_client_notifications').insert({
                  id: generateId('cn'),
                  client_id: stripePayment.client_id,
                  type: 'payment_refunded',
                  title: 'تم استرجاع المبلغ',
                  message: `تم استرجاع ${refundAmount} ${currency} للفاتورة ${invoice.invoice_number}`,
                  is_read: false,
                })
                  .then(({ error: e }) => { if (e) console.error('[Stripe Webhook] Notification error:', e.message); });
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
              })
                .then(({ error: e }) => { if (e) console.error('[Stripe Webhook] Notification error:', e.message); });
            }
          }
        }
      }

      console.log(`[Stripe Webhook] Refund processed: intent=${paymentIntentId}, cumulative=${cumulativeRefunded}`);
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

          // Create admin notification (critical alert — all active admins)
          await notifyAdmins(supabase, {
            type: 'dispute_created',
            title: '⚠️ نزاع دفع جديد',
            message: `تم فتح نزاع بقيمة ${disputeAmount} ${currency} — السبب: ${reason}`,
            link: stripePayment.invoice_id ? `/dashboard/invoices/${stripePayment.invoice_id}` : '/dashboard/finance',
            from: { username: 'system', displayName: 'Stripe' },
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
      })
        .then(({ error: e }) => { if (e) console.error('[Stripe Webhook] Notification error:', e.message); });

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

            // Insert the negative payment. No pre-check probe: the unique index
            // on (invoice_id, reference) is the idempotency authority, and 23505
            // simply means an earlier delivery won.
            const { error: dispErr } = await supabase.from('pyra_payments').insert({
              id: generateId('pay'),
              invoice_id: stripePayment.invoice_id,
              amount: -disputeAmount,
              // Dubai day — cash-basis reports key on payment_date.
              payment_date: dubaiDayKey(),
              method: 'dispute_lost',
              reference: `dispute_${dispute.id}`,
              notes: `خسارة نزاع Stripe — ${disputeAmount} ${dispute.currency?.toUpperCase() || 'AED'}`,
              recorded_by: 'system',
            });

            if (dispErr && dispErr.code !== '23505') {
              logError({
                error: dispErr, request: req,
                metadata: {
                  source: 'stripe_webhook', event: event.type,
                  step: 'dispute_loss_insert', dispute_id: dispute.id,
                  invoice_id: stripePayment.invoice_id,
                },
              });
              // 500 so Stripe redelivers — otherwise we would tell the admin
              // the dispute closed while the money stayed on the books.
              return NextResponse.json({ error: 'dispute insert failed' }, { status: 500 });
            }

            // Recompute on BOTH paths — fresh insert AND already-booked. If an
            // earlier delivery inserted the row then failed before updating the
            // invoice, this is the only thing that ever repairs it. The
            // recompute is idempotent, so running it every time is free.
            const { data: allPayments, error: dSumErr } = await supabase
              .from('pyra_payments')
              .select('amount')
              .eq('invoice_id', stripePayment.invoice_id);

            if (dSumErr) {
              logError({
                error: dSumErr, request: req,
                metadata: {
                  source: 'stripe_webhook', event: event.type,
                  step: 'dispute_resum', invoice_id: stripePayment.invoice_id,
                },
              });
              return NextResponse.json({ error: 'payments re-sum failed' }, { status: 500 });
            }

            const paymentsSum = (allPayments || []).reduce(
              (sum: number, p: { amount: number }) => sum + Number(p.amount), 0
            );

            const { data: invoice, error: dInvErr } = await supabase
              .from('pyra_invoices')
              .select('total, status')
              .eq('id', stripePayment.invoice_id)
              .maybeSingle();

            if (dInvErr) {
              logError({
                error: dInvErr, request: req,
                metadata: {
                  source: 'stripe_webhook', event: event.type,
                  step: 'dispute_invoice_read', invoice_id: stripePayment.invoice_id,
                },
              });
              return NextResponse.json({ error: 'invoice read failed' }, { status: 500 });
            }

            if (invoice) {
              // Shared derivation — identical rules to the payment and refund
              // branches, including the terminal-status guard.
              const derived = deriveInvoiceState(Number(invoice.total), paymentsSum);
              const dispUpdate: Record<string, unknown> = {
                amount_paid: derived.amountPaid,
                amount_due: derived.amountDue,
                updated_at: new Date().toISOString(),
              };
              if (invoice.status !== 'cancelled') dispUpdate.status = derived.status;

              const { error: invUpdErr } = await supabase
                .from('pyra_invoices')
                .update(dispUpdate)
                .eq('id', stripePayment.invoice_id);

              if (invUpdErr) {
                logError({
                  error: invUpdErr, request: req,
                  metadata: {
                    source: 'stripe_webhook', event: event.type,
                    step: 'dispute_invoice_update', invoice_id: stripePayment.invoice_id,
                  },
                });
                return NextResponse.json({ error: 'invoice update failed' }, { status: 500 });
              }

              // A lost dispute reduces what the contract actually collected.
              await recalcContractCollected(supabase, stripePayment.invoice_id);
            }
          }

          // Admin notification (all active admins — not the ghost 'admin' user)
          await notifyAdmins(supabase, {
            type: 'dispute_closed',
            title: outcome === 'won' ? '✅ تم كسب النزاع' : '❌ تم خسارة النزاع',
            message: `النزاع ${dispute.id} انتهى — النتيجة: ${outcome}`,
            link: stripePayment.invoice_id ? `/dashboard/invoices/${stripePayment.invoice_id}` : '/dashboard/finance',
            from: { username: 'system', displayName: 'Stripe' },
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
      })
        .then(({ error: e }) => { if (e) console.error('[Stripe Webhook] Notification error:', e.message); });

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
        })
          .then(({ error: e }) => { if (e) console.error('[Stripe Webhook] Notification error:', e.message); });
      }

      // Admin notification (all active admins — not the ghost 'admin' user)
      await notifyAdmins(supabase, {
        type: 'payment_failed',
        title: 'فشل دفع إلكتروني',
        message: `فشل الدفع — ${failureMessage}`,
        link: invoiceId ? `/dashboard/invoices/${invoiceId}` : '/dashboard/finance',
        from: { username: 'system', displayName: 'Stripe' },
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
      })
        .then(({ error: e }) => { if (e) console.error('[Stripe Webhook] Notification error:', e.message); });

      console.log(`[Stripe Webhook] Payment failed: intent=${paymentIntent.id}, error=${failureCode}: ${failureMessage}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    // Differentiate signature errors from processing errors.
    // Use the SDK's error type, NOT a substring match on the message: the old
    // check fired on any message containing 'signature' or 'Webhook', so a
    // genuine processing failure could be answered with 401 — and Stripe does
    // not retry 4xx, so that payment would be lost permanently.
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
      // Phase 14.1 Commit 2 — signature failure is suspicious (probe or
      // misconfigured client) but not a system error. Log as warning, not error.
      logError({
        severity: 'warning',
        error,
        request: req,
        metadata: { source: 'webhook', provider: 'stripe', reason: 'signature_verification' },
      });
      console.error('[Stripe Webhook] Signature verification failed:', message);
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }
    // Phase 14.1 Commit 2 — processing failure is financial-critical. Stripe
    // WILL retry, but silent failures mean we lose revenue tracking.
    logError({
      error,
      request: req,
      metadata: { source: 'webhook', provider: 'stripe', reason: 'processing' },
    });
    console.error('[Stripe Webhook] Processing error:', message);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
