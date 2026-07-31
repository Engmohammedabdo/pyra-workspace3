import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import {
  apiSuccess, apiError, apiForbidden, apiValidationError, apiServerError,
} from '@/lib/api/response';
import { hasPermission } from '@/lib/auth/rbac';
import { canAccessLead } from '@/lib/auth/lead-scope';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { generateNextInvoiceNumber } from '@/lib/utils/invoice-number';
import { generateDocumentLinkToken } from '@/lib/documents/token';
import { getStripeClient, isStripeEnabled } from '@/lib/stripe';
import { calcSurcharge, getSurchargePercent, normalizeSurchargePercent } from '@/lib/stripe/surcharge';
import { MAX_SURCHARGE_PERCENT } from '@/lib/stripe/surcharge';
import {
  parseQuickPaymentInput,
  mintPlaceholderEmail,
  QUICK_PAYMENT_CURRENCIES,
} from '@/lib/finance/quick-payment';
import { INVOICE_STATUS } from '@/lib/constants/statuses';
import { dubaiDayKey } from '@/lib/utils/format';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { checkRateLimit, apiWriteLimiter } from '@/lib/utils/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/finance/quick-payment-link
 *
 * One call: name + amount in, a payable public URL out. Behind it a client, a
 * SENT invoice, a line item, a public document link, a Stripe Checkout session
 * and the session record all get created.
 *
 * WHY IT EXISTS: three times the owner raised a link in the Stripe Dashboard
 * instead, because the in-system path was five screens (2,500 Apr · 5,175
 * Jul-25 · 728 Jul-31). Each time the money landed in Stripe but NOT in Pyra
 * and had to be reconciled by hand. The fix is making the in-system path the
 * fastest one.
 *
 * THREE THINGS THAT LOOK WRONG AND ARE NOT:
 *
 * 1. The invoice is created directly as SENT, not draft. PATCH
 *    /api/invoices/[id] cannot do draft→sent (VALID_TRANSITIONS), so the only
 *    other path is the /send route — a whole extra failure step, and one that
 *    would try to email a `.invalid` placeholder address. Creating as SENT is
 *    already precedented in lib/finance/recurring-generation.ts.
 *
 * 2. Direct inserts, not an internal `POST /api/invoices` fetch. Auth here is
 *    cookie-based, so an internal call would have to forward cookies. Five
 *    existing sites already insert directly (from-quote, both
 *    generate-invoice routes, external/invoices, recurring-generation).
 *
 * 3. The surcharge is NOT on the invoice. The invoice total is the BASE, and
 *    `pyra_stripe_payments.amount` is the BASE, matching create-checkout — so
 *    the reconcile cron's arithmetic stays consistent. The card fee travels
 *    only in Stripe session metadata, where splitGross() picks it back up at
 *    settlement (owner's locked decision).
 *
 * There is no transaction wrapper anywhere in this codebase, so every step
 * below compensates for the ones before it — see `rollback()`.
 */

/**
 * Explicit map rather than a template-literal translation key: next-intl's
 * Messages type is strict, so a computed key does not typecheck — and a
 * silently-missing key would render as a raw dotted path to the operator.
 */
const INVALID_FIELD_MESSAGE = {
  name: 'finance.quickPayInvalidName',
  amount: 'finance.quickPayInvalidAmount',
  currency: 'finance.quickPayInvalidCurrency',
  email: 'finance.quickPayInvalidEmail',
  description: 'finance.quickPayInvalidDescription',
} as const;

/** Not in the map above — the surcharge is validated separately, after parse. */
const INVALID_SURCHARGE_MESSAGE = 'finance.quickPayInvalidSurcharge' as const;

/**
 * GET /api/finance/quick-payment-link
 *
 * The dialog's defaults: the configured surcharge rate and currency, so the
 * form can show a live base/fee/total the moment it opens.
 *
 * A purpose-built endpoint rather than reading `/api/settings`, which is gated
 * on `settings.view` and returns the whole settings map — a finance manager
 * who is not an admin needs the surcharge rate and nothing else, and widening
 * that gate to hand it over would also hand over the SMTP and Stripe blocks.
 */
export async function GET() {
  try {
    const auth = await requireApiPermission('finance.manage');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const [percent, { data: setting }] = await Promise.all([
      getSurchargePercent(supabase),
      supabase.from('pyra_settings').select('value').eq('key', 'default_currency').maybeSingle(),
    ]);

    return apiSuccess({
      surcharge_percent: percent,
      default_currency: (setting?.value || 'AED').toUpperCase(),
      currencies: QUICK_PAYMENT_CURRENCIES,
      max_surcharge_percent: MAX_SURCHARGE_PERCENT,
      stripe_enabled: await isStripeEnabled(),
    });
  } catch (err) {
    logError({ error: err, metadata: { source: 'quick_payment_link', step: 'defaults' } });
    return apiServerError();
  }
}

/** What this request created and must undo if a later step fails. */
type Created = {
  /** Only set when this request CREATED the client. A reused client is never deleted. */
  clientId: string | null;
  invoiceId: string | null;
  linkId: string | null;
  /**
   * Only set when this request wrote `client_id` onto a lead that had none.
   * A lead that was ALREADY linked is never unlinked — undoing someone else's
   * link would be a silent CRM regression, not a rollback.
   */
  linkedLeadId: string | null;
};

/**
 * Undo everything this request created, most recent first.
 *
 * Deleting the invoice cascades its items. There is **no** FK from
 * pyra_invoices.client_id, so a stranded client would never surface as an
 * error — it has to be deleted explicitly or it becomes a silent orphan in the
 * clients list.
 *
 * Best-effort by design: a failed rollback must not mask the original failure,
 * but it must be loud, because only a human can clean up what is left.
 */
async function rollback(
  supabase: SupabaseClient,
  created: Created,
  reason: string,
): Promise<void> {
  const failures: string[] = [];

  // Undone FIRST: it points at a client row this same rollback is about to
  // delete, so leaving it would dangle a lead at a customer that no longer
  // exists — and pyra_sales_leads.client_id has no FK to catch that.
  if (created.linkedLeadId) {
    const { error } = await supabase
      .from('pyra_sales_leads')
      .update({ client_id: null })
      .eq('id', created.linkedLeadId);
    if (error) failures.push(`lead link ${created.linkedLeadId}: ${error.message}`);
  }
  if (created.linkId) {
    const { error } = await supabase.from('pyra_document_links').delete().eq('id', created.linkId);
    if (error) failures.push(`link ${created.linkId}: ${error.message}`);
  }
  if (created.invoiceId) {
    const { error } = await supabase.from('pyra_invoices').delete().eq('id', created.invoiceId);
    if (error) failures.push(`invoice ${created.invoiceId}: ${error.message}`);
  }
  if (created.clientId) {
    const { error } = await supabase.from('pyra_clients').delete().eq('id', created.clientId);
    if (error) failures.push(`client ${created.clientId}: ${error.message}`);
  }

  if (failures.length > 0) {
    logError({
      error: new Error(`quick-payment-link rollback incomplete after ${reason}`),
      metadata: { source: 'quick_payment_link', step: 'rollback', reason, failures },
    });
  }
}

export async function POST(request: NextRequest) {
  const t = await getTranslations('api');
  let authForLogging: ApiAuthResult | null = null;

  // Hoisted above the try so the outer catch can compensate too. An exception
  // — a Stripe timeout, a thrown Supabase client init — is just as capable of
  // stranding a half-built invoice as a checked `{ error }` is, and the catch
  // is the only place that sees it.
  const created: Created = {
    clientId: null, invoiceId: null, linkId: null, linkedLeadId: null,
  };
  const supabase = createServiceRoleClient();

  try {
    const auth = await requireApiPermission('finance.manage');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    // Every call mints a Stripe session and writes five rows. A stuck retry
    // loop in the dialog must not be able to spray invoices.
    const limited = checkRateLimit(apiWriteLimiter, request);
    if (limited) return limited;

    if (!(await isStripeEnabled())) {
      return apiError(t('finance.quickPayStripeDisabled'), 503);
    }

    const body = (await request.json()) as Record<string, unknown>;

    const { data: settings } = await supabase
      .from('pyra_settings')
      .select('key, value')
      .in('key', ['default_currency', 'company_name', 'company_logo']);
    const settingsMap: Record<string, string> = {};
    for (const s of settings ?? []) settingsMap[s.key] = s.value;

    const parsed = parseQuickPaymentInput(body, settingsMap.default_currency || 'AED');
    if (!parsed.ok) {
      return apiValidationError(t(INVALID_FIELD_MESSAGE[parsed.field]));
    }
    const input = parsed.value;

    // ── Surcharge ────────────────────────────────────────────────────────
    // The per-link override is accepted ONLY here, on a finance.manage route.
    // It must never be honoured on a portal/public route, where a
    // client-supplied percent would be trivially abusable.
    //
    // A percent that was SENT but does not normalize is rejected, not quietly
    // replaced by the default: normalizeSurchargePercent returns null both for
    // "absent" and for "35 when you meant 3.5", and falling back on the second
    // case would charge a rate the operator never saw. Only a genuinely absent
    // field falls back.
    //
    // `??` and not `||` for that fallback: 0 is a valid, explicit "no fee this
    // time", and `||` would discard it and re-apply the configured default.
    const override = normalizeSurchargePercent(body.surcharge_percent);
    if (override === null && body.surcharge_percent != null && body.surcharge_percent !== '') {
      return apiValidationError(t(INVALID_SURCHARGE_MESSAGE, { max: MAX_SURCHARGE_PERCENT }));
    }
    const surchargePercent = override ?? (await getSurchargePercent(supabase));
    const { surcharge, gross } = calcSurcharge(input.amount, surchargePercent);

    // ── 1. Client ────────────────────────────────────────────────────────
    // Resolution order — most explicit first:
    //   1. a lead the operator picked from the phone match
    //   2. a client the operator picked from the phone match
    //   3. an exact email already on file
    //   4. a brand-new client with a placeholder address
    //
    // Note what does NOT appear: automatic phone matching. The lookup endpoint
    // SHOWS a phone match, the operator accepts it, and only then does the id
    // arrive here. Silently reusing a customer because a number looked similar
    // would attach a stranger's payment to a real account — two people can
    // share an office landline, and the last-9-digit key is a heuristic.
    let clientId: string | null = null;
    let clientEmail = input.email;
    let leadLinked = false;
    let leadLinkSkippedReason: 'no_permission' | null = null;

    const leadId = typeof body.lead_id === 'string' && body.lead_id.trim() ? body.lead_id.trim() : null;
    const pickedClientId =
      typeof body.client_id === 'string' && body.client_id.trim() ? body.client_id.trim() : null;

    let lead: { id: string; client_id: string | null; stage_id: string | null } | null = null;
    if (leadId) {
      // Scope gate, same as every other lead mutation: a finance manager must
      // not reach a lead they cannot otherwise see just by knowing its id.
      const allowed = await canAccessLead(
        supabase, auth.pyraUser.username, auth.pyraUser.role, leadId,
      );
      if (!allowed) return apiForbidden(t('crm.leadAccessDenied'));

      const { data: leadRow, error: leadErr } = await supabase
        .from('pyra_sales_leads')
        .select('id, client_id, stage_id')
        .eq('id', leadId)
        .maybeSingle();
      if (leadErr) {
        logError({
          error: leadErr, request,
          metadata: { source: 'quick_payment_link', step: 'lead_lookup', lead_id: leadId },
        });
        return apiServerError();
      }
      if (!leadRow) return apiValidationError(t('finance.quickPayLeadNotFound'));
      lead = leadRow;

      // Already promoted to a customer — reuse that one rather than minting a
      // second account for the same person.
      if (leadRow.client_id) clientId = leadRow.client_id;
    }

    if (!clientId && pickedClientId) clientId = pickedClientId;

    // Whatever id we arrived at, prove it exists before hanging an invoice off
    // it. pyra_invoices.client_id has NO foreign key, so a bad id would insert
    // cleanly and produce an invoice belonging to nobody.
    // Snapshot fields for the invoice. Default to what the operator typed;
    // an existing customer overrides them with their own stored details below.
    let invoiceClientName = input.name;
    let invoiceClientCompany: string | null = input.name;
    let invoiceClientPhone = input.phone;

    if (clientId) {
      const { data: picked, error: pickedErr } = await supabase
        .from('pyra_clients')
        .select('id, name, company, email, phone')
        .eq('id', clientId)
        .maybeSingle();
      if (pickedErr) {
        logError({
          error: pickedErr, request,
          metadata: { source: 'quick_payment_link', step: 'client_verify', client_id: clientId },
        });
        return apiServerError();
      }
      if (!picked) return apiValidationError(t('finance.quickPayClientNotFound'));

      // Their stored details win over whatever shorthand was typed at the
      // counter, so this invoice reads the same as every other invoice that
      // customer has. The typed phone still fills a gap if we never had one.
      clientEmail = picked.email;
      invoiceClientName = picked.name;
      invoiceClientCompany = picked.company;
      invoiceClientPhone = picked.phone || input.phone;
    }

    // Only reached when nothing was picked. An exact email is unambiguous
    // enough to match on without the operator confirming — unlike a phone.
    if (!clientId) {
      if (input.email) {
        const { data: existing, error: lookupErr } = await supabase
          .from('pyra_clients')
          .select('id')
          .eq('email', input.email)
          .maybeSingle();
        // A failed lookup is NOT "no match" — reading it as one would hit the
        // UNIQUE(email) constraint on the insert below and fail the whole call
        // for a customer who is already in the system.
        if (lookupErr) {
          logError({
            error: lookupErr, request,
            metadata: { source: 'quick_payment_link', step: 'client_lookup' },
          });
          return apiServerError();
        }
        if (existing) clientId = existing.id;
      } else {
        clientEmail = mintPlaceholderEmail();
      }
    }

    if (!clientId) {
      const newClientId = generateId('cl');
      const { error: clientErr } = await supabase.from('pyra_clients').insert({
        id: newClientId,
        name: input.name,
        email: clientEmail,
        // NOT NULL with no default, and a walk-in has no company — the same
        // coalesce-to-name the CRM conversion route uses.
        company: input.name,
        phone: input.phone,
        password_hash: 'no_portal_access',
        portal_active: false,
        is_active: true,
        role: 'client',
        source: 'quick_payment_link',
        created_by: auth.pyraUser.username,
      });
      if (clientErr) {
        logError({
          error: clientErr, request,
          metadata: { source: 'quick_payment_link', step: 'client_insert' },
        });
        return apiServerError();
      }
      clientId = newClientId;
      created.clientId = newClientId;
    }

    // ── 1b. Link the lead to the customer ────────────────────────────────
    // Only when the operator picked a lead that had no customer yet. This
    // mirrors /api/crm/leads/[id]/link-client exactly, INCLUDING its locked
    // invariants: `is_converted` and `name` are untouched and the lead stays
    // in its stage. Taking a payment is not the same event as converting the
    // lead, and conflating them here would quietly rewrite pipeline history.
    if (lead && !lead.client_id) {
      // Writing to a CRM row needs the CRM permission, not just finance's.
      if (!hasPermission(auth.pyraUser.rolePermissions, 'leads.update')) {
        // Do NOT fail the payment over this. The money is the point; the link
        // is a convenience, and the response says plainly that it was skipped.
        leadLinkSkippedReason = 'no_permission';
      } else {
        const { error: linkLeadErr } = await supabase
          .from('pyra_sales_leads')
          .update({ client_id: clientId, updated_at: new Date().toISOString() })
          .eq('id', lead.id)
          // Conditional: a concurrent link wins and we leave it alone rather
          // than overwriting whichever customer got there first.
          .is('client_id', null);
        if (linkLeadErr) {
          logError({
            error: linkLeadErr, request,
            metadata: { source: 'quick_payment_link', step: 'lead_link', lead_id: lead.id },
          });
          await rollback(supabase, created, 'lead_link');
          return apiServerError();
        }
        created.linkedLeadId = lead.id;
        leadLinked = true;

        // Lead timeline row — same shape the link-client route writes, so the
        // existing renderer produces the right Arabic title with no new
        // activity_type. `.then()` is required: the Supabase builder is lazily
        // thenable and a bare `void` never executes it.
        supabase
          .from('pyra_lead_activities')
          .insert({
            id: generateId('la'),
            lead_id: lead.id,
            activity_type: 'field_updated',
            description: 'تم ربط العميل المحتمل بحساب عميل عند إنشاء رابط دفع سريع', // i18n-exempt: persisted timeline content, not a response message
            metadata: {
              source: 'quick_payment_link',
              client_id: clientId,
              lead_stage_at_link: lead.stage_id,
              field: 'client_id',
            },
            created_by: auth.pyraUser.username,
          })
          .then(({ error: e }) => {
            if (e) console.error('[quick-payment-link activity] insert failed:', e.message);
          });

        logActivity(
          auth.pyraUser.username,
          auth.pyraUser.display_name,
          `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`,
          `/dashboard/crm/leads/${lead.id}`,
          { lead_id: lead.id, client_id: clientId, source: 'quick_payment_link' },
          request.headers.get('x-forwarded-for') || undefined,
        );
      }
    }

    // ── 2. Invoice (SENT, total = BASE) ──────────────────────────────────
    const invoiceId = generateId('inv');
    const invoiceNumber = await generateNextInvoiceNumber(supabase);
    const today = dubaiDayKey();

    const { error: invoiceErr } = await supabase.from('pyra_invoices').insert({
      id: invoiceId,
      invoice_number: invoiceNumber,
      client_id: clientId,
      status: INVOICE_STATUS.SENT,
      issue_date: today,
      // Payable now — the whole point is a link the customer pays on the spot.
      // A later due date would only mean the invoice sits "not yet overdue"
      // while the cash is already expected.
      due_date: today,
      currency: input.currency,
      subtotal: input.amount,
      // No VAT line. The owner types the amount the customer pays, and adding
      // tax on top would charge more than was quoted at the counter. This
      // matches the live `vat_rate` setting (0) rather than overriding it.
      tax_rate: 0,
      tax_amount: 0,
      discount_type: null,
      discount_value: 0,
      discount_amount: 0,
      total: input.amount,
      amount_paid: 0,
      amount_due: input.amount,
      notes: input.description,
      company_name: settingsMap.company_name || null,
      company_logo: settingsMap.company_logo || null,
      client_name: invoiceClientName,
      client_email: clientEmail,
      client_company: invoiceClientCompany,
      client_phone: invoiceClientPhone,
      created_by: auth.pyraUser.username,
      // bank_details is deliberately NOT set: this invoice is only ever seen
      // through a public forwardable URL, and the public payload excludes bank
      // details anyway (D-1). Leaving the column null means a future change to
      // that allowlist still cannot leak an IBAN from these rows.
    });
    if (invoiceErr) {
      logError({
        error: invoiceErr, request,
        metadata: { source: 'quick_payment_link', step: 'invoice_insert', invoice_number: invoiceNumber },
      });
      await rollback(supabase, created, 'invoice_insert');
      return apiServerError();
    }
    created.invoiceId = invoiceId;

    // ── 3. Line item ─────────────────────────────────────────────────────
    const { error: itemErr } = await supabase.from('pyra_invoice_items').insert({
      id: generateId('ii'),
      invoice_id: invoiceId,
      sort_order: 1,
      description: input.description || input.name,
      quantity: 1,
      rate: input.amount,
      amount: input.amount,
    });
    if (itemErr) {
      logError({
        error: itemErr, request,
        metadata: { source: 'quick_payment_link', step: 'item_insert', invoice_id: invoiceId },
      });
      await rollback(supabase, created, 'item_insert');
      return apiServerError();
    }

    // ── 4. Public link ───────────────────────────────────────────────────
    // A plain insert, not the quote route's revoke-then-insert: that pattern
    // exists because a quote can be re-shared and idx_document_links_one_live
    // would 23505 on the second mint. This invoice was created microseconds
    // ago by this same request, so no prior link for it can exist. A 23505
    // here would mean something is very wrong, and is treated as a failure
    // rather than quietly papered over.
    //
    // expires_at is null (never expires) on purpose. This one URL is the
    // customer's view, payment and receipt — an expiry would delete their
    // receipt. Revocation is still available and, per classifyLinkState,
    // always wins.
    const token = generateDocumentLinkToken();
    const linkId = generateId('dl');
    const { error: linkErr } = await supabase.from('pyra_document_links').insert({
      id: linkId,
      entity_type: 'invoice',
      entity_id: invoiceId,
      token,
      content_hash: null,
      expires_at: null,
      created_by: auth.pyraUser.username,
    });
    if (linkErr) {
      logError({
        error: linkErr, request,
        metadata: { source: 'quick_payment_link', step: 'link_insert', invoice_id: invoiceId },
      });
      await rollback(supabase, created, 'link_insert');
      return apiServerError();
    }
    created.linkId = linkId;

    // ── 5. Stripe Checkout session ───────────────────────────────────────
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://workspace.pyramedia.cloud';
    const publicUrl = `${appUrl}/d/${token}`;
    const stripeCurrency = input.currency.toLowerCase();

    // Two line items, not one grossed-up line: the payer must see the card fee
    // itemised BEFORE committing, not discover it on the statement.
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: stripeCurrency,
          product_data: {
            name: `Invoice ${invoiceNumber}`,
            description: input.description || input.name,
          },
          unit_amount: Math.round(input.amount * 100),
        },
        quantity: 1,
      },
    ];
    if (surcharge > 0) {
      lineItems.push({
        price_data: {
          currency: stripeCurrency,
          product_data: { name: `Card processing fee (${surchargePercent}%)` },
          unit_amount: Math.round(surcharge * 100),
        },
        quantity: 1,
      });
    }

    let session: Stripe.Checkout.Session;
    try {
      const stripe = await getStripeClient();
      session = await stripe.checkout.sessions.create(
        {
          line_items: lineItems,
          mode: 'payment',
          // Both URLs land on the same public page — view, pay and receipt are
          // one address so a walk-in only ever has one thing to keep.
          // `{CHECKOUT_SESSION_ID}` is a Stripe template and must stay literal.
          success_url: `${publicUrl}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: publicUrl,
          ...(input.email ? { customer_email: input.email } : {}),
          metadata: {
            invoice_id: invoiceId,
            invoice_number: invoiceNumber,
            client_id: clientId,
            contract_id: '',
            // SESSION metadata, not intent metadata: both readers of this key
            // (the webhook and the reconcile cron) read session.metadata.
            // Major units — splitGross() parses it as a plain number.
            surcharge_amount: String(surcharge),
            source: 'quick_payment_link',
          },
          // Session metadata does not propagate to the payment intent, and the
          // payment_intent.payment_failed handler reads intent metadata
          // (finance audit 2026-07-02, F-PI-META).
          payment_intent_data: {
            metadata: {
              invoice_id: invoiceId,
              invoice_number: invoiceNumber,
              client_id: clientId,
            },
          },
        },
        { idempotencyKey: `quickpay_${invoiceId}` },
      );
    } catch (stripeErr) {
      logError({
        error: stripeErr, request,
        metadata: { source: 'quick_payment_link', step: 'stripe_session', invoice_id: invoiceId },
      });
      await rollback(supabase, created, 'stripe_session');
      return apiServerError(t('finance.quickPayStripeFailed'));
    }

    // ── 6. Session record ────────────────────────────────────────────────
    // `amount` is the BASE, matching create-checkout — the reconcile cron does
    // its arithmetic against this column, and storing the gross here would put
    // the ledger and the cron permanently out of step.
    const { error: sessionErr } = await supabase.from('pyra_stripe_payments').insert({
      id: generateId('sp'),
      invoice_id: invoiceId,
      stripe_session_id: session.id,
      amount: input.amount,
      currency: input.currency,
      status: 'pending',
      client_id: clientId,
      metadata: {
        checkout_url: session.url,
        // Which rate did we actually charge? Recoverable per payment, even
        // after the settings default changes.
        surcharge_percent: surchargePercent,
        surcharge_amount: surcharge,
        gross,
        source: 'quick_payment_link',
      },
    });

    if (sessionErr) {
      // This row is the ONLY thing the reconcile cron scans, so without it a
      // paid session is invisible to the safety net. Unlike create-checkout —
      // which has already handed a URL to a customer by this point and so must
      // keep going — nobody has seen this session yet, so the honest move is
      // to expire it and undo everything rather than return a link whose
      // payment we could silently lose.
      logError({
        error: sessionErr, request,
        metadata: {
          source: 'quick_payment_link', step: 'session_record',
          invoice_id: invoiceId, session_id: session.id,
        },
      });
      try {
        const stripe = await getStripeClient();
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireErr) {
        // Harmless in practice — the URL was never returned, so nobody can
        // pay it — but it should not disappear silently either.
        logError({
          severity: 'warning', error: expireErr, request,
          metadata: { source: 'quick_payment_link', step: 'session_expire', session_id: session.id },
        });
      }
      await rollback(supabase, created, 'session_record');
      return apiServerError();
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'quick_payment_link_created',
      `/dashboard/invoices/${invoiceId}`,
      {
        invoice_number: invoiceNumber,
        client_id: clientId,
        base: input.amount,
        surcharge,
        gross,
        surcharge_percent: surchargePercent,
        currency: input.currency,
        placeholder_email: !input.email,
        lead_id: lead?.id ?? null,
        lead_linked: leadLinked,
        reused_client: !created.clientId,
      },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess(
      {
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
        client_id: clientId,
        public_url: publicUrl,
        checkout_url: session.url,
        currency: input.currency,
        base: input.amount,
        surcharge,
        gross,
        surcharge_percent: surchargePercent,
        /** False when an existing customer was reused instead of created. */
        client_created: !!created.clientId,
        lead_id: lead?.id ?? null,
        lead_linked: leadLinked,
        /** Set only when the link was deliberately skipped — see 1b. */
        lead_link_skipped: leadLinkSkippedReason,
      },
      undefined,
      201,
    );
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { source: 'quick_payment_link' },
    });
    console.error('POST /api/finance/quick-payment-link error:', err);
    // Anything already written before the throw is unreachable — no URL was
    // ever returned for it — so leaving it behind would only put a phantom
    // client and a permanently unpaid SENT invoice in the finance reports.
    await rollback(supabase, created, 'unhandled_exception');
    return apiServerError();
  }
}
