import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStripeClient } from '@/lib/stripe';
import { logError } from '@/lib/observability/log-error';
import { notifyMany } from '@/lib/notifications/notify';
import { settleInvoicePayment, splitGross, recalcContractCollected } from '@/lib/stripe/settle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/stripe-reconcile
 *
 * The safety net beneath the webhook. A Stripe Checkout session lives ~24h; any
 * pyra_stripe_payments row still 'pending' well past that is either genuinely
 * abandoned or a payment whose webhook delivery never landed. Ask Stripe which,
 * and book the ones that were really paid.
 *
 * This exists because the webhook was found DISABLED on 2026-07-25 with zero
 * events ever settled — a real 5,175 AED payment sat unrecorded and was only
 * found by manual inspection. With this cron, that self-heals within a day.
 *
 * Auth follows the Phase D §7 cron pattern: x-api-key -> pyra_api_keys, then a
 * permission check accepting the wildcard.
 */

const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS_PER_RUN = 100;

/** Notify every active admin. Used by the rescue path and both skip guards. */
async function alertAdmins(
  supabase: SupabaseClient,
  title: string,
  message: string,
): Promise<void> {
  const { data: admins } = await supabase
    .from('pyra_users')
    .select('username')
    .eq('role', 'admin')
    .eq('status', 'active');
  const usernames = (admins ?? []).map((a: { username: string }) => a.username);
  if (usernames.length === 0) {
    console.error('[cron/stripe-reconcile] no active admins to notify');
    return;
  }
  await notifyMany(supabase, usernames, {
    type: 'payment_confirmed',
    title,
    message,
    link: '/dashboard/finance',
    from: { username: 'system', displayName: 'Stripe' },
  });
}

/**
 * Park a row a human must resolve.
 *
 * Without this, a row the guards refuse to settle stays 'pending' and is
 * re-read — and re-alerted — on every single nightly run, while also consuming
 * one of the MAX_ROWS_PER_RUN slots forever. With enough such rows the sweep
 * would never reach newer ones again (the livelock the review flagged).
 */
async function markNeedsReview(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from('pyra_stripe_payments')
    .update({ status: 'needs_review', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    logError({
      severity: 'warning', error,
      metadata: { action: 'stripe-reconcile', step: 'mark_needs_review', row_id: id },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);

    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.stripe-reconcile') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.stripe-reconcile', 403);
    }

    const supabase = createServiceRoleClient();
    const stripe = await getStripeClient();

    const cutoff = new Date(Date.now() - SESSION_LIFETIME_MS).toISOString();

    const { data: stale, error: staleErr } = await supabase
      .from('pyra_stripe_payments')
      .select('id, invoice_id, stripe_session_id, client_id, created_at')
      .eq('status', 'pending')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(MAX_ROWS_PER_RUN);

    if (staleErr) {
      logError({
        error: staleErr, request,
        metadata: { action: 'stripe-reconcile', step: 'select_stale' },
      });
      return apiServerError();
    }

    const rows = stale ?? [];
    let settled = 0;
    let expired = 0;
    let stillOpen = 0;
    const failures: string[] = [];
    const rescued: { invoice: string; amount: number; currency: string }[] = [];

    for (const row of rows) {
      try {
        const session = await stripe.checkout.sessions.retrieve(row.stripe_session_id);

        if (session.payment_status === 'paid') {
          const gross = (session.amount_total ?? 0) / 100;
          const { base } = splitGross(gross, session.metadata?.surcharge_amount);
          const intentId =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : `session_${session.id}`;

          // GUARD 1 — this payment intent may already be booked against a
          // DIFFERENT invoice (e.g. reconciled by hand onto the correct one
          // while the session still points at a superseded invoice). The unique
          // index is scoped per-invoice, so it does NOT prevent that double
          // booking. Never auto-resolve it — a human must decide.
          const { data: existingBooking, error: bookErr } = await supabase
            .from('pyra_payments')
            .select('invoice_id')
            .eq('reference', intentId)
            .limit(2);

          if (bookErr) {
            failures.push(`${row.stripe_session_id}: booking check ${bookErr.message}`);
            continue;
          }

          const elsewhere = (existingBooking ?? []).find(
            (p: { invoice_id: string }) => p.invoice_id !== row.invoice_id,
          );
          if (elsewhere) {
            failures.push(`${row.stripe_session_id}: intent already booked on ${elsewhere.invoice_id}`);
            await alertAdmins(
              supabase,
              '⚠️ دفعة Stripe مسجلة على فاتورة أخرى',
              `الجلسة ${row.stripe_session_id} تشير للفاتورة ${row.invoice_id} لكن نفس عملية الدفع مسجلة بالفعل على ${elsewhere.invoice_id} — تحتاج مراجعة يدوية`,
            );
            await markNeedsReview(supabase, row.id);
            continue;
          }

          // GUARD 2 — never auto-settle onto a cancelled invoice. It usually
          // means the invoice was superseded and the money belongs elsewhere.
          const { data: targetInvoice, error: tgtErr } = await supabase
            .from('pyra_invoices')
            .select('status, invoice_number')
            .eq('id', row.invoice_id)
            .maybeSingle();

          if (tgtErr) {
            failures.push(`${row.stripe_session_id}: invoice read ${tgtErr.message}`);
            continue;
          }

          if (targetInvoice?.status === 'cancelled') {
            failures.push(`${row.stripe_session_id}: target invoice ${row.invoice_id} is cancelled`);
            await alertAdmins(
              supabase,
              '⚠️ دفعة Stripe على فاتورة ملغاة',
              `الجلسة ${row.stripe_session_id} بقيمة ${gross} مدفوعة فعلاً لكن الفاتورة ${targetInvoice.invoice_number} ملغاة — تحتاج ترحيل يدوي للفاتورة الصحيحة`,
            );
            await markNeedsReview(supabase, row.id);
            continue;
          }

          const result = await settleInvoicePayment(supabase, {
            invoiceId: row.invoice_id,
            grossAmount: gross,
            baseAmount: base,
            reference: intentId,
            note: 'Stripe — settled by reconciliation cron (webhook delivery missed)',
          });

          if (!result.ok) {
            failures.push(`${row.stripe_session_id}: ${result.error}`);
            continue;
          }

          const { error: markErr } = await supabase
            .from('pyra_stripe_payments')
            .update({
              status: 'completed',
              stripe_payment_intent_id:
                typeof session.payment_intent === 'string' ? session.payment_intent : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id);

          // Not fatal — the money IS booked. But an unflipped row is re-examined
          // every night forever, so it must be visible rather than silent.
          if (markErr) failures.push(`${row.stripe_session_id}: mark-completed ${markErr.message}`);

          await recalcContractCollected(supabase, row.invoice_id);

          // A row already settled by a late webhook delivery is not a rescue.
          if (!result.skipped) {
            settled++;
            rescued.push({
              invoice: result.invoiceNumber,
              amount: base,
              currency: (session.currency ?? 'aed').toUpperCase(),
            });
          }
        } else if (session.status === 'expired') {
          const { error } = await supabase
            .from('pyra_stripe_payments')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', row.id);
          if (error) failures.push(`${row.stripe_session_id}: expire update ${error.message}`);
          else expired++;
        } else {
          // Still open past its lifetime — leave it for the next run.
          stillOpen++;
        }
      } catch (err) {
        // One bad session must not abort the whole sweep.
        failures.push(`${row.stripe_session_id}: ${(err as Error).message}`);
        logError({
          severity: 'warning', error: err, request,
          metadata: { action: 'stripe-reconcile', session_id: row.stripe_session_id },
        });
      }
    }

    // Rescued money means the webhook dropped something — a human should know.
    if (settled > 0) {
      // Cap the inline detail: the sweep can rescue up to MAX_ROWS_PER_RUN and
      // an unbounded list would blow past any sane notification length.
      const shown = rescued.slice(0, 10);
      const detail = shown.map((r) => `${r.invoice}: ${r.amount} ${r.currency}`).join('، ');
      const more = rescued.length > shown.length ? ` (+${rescued.length - shown.length})` : '';
      await alertAdmins(
        supabase,
        '🔄 دفعات أنقذتها المصالحة',
        `سجّلت المصالحة ${settled} دفعة لم يسجلها الويبهوك (${detail}${more}) — راجع سجل الويبهوك في Stripe`,
      );
    }

    if (failures.length > 0) {
      logError({
        error: new Error(`stripe-reconcile had ${failures.length} failure(s)`),
        request,
        metadata: { action: 'stripe-reconcile', failures: failures.slice(0, 20) },
      });
    }

    return apiSuccess({
      checked: rows.length,
      settled,
      expired,
      still_open: stillOpen,
      failures: failures.length,
      capped: rows.length === MAX_ROWS_PER_RUN,
    });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'stripe-reconcile' } });
    console.error('[cron/stripe-reconcile] threw:', err);
    return apiServerError();
  }
}
